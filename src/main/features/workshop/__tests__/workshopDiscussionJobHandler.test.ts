import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { application } from '@application'
import { runStructuredGeneration } from '@main/ai/structuredOutput'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWorkshopDiscussionJobHandler,
  type WorkshopDiscussionTurnJobPayload
} from '../workshopDiscussionJobHandler'
import { appendDiscussionMessage, readDiscussion } from '../workshopDiscussionStore'
import { WorkshopKernel } from '../WorkshopKernel'

vi.mock('@application', async () => {
  const mod = await import('@test-mocks/main/application')
  return mod.mockApplicationFactory()
})

const roots: string[] = []
async function newProject(): Promise<WorkshopKernel> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-discuss-'))
  roots.push(parent)
  return WorkshopKernel.createProject(path.join(parent, 'novel'), { title: '讨论测试' })
}

function jobContext(jobId: string, input: WorkshopDiscussionTurnJobPayload) {
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

describe('workshopDiscussionJobHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  it('纯回复回合:追加助手消息,不产生提案', async () => {
    const kernel = await newProject()
    await appendDiscussionMessage(kernel.rootPath, {
      id: 'u1',
      role: 'user',
      content: '主角应该是什么性格?',
      createdAt: new Date().toISOString()
    })
    stubAiService([JSON.stringify({ reply: '建议冷静克制,与世界的荒诞形成反差。你怎么看?' })])
    const handler = createWorkshopDiscussionJobHandler(new KeyedMutex())
    const output = await handler.execute(
      jobContext('turn-1', { rootPath: kernel.rootPath, uniqueModelId: 'cherryai:test' as never }) as never
    )
    expect(output).toEqual({ messageId: 'turn-1' })
    const messages = await readDiscussion(kernel.rootPath)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[1].proposalId).toBeUndefined()
    expect(await kernel.listProposals()).toEqual([])
  })

  it('带 action 的回合:落盘提案并在消息上挂 proposalId,溯源含 discussionId', async () => {
    const kernel = await newProject()
    await appendDiscussionMessage(kernel.rootPath, {
      id: 'u1',
      role: 'user',
      content: '就按刚才讨论的,把主角定下来。',
      createdAt: new Date().toISOString()
    })
    stubAiService([
      JSON.stringify({
        reply: '好,主角设定如下,已落成提案等你评审。',
        action: {
          kind: 'plan',
          proposal: {
            title: '确定主角设定',
            rationale: '依据讨论结论',
            entities: [{ collection: 'codex/characters', id: 'lin-yuan', data: { name: '林远', role: '主角' } }]
          }
        }
      })
    ])
    const handler = createWorkshopDiscussionJobHandler(new KeyedMutex())
    const output = await handler.execute(
      jobContext('turn-2', { rootPath: kernel.rootPath, uniqueModelId: 'cherryai:test' as never }) as never
    )
    expect(output).toEqual({ messageId: 'turn-2', proposalId: 'turn-2-p' })

    const messages = await readDiscussion(kernel.rootPath)
    expect(messages[1].proposalId).toBe('turn-2-p')
    const proposal = await kernel.readProposal('turn-2-p')
    expect(proposal.origin).toEqual({ kind: 'ai', role: 'planner', proposalId: 'turn-2-p', discussionId: 'main' })
    await kernel.applyProposal('turn-2-p')
    expect((await kernel.readEntity<{ name: string }>('codex/characters', 'lin-yuan')).data.name).toBe('林远')
  })

  it('消息已存在时幂等返回,不重呼模型', async () => {
    const kernel = await newProject()
    await appendDiscussionMessage(kernel.rootPath, {
      id: 'turn-3',
      role: 'assistant',
      content: '既有回复',
      createdAt: new Date().toISOString()
    })
    const generate = stubAiService([])
    const handler = createWorkshopDiscussionJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('turn-3', { rootPath: kernel.rootPath, uniqueModelId: 'cherryai:test' as never }) as never
    )
    expect(generate).not.toHaveBeenCalled()
    expect((await readDiscussion(kernel.rootPath)).filter((m) => m.id === 'turn-3')).toHaveLength(1)
  })

  it('崩溃恢复:提案已落盘但消息缺失时,从提案元数据恢复消息', async () => {
    const kernel = await newProject()
    await kernel.createProposal({
      id: 'turn-4-p',
      title: '恢复用提案',
      rationale: '恢复出的回复文本',
      origin: { kind: 'ai', role: 'planner', proposalId: 'turn-4-p', discussionId: 'main' },
      changes: [{ op: 'write_chapter', chapterId: 'ch-0001', content: 'x' }]
    })
    const generate = stubAiService([])
    const handler = createWorkshopDiscussionJobHandler(new KeyedMutex())
    await handler.execute(
      jobContext('turn-4', { rootPath: kernel.rootPath, uniqueModelId: 'cherryai:test' as never }) as never
    )
    expect(generate).not.toHaveBeenCalled()
    const messages = await readDiscussion(kernel.rootPath)
    expect(messages[0]).toMatchObject({ id: 'turn-4', content: '恢复出的回复文本', proposalId: 'turn-4-p' })
  })
})
