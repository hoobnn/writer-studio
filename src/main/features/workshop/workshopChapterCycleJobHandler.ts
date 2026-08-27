import { application } from '@application'
import type { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import type { JobHandler } from '@main/core/job/types'
import type { UniqueModelId } from '@shared/data/types/model'
import {
  WORKSHOP_SCHEMA_VERSION,
  type WorkshopChangeset,
  type WorkshopFinding,
  type WorkshopGenerationOutput,
  WorkshopGenerationOutputSchema
} from '@shared/types/workshop'

import {
  buildPlannerChangeset,
  buildWriterChangeset,
  type WorkshopGuardianOutput,
  WorkshopGuardianOutputSchema,
  type WorkshopWriterOutput,
  WorkshopWriterOutputSchema
} from './workshopAgentOutput'
import { collectWorkshopContext } from './workshopContext'
import { workshopProjectQueue } from './workshopGenerationJobHandler'
import { runWorkshopInvariants } from './workshopInvariants'
import { WorkshopKernel } from './WorkshopKernel'
import { buildWorkshopGenerationPrompt, type WorkshopContextData } from './workshopPrompts'

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'workshop.chapter-cycle': WorkshopChapterCycleJobPayload
  }
}

export interface WorkshopChapterCycleJobPayload {
  rootPath: string
  chapterId: string
  instruction: string
  uniqueModelId: UniqueModelId
}

/** 有界修订:机检发现新增 error 时最多重写这么多轮,仍不过则携带发现交人裁决。 */
const MAX_REVISION_ROUNDS = 2

/** 把写手+守卫的候选产出叠加到实体快照上,得到"假如应用"的图,供不变量引擎评估。 */
function materializeCandidate(
  base: WorkshopContextData,
  chapterId: string,
  guardian: WorkshopGuardianOutput,
  planStatus: string | undefined
): WorkshopContextData {
  const overlay = new Map<string, WorkshopContextData['entities'][number]>()
  for (const item of base.entities) overlay.set(`${item.collection}/${item.entity.id}`, item)
  const stamp = (collection: string, id: string, data: unknown) => {
    overlay.set(`${collection}/${id}`, {
      collection: collection as never,
      entity: {
        schemaVersion: WORKSHOP_SCHEMA_VERSION,
        id,
        origin: { kind: 'ai' },
        updatedAt: new Date().toISOString(),
        data
      }
    })
  }
  for (const write of guardian.entities) stamp(write.collection, write.id, write.data)
  if (planStatus) {
    const plan = overlay.get(`outline/chapters/${chapterId}`)
    if (plan) stamp('outline/chapters', chapterId, { ...(plan.entity.data as object), status: planStatus })
  }
  return {
    card: base.card,
    entities: [...overlay.values()],
    chapterIds: base.chapterIds.includes(chapterId) ? base.chapterIds : [...base.chapterIds, chapterId]
  }
}

