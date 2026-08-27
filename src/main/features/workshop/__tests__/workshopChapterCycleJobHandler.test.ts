import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { application } from '@application'
import { runStructuredGeneration } from '@main/ai/structuredOutput'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWorkshopChapterCycleJobHandler,
  type WorkshopChapterCycleJobPayload
} from '../workshopChapterCycleJobHandler'
import { WorkshopKernel } from '../WorkshopKernel'

vi.mock('@application', async () => {
  const mod = await import('@test-mocks/main/application')
  return mod.mockApplicationFactory()
})

const roots: string[] = []
async function newProject(): Promise<WorkshopKernel> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-cycle-'))
  roots.push(parent)
  const kernel = await WorkshopKernel.createProject(path.join(parent, 'novel'), { title: '循环测试' })
  await kernel.commitCanon({
    title: '铺底',
    origin: { kind: 'human' },
    changes: [
      {
        op: 'write_entity',
        collection: 'codex/characters',
        id: 'hero',
        entity: {
          schemaVersion: 1,
          id: 'hero',
          origin: { kind: 'human' },
          updatedAt: new Date().toISOString(),
          data: { name: '林远' }
        }
      }
    ]
  })
  return kernel
}

function jobContext(jobId: string, input: WorkshopChapterCycleJobPayload) {
  return { jobId, input, signal: new AbortController().signal, reportProgress: vi.fn() }
}

