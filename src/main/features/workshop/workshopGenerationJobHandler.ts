import { createHash } from 'node:crypto'

import { application } from '@application'
import type { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import type { JobHandler } from '@main/core/job/types'
import type { UniqueModelId } from '@shared/data/types/model'
import {
  type WorkshopChangeset,
  type WorkshopGenerationOutput,
  WorkshopGenerationOutputSchema
} from '@shared/types/workshop'

import {
  buildPlannerChangeset,
  buildWriterChangeset,
  WorkshopPlannerOutputSchema,
  WorkshopWriterOutputSchema
} from './workshopAgentOutput'
import { collectWorkshopContext } from './workshopContext'
import { WorkshopKernel } from './WorkshopKernel'
import { buildWorkshopGenerationPrompt } from './workshopPrompts'

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'workshop.generate-proposal': WorkshopGenerationJobPayload
  }
}

export interface WorkshopGenerationJobPayload {
  rootPath: string
  role: 'planner' | 'writer'
  instruction: string
  uniqueModelId: UniqueModelId
  chapterId?: string
}

export function workshopProjectQueue(rootPath: string): string {
  return `workshop.project.${createHash('sha256').update(rootPath).digest('hex').slice(0, 24)}`
}

export function createWorkshopGenerationJobHandler(projectLock: KeyedMutex): JobHandler<WorkshopGenerationJobPayload> {
  return {
    recovery: 'retry',
    defaultQueue: (input) => workshopProjectQueue(input.rootPath),
    defaultConcurrency: 1,
    defaultRetryPolicy: { maxAttempts: 1, backoff: 'none', baseDelayMs: 0, maxDelayMs: 0 },
    defaultTimeoutMs: 30 * 60_000,

    async execute(ctx): Promise<WorkshopGenerationOutput> {
      ctx.signal.throwIfAborted()
      const proposalId = ctx.jobId

      // 幂等恢复:提案已落盘(应用崩溃后重放)则直接完成。
      const context = await projectLock.runExclusive(ctx.input.rootPath, async () => {
        const kernel = await WorkshopKernel.open(ctx.input.rootPath)
        if (await kernel.proposalExists(proposalId)) return null

        return collectWorkshopContext(kernel, {
          targetChapterId: ctx.input.role === 'writer' ? ctx.input.chapterId : undefined
        })
      })
      if (context === null) {
        ctx.reportProgress(100, { stage: 'completed', proposalId, recovered: true })
        return WorkshopGenerationOutputSchema.parse({ proposalId })
      }

      ctx.signal.throwIfAborted()
      ctx.reportProgress(20, { stage: 'generating' })
      const generationPrompt = buildWorkshopGenerationPrompt({
        role: ctx.input.role,
        instruction: ctx.input.chapterId
          ? `${ctx.input.instruction}\n目标章节:${ctx.input.chapterId}`
          : ctx.input.instruction,
        context
      })
      const aiRequest = {
        uniqueModelId: ctx.input.uniqueModelId,
        system: generationPrompt.system,
        prompt: generationPrompt.prompt,
        contextOwner: 'caller' as const,
        requestOptions: { signal: ctx.signal, maxRetries: 0 }
      }
      const now = new Date().toISOString()
      const mapping = { proposalId, role: ctx.input.role, now }

      let title: string
      let rationale: string
      let changes: WorkshopChangeset
      if (ctx.input.role === 'planner') {
        const { object } = await application
          .get('AiService')
          .generateStructured(aiRequest, WorkshopPlannerOutputSchema, { maxRepairAttempts: 1 })
        title = object.title
        rationale = object.rationale
        changes = buildPlannerChangeset(object, mapping)
      } else {
        const { object } = await application
          .get('AiService')
          .generateStructured(aiRequest, WorkshopWriterOutputSchema, { maxRepairAttempts: 1 })
        const existingPlan = context.entities.find(
          (item) => item.collection === 'outline/chapters' && item.entity.id === object.chapterId
        )?.entity
        title = object.title
        rationale = object.rationale
        changes = buildWriterChangeset(object, mapping, existingPlan)
      }

      ctx.signal.throwIfAborted()
      ctx.reportProgress(85, { stage: 'persisting-proposal' })
      await projectLock.runExclusive(ctx.input.rootPath, async () => {
        ctx.signal.throwIfAborted()
        const kernel = await WorkshopKernel.open(ctx.input.rootPath)
        await kernel.createProposal({
          id: proposalId,
          title,
          rationale,
          origin: { kind: 'ai', role: ctx.input.role, proposalId },
          changes
        })
      })

      ctx.reportProgress(100, { stage: 'completed', proposalId })
      return WorkshopGenerationOutputSchema.parse({ proposalId })
    }
  }
}