export function createWorkshopChapterCycleJobHandler(
  projectLock: KeyedMutex
): JobHandler<WorkshopChapterCycleJobPayload> {
  return {
    recovery: 'retry',
    defaultQueue: (input) => workshopProjectQueue(input.rootPath),
    defaultConcurrency: 1,
    defaultRetryPolicy: { maxAttempts: 1, backoff: 'none', baseDelayMs: 0, maxDelayMs: 0 },
    defaultTimeoutMs: 30 * 60_000,

    async execute(ctx): Promise<WorkshopGenerationOutput> {
      ctx.signal.throwIfAborted()
      const proposalId = ctx.jobId
      const { rootPath, chapterId } = ctx.input

      const base = await projectLock.runExclusive(rootPath, async () => {
        const kernel = await WorkshopKernel.open(rootPath)
        if (await kernel.proposalExists(proposalId)) return null
        return collectWorkshopContext(kernel, { targetChapterId: chapterId })
      })
      if (base === null) {
        ctx.reportProgress(100, { stage: 'completed', proposalId, recovered: true })
        return WorkshopGenerationOutputSchema.parse({ proposalId })
      }

      const aiService = application.get('AiService')
      const baselineErrorKeys = new Set(
        runWorkshopInvariants(base)
          .filter((finding) => finding.severity === 'error')
          .map((finding) => finding.key)
      )

      const callWriter = async (instruction: string): Promise<WorkshopWriterOutput> => {
        const prompt = buildWorkshopGenerationPrompt({
          role: 'writer',
          instruction: `${instruction}\n目标章节:${chapterId}`,
          context: base
        })
        const { object } = await aiService.generateStructured(
          {
            uniqueModelId: ctx.input.uniqueModelId,
            system: prompt.system,
            prompt: prompt.prompt,
            contextOwner: 'caller' as const,
            requestOptions: { signal: ctx.signal, maxRetries: 0 }
          },
          WorkshopWriterOutputSchema,
          { maxRepairAttempts: 1 }
        )
        return object
      }

      const callGuardian = async (draftContent: string): Promise<WorkshopGuardianOutput> => {
        const prompt = buildWorkshopGenerationPrompt({
          role: 'guardian',
          instruction: `提取第 ${chapterId} 章草稿的台账更新`,
          context: { ...base, targetChapter: { chapterId, content: draftContent } }
        })
        const { object } = await aiService.generateStructured(
          {
            uniqueModelId: ctx.input.uniqueModelId,
            system: prompt.system,
            prompt: prompt.prompt,
            contextOwner: 'caller' as const,
            requestOptions: { signal: ctx.signal, maxRetries: 0 }
          },
          WorkshopGuardianOutputSchema,
          { maxRepairAttempts: 1 }
        )
        return object
      }

      let writerOutput: WorkshopWriterOutput | undefined
      let guardianOutput: WorkshopGuardianOutput | undefined
      let newErrors: WorkshopFinding[] = []
      for (let round = 0; round <= MAX_REVISION_ROUNDS; round++) {
        ctx.signal.throwIfAborted()
        ctx.reportProgress(15 + round * 25, { stage: 'drafting', round: round + 1 })
        const revisionNote =
          newErrors.length > 0
            ? `\n上一稿经确定性检查发现以下连续性错误,必须在新稿中消除:\n${newErrors.map((finding) => `- ${finding.detail}`).join('\n')}`
            : ''
        writerOutput = await callWriter(`${ctx.input.instruction}${revisionNote}`)
        if (writerOutput.chapterId !== chapterId) writerOutput = { ...writerOutput, chapterId }

        ctx.signal.throwIfAborted()
        ctx.reportProgress(30 + round * 25, { stage: 'extracting', round: round + 1 })
        guardianOutput = await callGuardian(writerOutput.content)
        if (guardianOutput.chapterId !== chapterId) guardianOutput = { ...guardianOutput, chapterId }

        const candidate = materializeCandidate(base, chapterId, guardianOutput, writerOutput.planStatus)
        newErrors = runWorkshopInvariants(candidate).filter(
          (finding) => finding.severity === 'error' && !baselineErrorKeys.has(finding.key)
        )
        if (newErrors.length === 0) break
      }
      if (!writerOutput || !guardianOutput) throw new Error('Chapter cycle produced no draft')

      // 组装单一原子 changeset:正文 + 计划状态 + 台账更新。
      const now = new Date().toISOString()
      const existingPlan = base.entities.find(
        (item) => item.collection === 'outline/chapters' && item.entity.id === chapterId
      )?.entity
      const changes: WorkshopChangeset = [
        ...buildWriterChangeset(writerOutput, { proposalId, role: 'writer', now }, existingPlan),
        ...buildPlannerChangeset(guardianOutput, { proposalId, role: 'guardian', now })
      ]
      const checkNote =
        newErrors.length > 0
          ? `\n[机检未通过,遗留 ${newErrors.length} 项错误待人工裁决]\n${newErrors.map((finding) => `- ${finding.detail}`).join('\n')}`
          : '\n[机检通过:候选稿未引入新的连续性错误]'

      ctx.signal.throwIfAborted()
      ctx.reportProgress(90, { stage: 'persisting-proposal' })
      await projectLock.runExclusive(rootPath, async () => {
        ctx.signal.throwIfAborted()
        const kernel = await WorkshopKernel.open(rootPath)
        await kernel.createProposal({
          id: proposalId,
          title: writerOutput.title,
          rationale: `${writerOutput.rationale}${checkNote}`,
          origin: { kind: 'ai', role: 'writer', proposalId },
          changes
        })
      })

      ctx.reportProgress(100, { stage: 'completed', proposalId })
      return WorkshopGenerationOutputSchema.parse({ proposalId })
    }
  }
}
