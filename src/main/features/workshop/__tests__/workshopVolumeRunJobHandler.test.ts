import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { application } from '@application'
import { runStructuredGeneration } from '@main/ai/structuredOutput'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkshopKernel } from '../WorkshopKernel'
import { createWorkshopVolumeRunJobHandler, type WorkshopVolumeRunJobPayload } from '../workshopVolumeRunJobHandler'

vi.mock('@application', async () => {
  const mod = await import('@test-mocks/main/application')
  return mod.mockApplicationFactory()
})

const roots: string[] = []
async function newProjectWithVolume(): Promise<WorkshopKernel> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-volume-'))
  roots.push(parent)
  const kernel = await WorkshopKernel.createProject(path.join(parent, 'novel'), { title: '整卷测试' })
  const now = new Date().toISOString()
  await kernel.commitCanon({
    title: '铺底',
    origin: { kind: 'human' },
    changes: [
      {
        op: 'write_entity',
        collection: 'outline/volumes',
        id: 'vol-1',
        entity: {
          schemaVersion: 1,
          id: 'vol-1',
          origin: { kind: 'human' },
          updatedAt: now,
          data: { title: '第一卷', chapterIds: ['ch-0001', 'ch-0002'] }
        }
      }
    ]
  })
  return kernel
}

function jobContext(jobId: string, input: WorkshopVolumeRunJobPayload) {
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

const writerDraft = (chapterId: string, content: string) =>
  JSON.stringify({ title: `${chapterId} 成稿`, chapterId, content })
const guardianExtract = (chapterId: string) =>
  JSON.stringify({
    title: `${chapterId} 台账`,
    chapterId,
    entities: [{ collection: 'ledger/summaries', id: chapterId, data: { summary: `${chapterId} 摘要` } }]
  })
const reviewerPass = () => JSON.stringify({ verdict: 'pass' })

describe('workshopVolumeRunJobHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  it('auto 关卡逐章推进:每章通过即入正史,卷完成后停止', async () => {
    const kernel = await newProjectWithVolume()
    stubAiService([
      writerDraft('ch-0001', '第一章正文。'),
      guardianExtract('ch-0001'),
      reviewerPass(),
      writerDraft('ch-0002', '第二章正文。'),
      guardianExtract('ch-0002'),
      reviewerPass()
    ])
    const handler = createWorkshopVolumeRunJobHandler(new KeyedMutex())
    const output = await handler.execute(
      jobContext('vol-run-1', {
        rootPath: kernel.rootPath,
        volumeId: 'vol-1',
        instruction: '按卷推进',
        models: { writer: 'cherryai:test', guardian: 'cherryai:test', reviewer: 'cherryai:test' } as never,
        gate: 'auto',
        maxChapters: 10
      }) as never
    )
    expect(output).toEqual({ completedChapterIds: ['ch-0001', 'ch-0002'], stopReason: 'volume_done' })
    expect(await kernel.readChapter('ch-0001')).toBe('第一章正文。')
    expect(await kernel.readChapter('ch-0002')).toBe('第二章正文。')
    const timeline = await kernel.timeline()
    expect(timeline.filter((entry) => entry.kind === 'proposal_applied')).toHaveLength(2)
  })

  it('质量关未过时停止连跑,遗留 pending 提案交人裁决', async () => {
    const kernel = await newProjectWithVolume()
    // 三轮写手+守卫全部产出无解释复活 → 修订预算耗尽,提案 pending。
    await kernel.commitCanon({
      title: '死亡入档',
      origin: { kind: 'human' },
      changes: [
        {
          op: 'write_entity',
          collection: 'outline/volumes',
          id: 'vol-1',
          entity: {
            schemaVersion: 1,
            id: 'vol-1',
            origin: { kind: 'human' },
            updatedAt: new Date().toISOString(),
            data: { title: '第一卷', chapterIds: ['ch-0000', 'ch-0001', 'ch-0002'] }
          }
        },
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
        },
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
        }
      ]
    })
    const badRound = [
      writerDraft('ch-0001', '林远又活了。'),
      JSON.stringify({
        title: 'ch-0001 台账',
        chapterId: 'ch-0001',
        entities: [
          { collection: 'ledger/summaries', id: 'ch-0001', data: { summary: '复活' } },
          {
            collection: 'ledger/states',
            id: 's1',
            data: {
              timelineId: 'main',
              characterId: 'hero',
              chapterId: 'ch-0001',
              sequence: 0,
              lifeStatus: 'alive',
              transitionExplanation: '',
              location: '',
              evidence: ''
            }
          }
        ]
      })
    ]
    stubAiService([...badRound, ...badRound, ...badRound])
    const handler = createWorkshopVolumeRunJobHandler(new KeyedMutex())
    const output = (await handler.execute(
      jobContext('vol-run-2', {
        rootPath: kernel.rootPath,
        volumeId: 'vol-1',
        instruction: '按卷推进',
        models: { writer: 'cherryai:test', guardian: 'cherryai:test', reviewer: 'cherryai:test' } as never,
        gate: 'auto',
        maxChapters: 10
      }) as never
    )) as { stopReason: string; pendingProposalId?: string; completedChapterIds: string[] }
    expect(output.stopReason).toBe('quality_gate')
    expect(output.completedChapterIds).toEqual([])
    expect(output.pendingProposalId).toBe('vol-run-2-ch-0001')
    expect((await kernel.readProposal('vol-run-2-ch-0001')).status).toBe('pending')
  })
})
