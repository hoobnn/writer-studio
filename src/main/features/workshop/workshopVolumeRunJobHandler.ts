import type { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import type { JobHandler } from '@main/core/job/types'
import * as z from 'zod'

import { produceChapterProposal, type WorkshopCycleModels } from './workshopChapterCycleJobHandler'
import { workshopProjectQueue } from './workshopGenerationJobHandler'
import { WorkshopKernel } from './WorkshopKernel'

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'workshop.volume-run': WorkshopVolumeRunJobPayload
  }
}

export interface WorkshopVolumeRunJobPayload {
  rootPath: string
  volumeId: string
  instruction: string
  models: WorkshopCycleModels
  /** auto:机检+审校通过即入正史并续写下一章;review:产出一章提案后暂停等人。 */
  gate: 'auto' | 'review'
  maxChapters: number
}

const VolumeRunOutputSchema = z.strictObject({
  completedChapterIds: z.array(z.string()),
  pendingProposalId: z.string().optional(),
  stopReason: z.enum(['volume_done', 'quality_gate', 'review_gate', 'max_chapters', 'stale_canon'])
})
type VolumeRunOutput = z.infer<typeof VolumeRunOutputSchema>

/** 整卷流水线:按卷序对缺正文的章节循环执行单章生产;成本护栏由 maxChapters 承担。 */
export function createWorkshopVolumeRunJobHandler(projectLock: KeyedMutex): JobHandler<WorkshopVolumeRunJobPayload> {
  return {
    recovery: 'retry',
    defaultQueue: (input) => workshopProjectQueue(input.rootPath),
    defaultConcurrency: 1,
    defaultRetryPolicy: { maxAttempts: 1, backoff: 'none', baseDelayMs: 0, maxDelayMs: 0 },
    defaultTimeoutMs: 6 * 60 * 60_000,

    async execute(ctx): Promise<VolumeRunOutput> {
      const { rootPath, volumeId, gate } = ctx.input
      const completedChapterIds: string[] = []

      for (let index = 0; index < ctx.input.maxChapters; index++) {
        ctx.signal.throwIfAborted()
        // 每轮重读卷与正文状态:上一章入正史后目标集合会缩小,人工并发编辑也被吸收。
        const nextChapterId = await projectLock.runExclusive(rootPath, async () => {
          const kernel = await WorkshopKernel.open(rootPath)
          const volume = await kernel.readEntity<{ chapterIds: string[] }>('outline/volumes', volumeId)
          const written = new Set(await kernel.listChapterIds())
          for (const chapterId of volume.data.chapterIds) {
            if (!written.has(chapterId)) return chapterId
            if ((await kernel.readChapter(chapterId)).trim() === '') return chapterId
          }
          return null
        })
        if (nextChapterId === null) {
          return VolumeRunOutputSchema.parse({ completedChapterIds, stopReason: 'volume_done' })
        }

        ctx.reportProgress(Math.min(95, Math.round((index / ctx.input.maxChapters) * 100)), {
          stage: 'chapter',
          chapterId: nextChapterId,
          completed: completedChapterIds.length
        })
        const proposalId = `${ctx.jobId}-${nextChapterId}`
        const result = await produceChapterProposal({
          rootPath,
          chapterId: nextChapterId,
          instruction: ctx.input.instruction,
          models: ctx.input.models,
          proposalId,
          review: true,
          signal: ctx.signal,
          projectLock
        })

        const applied = await projectLock.runExclusive(rootPath, async () => {
          const kernel = await WorkshopKernel.open(rootPath)
          const proposal = await kernel.readProposal(proposalId)
          if (proposal.status === 'applied') return true
          if (proposal.status !== 'pending') return false
          if (gate === 'review' || !result.clean) return false
          if (proposal.stale) return false
          await kernel.applyProposal(proposalId)
          return true
        })
        if (!applied) {
          return VolumeRunOutputSchema.parse({
            completedChapterIds,
            pendingProposalId: proposalId,
            stopReason: gate === 'review' ? 'review_gate' : result.clean ? 'stale_canon' : 'quality_gate'
          })
        }
        completedChapterIds.push(nextChapterId)
      }
      return VolumeRunOutputSchema.parse({ completedChapterIds, stopReason: 'max_chapters' })
    }
  }
}
