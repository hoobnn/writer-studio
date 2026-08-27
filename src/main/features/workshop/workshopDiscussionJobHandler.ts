import { application } from '@application'
import type { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import type { JobHandler } from '@main/core/job/types'
import type { UniqueModelId } from '@shared/data/types/model'
import * as z from 'zod'

import {
  buildPlannerChangeset,
  buildWriterChangeset,
  type WorkshopDiscussionAction,
  WorkshopDiscussionOutputSchema
} from './workshopAgentOutput'
import { collectWorkshopContext } from './workshopContext'
import {
  appendDiscussionMessage,
  discussionMessageExists,
  readDiscussion,
  WORKSHOP_MAIN_DISCUSSION_ID
} from './workshopDiscussionStore'
import { workshopProjectQueue } from './workshopGenerationJobHandler'
import { WorkshopKernel } from './WorkshopKernel'
import { buildWorkshopDiscussionPrompt } from './workshopPrompts'

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'workshop.discussion-turn': WorkshopDiscussionTurnJobPayload
  }
}

export interface WorkshopDiscussionTurnJobPayload {
  rootPath: string
  uniqueModelId: UniqueModelId
}

const TurnOutputSchema = z.strictObject({ messageId: z.string(), proposalId: z.string().optional() })
type TurnOutput = z.infer<typeof TurnOutputSchema>

function actionRole(action: WorkshopDiscussionAction): 'planner' | 'writer' {
  return action.kind === 'plan' ? 'planner' : 'writer'
}

export function createWorkshopDiscussionJobHandler(
  projectLock: KeyedMutex
): JobHandler<WorkshopDiscussionTurnJobPayload> {
  return {
    recovery: 'retry',
    defaultQueue: (input) => workshopProjectQueue(input.rootPath),
    defaultConcurrency: 1,
    defaultRetryPolicy: { maxAttempts: 1, backoff: 'none', baseDelayMs: 0, maxDelayMs: 0 },
    defaultTimeoutMs: 10 * 60_000,

    async execute(ctx): Promise<TurnOutput> {
      ctx.signal.throwIfAborted()
      const messageId = ctx.jobId
      const proposalId = `${ctx.jobId}-p`

      const prepared = await projectLock.runExclusive(ctx.input.rootPath, async () => {
        const kernel = await WorkshopKernel.open(ctx.input.rootPath)
        if (await discussionMessageExists(kernel.rootPath, messageId)) return null
        // 崩溃恢复:提案已落盘但消息缺失时,从提案元数据恢复回复文本,不重呼模型。
        if (await kernel.proposalExists(proposalId)) {
          const proposal = await kernel.readProposal(proposalId)
          await appendDiscussionMessage(kernel.rootPath, {
            id: messageId,
            role: 'assistant',
            content: proposal.rationale || proposal.title,
            createdAt: new Date().toISOString(),
            proposalId
          })
          return null
        }
        return {
          history: await readDiscussion(kernel.rootPath),
          context: await collectWorkshopContext(kernel)
        }
      })
      if (prepared === null) {
        ctx.reportProgress(100, { stage: 'completed', messageId, recovered: true })
        return TurnOutputSchema.parse({ messageId })
      }

      ctx.signal.throwIfAborted()
      ctx.reportProgress(20, { stage: 'generating' })
      const generationPrompt = buildWorkshopDiscussionPrompt(prepared)
      const { object } = await application.get('AiService').generateStructured(
        {
          uniqueModelId: ctx.input.uniqueModelId,
          system: generationPrompt.system,
          prompt: generationPrompt.prompt,
          contextOwner: 'caller' as const,
          requestOptions: { signal: ctx.signal, maxRetries: 0 }
        },
        WorkshopDiscussionOutputSchema,
        { maxRepairAttempts: 1 }
      )

      ctx.signal.throwIfAborted()
      ctx.reportProgress(85, { stage: 'persisting' })
      const result = await projectLock.runExclusive(ctx.input.rootPath, async () => {
        ctx.signal.throwIfAborted()
        const kernel = await WorkshopKernel.open(ctx.input.rootPath)
        let attachedProposalId: string | undefined
        if (object.action) {
          const role = actionRole(object.action)
          const mapping = { proposalId, role, now: new Date().toISOString() }
          const changes =
            object.action.kind === 'plan'
              ? buildPlannerChangeset(object.action.proposal, mapping)
              : buildWriterChangeset(
                  object.action.proposal,
                  mapping,
                  (await kernel.listEntities('outline/chapters')).find(
                    (entity) => object.action?.kind === 'draft' && entity.id === object.action.proposal.chapterId
                  )
                )
          await kernel.createProposal({
            id: proposalId,
            title: object.action.proposal.title,
            rationale: object.action.proposal.rationale,
            origin: { kind: 'ai', role, proposalId, discussionId: WORKSHOP_MAIN_DISCUSSION_ID },
            changes
          })
          attachedProposalId = proposalId
        }
        await appendDiscussionMessage(kernel.rootPath, {
          id: messageId,
          role: 'assistant',
          content: object.reply,
          createdAt: new Date().toISOString(),
          proposalId: attachedProposalId
        })
        return { messageId, proposalId: attachedProposalId }
      })

      ctx.reportProgress(100, { stage: 'completed', ...result })
      return TurnOutputSchema.parse(result)
    }
  }
}
