import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { modelService } from '@data/services/ModelService'
import { providerService } from '@data/services/ProviderService'
import { loggerService } from '@logger'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type {
  WorkshopCanonCommitInput,
  WorkshopChapterReadInput,
  WorkshopChapterReadResult,
  WorkshopDiscussionListInput,
  WorkshopDiscussionListResult,
  WorkshopDiscussionSendInput,
  WorkshopEntity,
  WorkshopEntityListInput,
  WorkshopEntityListResult,
  WorkshopEntityReadInput,
  WorkshopGenerationCancelResult,
  WorkshopGenerationStartInput,
  WorkshopGenerationStartResult,
  WorkshopGenerationStatusResult,
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

import { createWorkshopDiscussionJobHandler } from './workshopDiscussionJobHandler'
import { appendDiscussionMessage, readDiscussion } from './workshopDiscussionStore'
import { WorkshopError, workshopErrorCodes } from './workshopErrors'
import { createWorkshopGenerationJobHandler } from './workshopGenerationJobHandler'
import { WorkshopKernel } from './WorkshopKernel'
import { resolveWorkshopGenerationModel } from './workshopModelPolicy'

const logger = loggerService.withContext('workshopService')

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
@DependsOn(['AiService', 'JobManager'])
export class WorkshopService extends BaseService {
  private readonly projectLock = new KeyedMutex()

  protected onInit(): void {
    const jobManager = application.get('JobManager')
    jobManager.registerHandler('workshop.generate-proposal', createWorkshopGenerationJobHandler(this.projectLock))
    jobManager.registerHandler('workshop.discussion-turn', createWorkshopDiscussionJobHandler(this.projectLock))
  }

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
    const { entry, guardianChapterIds } = await this.withProject(input.rootPath, async (kernel) => {
      const proposal = await kernel.readProposal(input.id)
      const changedChapterIds =
        proposal.status === 'pending' && proposal.origin.role !== 'guardian'
          ? (await kernel.readProposalChanges(input.id))
              .map((change) => /^manuscript\/(.+)\.md$/.exec(change.filepath)?.[1])
              .filter((chapterId): chapterId is string => Boolean(chapterId))
          : []
      return { entry: await kernel.applyProposal(input.id), guardianChapterIds: changedChapterIds }
    })
    // 正文反哺:章节入正史后自动入队守卫任务,产出台账更新提案(仍过人类评审关)。
    for (const chapterId of guardianChapterIds) {
      this.enqueueGuardianTurn(input.rootPath, chapterId)
    }
    return entry
  }

  private enqueueGuardianTurn(rootPath: string, chapterId: string): void {
    try {
      const uniqueModelId = this.resolveGenerationModel(undefined)
      application.get('JobManager').enqueue('workshop.generate-proposal', {
        rootPath,
        role: 'guardian',
        instruction: `提取第 ${chapterId} 章的台账更新`,
        uniqueModelId,
        chapterId
      })
    } catch (error) {
      logger.warn('failed to enqueue guardian turn', { chapterId, error: String(error) })
    }
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

  private resolveGenerationModel(explicit: string | undefined) {
    return resolveWorkshopGenerationModel(
      {
        explicit,
        configuredDefault:
          application.get('PreferenceService').get('feature.quick_assistant.model_id') ??
          application.get('PreferenceService').get('chat.default_model_id')
      },
      {
        getProvider: (providerId) => providerService.getByProviderId(providerId),
        getModel: (providerId, modelId) => modelService.getByKey(providerId, modelId)
      }
    )
  }

  async startGeneration(input: WorkshopGenerationStartInput): Promise<WorkshopGenerationStartResult> {
    const root = await this.canonicalRoot(input.rootPath)
    await WorkshopKernel.open(root)
    const uniqueModelId = this.resolveGenerationModel(input.uniqueModelId)
    const handle = application.get('JobManager').enqueue('workshop.generate-proposal', {
      rootPath: root,
      role: input.role,
      instruction: input.instruction,
      uniqueModelId,
      chapterId: input.chapterId
    })
    return handle.snapshot
  }

  async generationStatus(jobId: string): Promise<WorkshopGenerationStatusResult> {
    const snapshot = await application.get('JobManager').get(jobId)
    if (!snapshot || !this.isWorkshopJob(snapshot.type)) return null
    return snapshot
  }

  async cancelGeneration(jobId: string): Promise<WorkshopGenerationCancelResult> {
    const jobManager = application.get('JobManager')
    const snapshot = await jobManager.get(jobId)
    if (!snapshot || !this.isWorkshopJob(snapshot.type)) return { cancelled: false }
    const result = await jobManager.cancel(jobId, 'Cancelled by workshop')
    return { cancelled: result.outcome === 'cancelled' }
  }

  private isWorkshopJob(type: string): boolean {
    return type === 'workshop.generate-proposal' || type === 'workshop.discussion-turn'
  }

  async listDiscussion(input: WorkshopDiscussionListInput): Promise<WorkshopDiscussionListResult> {
    return this.withProject(input.rootPath, async (kernel) => ({ messages: await readDiscussion(kernel.rootPath) }))
  }

  async sendDiscussionMessage(input: WorkshopDiscussionSendInput): Promise<WorkshopGenerationStartResult> {
    const root = await this.canonicalRoot(input.rootPath)
    const uniqueModelId = this.resolveGenerationModel(input.uniqueModelId)
    await this.projectLock.runExclusive(root, async () => {
      await WorkshopKernel.open(root)
      await appendDiscussionMessage(root, {
        id: randomUUID(),
        role: 'user',
        content: input.content,
        createdAt: new Date().toISOString()
      })
    })
    const handle = application.get('JobManager').enqueue('workshop.discussion-turn', { rootPath: root, uniqueModelId })
    return handle.snapshot
  }
}
