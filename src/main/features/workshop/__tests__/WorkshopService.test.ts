import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { BaseService } from '@main/core/lifecycle/BaseService'
import { workshopErrorCodes } from '@shared/ipc/errors/workshop'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WorkshopService } from '../WorkshopService'

const parents: string[] = []
async function newParent(): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-service-'))
  parents.push(parent)
  return parent
}

describe('WorkshopService', () => {
  beforeEach(() => {
    BaseService.resetInstances()
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
})
