import fs from 'node:fs'
import path from 'node:path'

import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type {
  WorkshopCanonCommitInput,
  WorkshopChapterReadInput,
  WorkshopChapterReadResult,
  WorkshopEntity,
  WorkshopEntityListInput,
  WorkshopEntityListResult,
  WorkshopEntityReadInput,
  WorkshopProjectCreateInput,
  WorkshopProjectSnapshot,
  WorkshopProposal,
  WorkshopProposalChangesResult,
  WorkshopProposalCreateInput,
  WorkshopProposalListInput,
  WorkshopProposalListResult,
  WorkshopProposalReadInput,
  WorkshopRollbackInput,
  WorkshopTimelineEntry,
  WorkshopTimelineListInput,
  WorkshopTimelineListResult
} from '@shared/types/workshop'

import { WorkshopError, workshopErrorCodes } from './workshopErrors'
import { WorkshopKernel } from './WorkshopKernel'

function sanitizeProjectDirectory(title: string): string {
  const sanitized = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 100)
    .trim()
  return sanitized || 'novel'
}

/**
 * 小说工坊服务层：以项目为粒度串行化内核操作，并作为 IPC handler 的唯一入口。
 * 内核自身不做互斥（见 WorkshopKernel 的并发约束），锁的粒度与旧 writer 一致。
 */
@Injectable('WorkshopService')
@ServicePhase(Phase.WhenReady)
export class WorkshopService extends BaseService {
  private readonly projectLock = new KeyedMutex()

  private async canonicalRoot(rootPath: string): Promise<string> {
    try {
      return await fs.promises.realpath(rootPath)
    } catch {
      throw new WorkshopError(workshopErrorCodes.NOT_A_PROJECT, 'Workshop project directory does not exist', {
        rootPath
      })
    }
  }

  private async withProject<T>(rootPath: string, fn: (kernel: WorkshopKernel) => Promise<T>): Promise<T> {
    const root = await this.canonicalRoot(rootPath)
    return this.projectLock.runExclusive(root, async () => fn(await WorkshopKernel.open(root)))
  }

  private async snapshot(kernel: WorkshopKernel): Promise<WorkshopProjectSnapshot> {
    return {
      rootPath: kernel.rootPath,
      head: await kernel.headCommit(),
      card: await kernel.readProjectCard(),
      chapterIds: await kernel.listChapterIds()
    }
  }

  async createProject(input: WorkshopProjectCreateInput): Promise<WorkshopProjectSnapshot> {
    const parent = await this.canonicalRoot(input.parentDirectory)
    const rootPath = path.join(parent, sanitizeProjectDirectory(input.title))
    return this.projectLock.runExclusive(rootPath, async () => {
      const kernel = await WorkshopKernel.createProject(rootPath, {
        title: input.title,
        genre: input.genre,
        premise: input.premise,
        authorGoal: input.authorGoal,
        targetWordCount: input.targetWordCount
      })
      return this.snapshot(kernel)
    })
  }

  async openProject(rootPath: string): Promise<WorkshopProjectSnapshot> {
    return this.withProject(rootPath, (kernel) => this.snapshot(kernel))
  }

  async listEntities(input: WorkshopEntityListInput): Promise<WorkshopEntityListResult> {
    return this.withProject(input.rootPath, async (kernel) => ({
      entities: await kernel.listEntities(input.collection)
    }))
  }

  async readEntity(input: WorkshopEntityReadInput): Promise<WorkshopEntity> {
    return this.withProject(input.rootPath, (kernel) => kernel.readEntity(input.collection, input.id))
  }

  async readChapter(input: WorkshopChapterReadInput): Promise<WorkshopChapterReadResult> {
    return this.withProject(input.rootPath, async (kernel) => ({
      content: await kernel.readChapter(input.chapterId)
    }))
  }

  async commitCanon(input: WorkshopCanonCommitInput): Promise<WorkshopTimelineEntry> {
    // 经 IPC 到达的 canon 提交一定来自界面上的人工编辑；AI 产出只能走提案。
    return this.withProject(input.rootPath, (kernel) =>
      kernel.commitCanon({ title: input.title, origin: { kind: 'human' }, changes: input.changes })
    )
  }

  async rollback(input: WorkshopRollbackInput): Promise<WorkshopTimelineEntry> {
    return this.withProject(input.rootPath, (kernel) => kernel.rollbackTo(input.commit))
  }

  async createProposal(input: WorkshopProposalCreateInput): Promise<WorkshopProposal> {
    return this.withProject(input.rootPath, (kernel) =>
      kernel.createProposal({
        title: input.title,
        rationale: input.rationale,
        origin: input.origin,
        changes: input.changes
      })
    )
  }

  async listProposals(input: WorkshopProposalListInput): Promise<WorkshopProposalListResult> {
    return this.withProject(input.rootPath, async (kernel) => ({ proposals: await kernel.listProposals() }))
  }

  async readProposal(input: WorkshopProposalReadInput): Promise<WorkshopProposal> {
    return this.withProject(input.rootPath, (kernel) => kernel.readProposal(input.id))
  }

  async readProposalChanges(input: WorkshopProposalReadInput): Promise<WorkshopProposalChangesResult> {
    return this.withProject(input.rootPath, async (kernel) => ({
      changes: await kernel.readProposalChanges(input.id)
    }))
  }

  async applyProposal(input: WorkshopProposalReadInput): Promise<WorkshopTimelineEntry> {
    return this.withProject(input.rootPath, (kernel) => kernel.applyProposal(input.id))
  }

  async rejectProposal(input: WorkshopProposalReadInput): Promise<WorkshopProposal> {
    return this.withProject(input.rootPath, async (kernel) => {
      await kernel.rejectProposal(input.id)
      return kernel.readProposal(input.id)
    })
  }

  async listTimeline(input: WorkshopTimelineListInput): Promise<WorkshopTimelineListResult> {
    return this.withProject(input.rootPath, async (kernel) => ({ entries: await kernel.timeline(input.limit) }))
  }
}
