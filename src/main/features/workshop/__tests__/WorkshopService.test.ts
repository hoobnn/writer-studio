import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { BaseService } from '@main/core/lifecycle/BaseService'
import { workshopErrorCodes } from '@shared/ipc/errors/workshop'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkshopService } from '../WorkshopService'

vi.mock('@application', async () => {
  const mod = await import('@test-mocks/main/application')
  return mod.mockApplicationFactory()
})

const parents: string[] = []
async function newParent(): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-service-'))
  parents.push(parent)
  return parent
}

describe('WorkshopService', () => {
  beforeEach(() => {
    BaseService.resetInstances()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    for (const parent of parents.splice(0)) await rm(parent, { recursive: true, force: true })
  })

  it('创建项目时净化目录名，快照可经 openProject 复现', async () => {
    const service = new WorkshopService()
    const parentDirectory = await newParent()

    const created = await service.createProject({ parentDirectory, title: '星海:迷航?' })
    expect(path.basename(created.rootPath)).toBe('星海 迷航')
    expect(created.card.title).toBe('星海:迷航?')

    const opened = await service.openProject(created.rootPath)
    expect(opened).toEqual(created)
  })

  it('打开不存在的目录报 NOT_A_PROJECT', async () => {
    const service = new WorkshopService()
    await expect(service.openProject('/nonexistent/workshop-project')).rejects.toMatchObject({
      code: workshopErrorCodes.NOT_A_PROJECT
    })
  })

  it('IPC 面的提案闭环：创建 → diff → 应用 → 时间线', async () => {
    const service = new WorkshopService()
    const parentDirectory = await newParent()
    const { rootPath } = await service.createProject({ parentDirectory, title: '闭环' })

    const proposal = await service.createProposal({
      rootPath,
      title: '写第一章',
      origin: { kind: 'ai', role: 'writer' },
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: '正文。' }]
    })
    const { changes } = await service.readProposalChanges({ rootPath, id: proposal.id })
    expect(changes).toEqual([{ filepath: 'manuscript/ch-001.md', before: null, after: '正文。' }])

    await service.applyProposal({ rootPath, id: proposal.id })
    expect(await service.readChapter({ rootPath, chapterId: 'ch-001' })).toEqual({ content: '正文。' })

    const { entries } = await service.listTimeline({ rootPath, limit: 10 })
    expect(entries.map((entry) => entry.kind)).toEqual(['proposal_applied', 'init'])
    expect((await service.openProject(rootPath)).chapterIds).toEqual(['ch-001'])
  })

  it('章节提案应用后自动入队守卫任务;守卫提案应用不再触发', async () => {
    const { mockJobManager } = await import('@test-mocks/main/application')
    const service = new WorkshopService()
    const parentDirectory = await newParent()
    const { rootPath } = await service.createProject({ parentDirectory, title: '守卫触发' })

    const chapterProposal = await service.createProposal({
      rootPath,
      title: '写第一章',
      origin: { kind: 'ai', role: 'writer' },
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: '正文。' }]
    })
    await service.applyProposal({ rootPath, id: chapterProposal.id })
    const enqueueCalls = mockJobManager.enqueue.mock.calls as unknown as [
      string,
      { role: string; chapterId?: string }
    ][]
    const guardianCalls = enqueueCalls.filter(
      ([type, payload]) => type === 'workshop.generate-proposal' && payload.role === 'guardian'
    )
    expect(guardianCalls).toHaveLength(1)
    expect(guardianCalls[0][1].chapterId).toBe('ch-001')

    mockJobManager.enqueue.mockClear()
    const guardianProposal = await service.createProposal({
      rootPath,
      title: '台账更新',
      origin: { kind: 'ai', role: 'guardian' },
      changes: [
        {
          op: 'write_entity',
          collection: 'ledger/summaries',
          id: 'ch-001',
          entity: {
            schemaVersion: 1,
            id: 'ch-001',
            origin: { kind: 'ai', role: 'guardian' },
            updatedAt: new Date().toISOString(),
            data: { summary: '第一章摘要' }
          }
        }
      ]
    })
    await service.applyProposal({ rootPath, id: guardianProposal.id })
    expect(mockJobManager.enqueue).not.toHaveBeenCalled()
  })
})