function stubAiService(texts: string[]) {
  const generate = vi.fn()
  for (const text of texts) generate.mockResolvedValueOnce(text)
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

const writerDraft = (content: string) =>
  JSON.stringify({ title: '第一章成稿', rationale: '按要求撰写', chapterId: 'ch-0001', content })

const guardianExtract = (states: { id: string; lifeStatus: string; explanation?: string }[]) =>
  JSON.stringify({
    title: '第一章台账',
    chapterId: 'ch-0001',
    entities: [
      { collection: 'ledger/summaries', id: 'ch-0001', data: { summary: '第一章摘要' } },
      ...states.map((state) => ({
        collection: 'ledger/states',
        id: state.id,
        data: {
          timelineId: 'main',
          characterId: 'hero',
          chapterId: 'ch-0001',
          sequence: 0,
          lifeStatus: state.lifeStatus,
          transitionExplanation: state.explanation ?? '',
          location: '',
          evidence: '正文'
        }
      }))
    ]
  })

describe('workshopChapterCycleJobHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  const reviewerPass = () => JSON.stringify({ verdict: 'pass', notes: '成稿达标' })
  const reviewerRevise = (detail: string) =>
    JSON.stringify({ verdict: 'revise', notes: '', findings: [{ severity: 'error', detail }] })

  it('一轮通过:产出正文+台账的单一原子提案,质量关结论标注在 rationale', async () => {
    const kernel = await newProject()
    const generate = stubAiService([
      writerDraft('风从海上来。'),
      guardianExtract([{ id: 's1', lifeStatus: 'alive' }]),
      reviewerPass()
    ])
    const handler = createWorkshopChapterCycleJobHandler(new KeyedMutex())
    const output = await handler.execute(
      jobContext('cycle-1', {
        rootPath: kernel.rootPath,
        chapterId: 'ch-0001',
        instruction: '写第一章',
        uniqueModelId: 'cherryai:test' as never
      }) as never
    )
    expect(output).toEqual({ proposalId: 'cycle-1' })
    expect(generate).toHaveBeenCalledTimes(3)

    const proposal = await kernel.readProposal('cycle-1')
    expect(proposal.rationale).toContain('机检与审校通过')
    const changes = await kernel.readProposalChanges('cycle-1')
    const files = changes.map((change) => change.filepath).sort()
    expect(files).toEqual(['ledger/states/s1.json', 'ledger/summaries/ch-0001.json', 'manuscript/ch-0001.md'])

    await kernel.applyProposal('cycle-1')
    expect(await kernel.readChapter('ch-0001')).toBe('风从海上来。')
  })

  it('候选稿引入连续性错误时携带发现重写,第二轮通过', async () => {
    const kernel = await newProject()
    // 先在正史埋一个死亡状态,让第一稿的"无解释复活"构成新增 error。
    await kernel.commitCanon({
      title: '死亡入档',
      origin: { kind: 'human' },
      changes: [
        { op: 'write_chapter', chapterId: 'ch-0000', content: '林远死了。' },
        {
          op: 'write_entity',
          collection: 'ledger/states',
          id: 's0',
          entity: {
            schemaVersion: 1,
            id: 's0',
            origin: { kind: 'human' },
            updatedAt: new Date().toISOString(),
            data: {
              timelineId: 'main',
              characterId: 'hero',
              chapterId: 'ch-0000',
              sequence: 0,
              lifeStatus: 'dead',
              transitionExplanation: '',
              location: '',
              evidence: ''
            }
          }
        },
        {
          op: 'write_entity',
          collection: 'ledger/summaries',
          id: 'ch-0000',
          entity: {
            schemaVersion: 1,
            id: 'ch-0000',
            origin: { kind: 'human' },
            updatedAt: new Date().toISOString(),
            data: { summary: '林远死亡。' }
          }
        }
      ]
    })
    const generate = stubAiService([
      writerDraft('林远醒来,毫发无伤。'),
      guardianExtract([{ id: 's1', lifeStatus: 'alive' }]),
      writerDraft('林远在祭坛仪式中复生,代价是十年寿命。'),
      guardianExtract([{ id: 's1', lifeStatus: 'alive', explanation: '祭坛复生仪式' }]),
      reviewerPass()
    ])
    const handler = createWorkshopChapterCycleJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('cycle-2', {
        rootPath: kernel.rootPath,
        chapterId: 'ch-0001',
        instruction: '写复活章',
        uniqueModelId: 'cherryai:test' as never
      }) as never
    )
    expect(generate).toHaveBeenCalledTimes(5)
    const secondWriterPrompt = generate.mock.calls[2][0] as string
    expect(secondWriterPrompt).toContain('连续性错误')
    expect(secondWriterPrompt).toContain('复活')

    const proposal = await kernel.readProposal('cycle-2')
    expect(proposal.rationale).toContain('机检与审校通过')
    await kernel.applyProposal('cycle-2')
    expect(await kernel.readChapter('ch-0001')).toContain('祭坛')
  })

  it('审校要求重写时携带审校发现进入下一轮', async () => {
    const kernel = await newProject()
    const generate = stubAiService([
      writerDraft('第一稿。'),
      guardianExtract([{ id: 's1', lifeStatus: 'alive' }]),
      reviewerRevise('主角动机断裂:没有理由出海'),
      writerDraft('第二稿:为寻找失踪的父亲,林远出海。'),
      guardianExtract([{ id: 's1', lifeStatus: 'alive' }]),
      reviewerPass()
    ])
    const handler = createWorkshopChapterCycleJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('cycle-4', {
        rootPath: kernel.rootPath,
        chapterId: 'ch-0001',
        instruction: '写第一章',
        uniqueModelId: 'cherryai:test' as never
      }) as never
    )
    expect(generate).toHaveBeenCalledTimes(6)
    const secondWriterPrompt = generate.mock.calls[3][0] as string
    expect(secondWriterPrompt).toContain('[审校]')
    expect(secondWriterPrompt).toContain('动机断裂')
    expect((await kernel.readProposal('cycle-4')).rationale).toContain('机检与审校通过')
  })

  it('修订轮次用尽仍有错误时,提案保留并在 rationale 标注待裁决', async () => {
    const kernel = await newProject()
    await kernel.commitCanon({
      title: '死亡入档',
      origin: { kind: 'human' },
      changes: [
        { op: 'write_chapter', chapterId: 'ch-0000', content: '林远死了。' },
        {
          op: 'write_entity',
          collection: 'ledger/states',
          id: 's0',
          entity: {
            schemaVersion: 1,
            id: 's0',
            origin: { kind: 'human' },
            updatedAt: new Date().toISOString(),
            data: {
              timelineId: 'main',
              characterId: 'hero',
              chapterId: 'ch-0000',
              sequence: 0,
              lifeStatus: 'dead',
              transitionExplanation: '',
              location: '',
              evidence: ''
            }
          }
        },
        {
          op: 'write_entity',
          collection: 'ledger/summaries',
          id: 'ch-0000',
          entity: {
            schemaVersion: 1,
            id: 'ch-0000',
            origin: { kind: 'human' },
            updatedAt: new Date().toISOString(),
            data: { summary: '林远死亡。' }
          }
        }
      ]
    })
    const bad = [writerDraft('林远又活了。'), guardianExtract([{ id: 's1', lifeStatus: 'alive' }])]
    const generate = stubAiService([...bad, ...bad, ...bad])
    const handler = createWorkshopChapterCycleJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('cycle-3', {
        rootPath: kernel.rootPath,
        chapterId: 'ch-0001',
        instruction: '写复活章',
        uniqueModelId: 'cherryai:test' as never
      }) as never
    )
    expect(generate).toHaveBeenCalledTimes(6)
    const proposal = await kernel.readProposal('cycle-3')
    expect(proposal.rationale).toContain('待人工裁决')
    expect(proposal.status).toBe('pending')
  })
})
