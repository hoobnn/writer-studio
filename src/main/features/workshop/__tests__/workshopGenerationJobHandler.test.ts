import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { application } from '@application'
import { runStructuredGeneration } from '@main/ai/structuredOutput'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkshopGenerationJobHandler, type WorkshopGenerationJobPayload } from '../workshopGenerationJobHandler'
import { WorkshopKernel } from '../WorkshopKernel'

vi.mock('@application', async () => {
  const mod = await import('@test-mocks/main/application')
  return mod.mockApplicationFactory()
})

const roots: string[] = []
async function newProject(): Promise<WorkshopKernel> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-genjob-'))
  roots.push(parent)
  return WorkshopKernel.createProject(path.join(parent, 'novel'), { title: '生成测试' })
}

function jobContext(jobId: string, input: WorkshopGenerationJobPayload) {
  return {
    jobId,
    input,
    signal: new AbortController().signal,
    reportProgress: vi.fn()
  }
}

/** 让 mock 的 AiService.generateStructured 复用真实校验/修复循环,只 mock 文本生成。 */
function stubAiService(textsByCall: string[]) {
  const generate = vi.fn()
  for (const text of textsByCall) generate.mockResolvedValueOnce(text)
  ;(application.get as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === 'AiService') {
      return {
        generateStructured: (request: { prompt: string }, schema: never, options?: { maxRepairAttempts?: number }) =>
          runStructuredGeneration({
            schema: schema,
            prompt: request.prompt,
            maxRepairAttempts: options?.maxRepairAttempts,
            generate
          })
      }
    }
    throw new Error(`Unexpected application.get(${name})`)
  })
  return generate
}

describe('workshopGenerationJobHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  it('策划输出落为可评审提案,溯源指向本次 job', async () => {
    const kernel = await newProject()
    stubAiService([
      JSON.stringify({
        title: '主角与硬规则',
        rationale: '按要求初始化设定',
        entities: [
          { collection: 'codex/characters', id: 'lin-yuan', data: { name: '林远', role: '主角' } },
          { collection: 'codex/rules', id: 'rule-no-resurrect', data: { kind: 'hard', text: '死亡不可逆转' } }
        ]
      })
    ])
    const handler = createWorkshopGenerationJobHandler(new KeyedMutex())
    const output = await handler.execute(
      jobContext('job-planner-1', {
        rootPath: kernel.rootPath,
        role: 'planner',
        instruction: '建立主角与世界硬规则',
        uniqueModelId: 'cherryai:test-model' as never
      }) as never
    )

    expect(output).toEqual({ proposalId: 'job-planner-1' })
    const proposal = await kernel.readProposal('job-planner-1')
    expect(proposal.status).toBe('pending')
    expect(proposal.origin).toEqual({ kind: 'ai', role: 'planner', proposalId: 'job-planner-1' })
    // 正史未动,应用后实体带 AI 溯源
    await kernel.applyProposal('job-planner-1')
    const hero = await kernel.readEntity<{ name: string }>('codex/characters', 'lin-yuan')
    expect(hero.data.name).toBe('林远')
    expect(hero.origin.proposalId).toBe('job-planner-1')
  })

  it('首次输出畸形时经一次修复成功', async () => {
    const kernel = await newProject()
    const generate = stubAiService([
      '这不是 JSON',
      JSON.stringify({
        title: '修复后的设定',
        entities: [{ collection: 'codex/characters', id: 'a', data: { name: '甲' } }]
      })
    ])
    const handler = createWorkshopGenerationJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('job-repair-1', {
        rootPath: kernel.rootPath,
        role: 'planner',
        instruction: 'x',
        uniqueModelId: 'cherryai:test-model' as never
      }) as never
    )
    expect(generate).toHaveBeenCalledTimes(2)
    expect((await kernel.readProposal('job-repair-1')).title).toBe('修复后的设定')
  })

  it('写手输出写入正文并推进既有章计划状态', async () => {
    const kernel = await newProject()
    await kernel.commitCanon({
      title: '铺底',
      origin: { kind: 'human' },
      changes: [
        {
          op: 'write_entity',
          collection: 'outline/chapters',
          id: 'ch-0001',
          entity: {
            schemaVersion: 1,
            id: 'ch-0001',
            origin: { kind: 'human' },
            updatedAt: new Date().toISOString(),
            data: { title: '第一章', goal: '开场', status: 'planned' }
          }
        }
      ]
    })
    stubAiService([
      JSON.stringify({
        title: '第一章成稿',
        chapterId: 'ch-0001',
        content: '风从海上来。',
        planStatus: 'drafted'
      })
    ])
    const handler = createWorkshopGenerationJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('job-writer-1', {
        rootPath: kernel.rootPath,
        role: 'writer',
        instruction: '写第一章',
        uniqueModelId: 'cherryai:test-model' as never,
        chapterId: 'ch-0001'
      }) as never
    )
    await kernel.applyProposal('job-writer-1')
    expect(await kernel.readChapter('ch-0001')).toBe('风从海上来。')
    const plan = await kernel.readEntity<{ status: string }>('outline/chapters', 'ch-0001')
    expect(plan.data.status).toBe('drafted')
  })

  it('守卫输出限定台账集合并可应用', async () => {
    const kernel = await newProject()
    await kernel.commitCanon({
      title: '第一章入正史',
      origin: { kind: 'human' },
      changes: [{ op: 'write_chapter', chapterId: 'ch-0001', content: '林远抵达灯塔,亲手埋下怀表。' }]
    })
    stubAiService([
      JSON.stringify({
        title: '第一章台账',
        chapterId: 'ch-0001',
        entities: [
          { collection: 'ledger/summaries', id: 'ch-0001', data: { summary: '林远抵达灯塔并埋下怀表。' } },
          {
            collection: 'ledger/facts',
            id: 'fact-watch-buried',
            data: { subject: '怀表', predicate: '被埋在灯塔下', sourceChapterId: 'ch-0001' }
          }
        ]
      })
    ])
    const handler = createWorkshopGenerationJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('job-guardian-1', {
        rootPath: kernel.rootPath,
        role: 'guardian',
        instruction: '提取台账',
        uniqueModelId: 'cherryai:test-model' as never,
        chapterId: 'ch-0001'
      }) as never
    )
    await kernel.applyProposal('job-guardian-1')
    const summary = await kernel.readEntity<{ summary: string }>('ledger/summaries', 'ch-0001')
    expect(summary.data.summary).toBe('林远抵达灯塔并埋下怀表。')
    expect(summary.origin).toMatchObject({ kind: 'ai', role: 'guardian', proposalId: 'job-guardian-1' })
    expect((await kernel.listEntities('ledger/facts')).map((entity) => entity.id)).toEqual(['fact-watch-buried'])
  })

  it('提案已存在时幂等返回,不再调用模型', async () => {
    const kernel = await newProject()
    await kernel.createProposal({
      id: 'job-idem-1',
      title: '既有提案',
      origin: { kind: 'ai', role: 'planner', proposalId: 'job-idem-1' },
      changes: [{ op: 'write_chapter', chapterId: 'ch-0001', content: 'x' }]
    })
    const generate = stubAiService([])
    const handler = createWorkshopGenerationJobHandler(new KeyedMutex())
    const output = await handler.execute(
      jobContext('job-idem-1', {
        rootPath: kernel.rootPath,
        role: 'planner',
        instruction: 'x',
        uniqueModelId: 'cherryai:test-model' as never
      }) as never
    )
    expect(output).toEqual({ proposalId: 'job-idem-1' })
    expect(generate).not.toHaveBeenCalled()
  })
})
