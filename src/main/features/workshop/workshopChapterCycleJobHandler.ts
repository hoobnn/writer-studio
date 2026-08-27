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
  type WorkshopReviewerOutput,
  WorkshopReviewerOutputSchema,
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

/** 循环内部三个角色各自使用的模型(服务层按角色偏好解析后传入)。 */
export interface WorkshopCycleModels {
  writer: UniqueModelId
  guardian: UniqueModelId
  reviewer: UniqueModelId
}

export interface WorkshopChapterCycleJobPayload {
  rootPath: string
  chapterId: string
  instruction: string
  models: WorkshopCycleModels
  /** 是否在机检之后追加审校关卡(默认开)。 */
  review?: boolean
}

/** 有界修订:机检或审校要求重写时最多这么多轮,仍不过则携带发现交人裁决。 */
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

export interface ChapterCycleParams {
  rootPath: string
  chapterId: string
  instruction: string
  models: WorkshopCycleModels
  proposalId: string
  review: boolean
  signal: AbortSignal
  projectLock: KeyedMutex
  reportStage?: (stage: string, round: number) => void
}

export interface ChapterCycleResult {
  proposalId: string
  /** 机检+审校在预算内全部通过。 */
  clean: boolean
  recovered: boolean
}

/**
 * 单章生产循环核心:写手成稿 → 守卫提取台账 → 机检 →(可选)审校 → 有界修订,
 * 最终落为一个"正文+计划状态+台账"的原子提案。整卷流水线按章复用本函数。
 */
export async function produceChapterProposal(params: ChapterCycleParams): Promise<ChapterCycleResult> {
  const { rootPath, chapterId, proposalId, signal } = params
  const base = await params.projectLock.runExclusive(rootPath, async () => {
    const kernel = await WorkshopKernel.open(rootPath)
    if (await kernel.proposalExists(proposalId)) return null
    return collectWorkshopContext(kernel, { targetChapterId: chapterId, retrievalQuery: params.instruction })
  })
  if (base === null) return { proposalId, clean: true, recovered: true }

  const aiService = application.get('AiService')
  const baselineErrorKeys = new Set(
    runWorkshopInvariants(base)
      .filter((finding) => finding.severity === 'error')
      .map((finding) => finding.key)
  )
  const callStructured = async <T>(
    role: 'writer' | 'guardian' | 'reviewer',
    instruction: string,
    schema: never,
    context: WorkshopContextData
  ) => {
    const prompt = buildWorkshopGenerationPrompt({ role, instruction, context })
    const { object } = await aiService.generateStructured(
      {
        uniqueModelId: params.models[role],
        system: prompt.system,
        prompt: prompt.prompt,
        contextOwner: 'caller' as const,
        requestOptions: { signal, maxRetries: 0 }
      },
      schema,
      { maxRepairAttempts: 1 }
    )
    return object as T
  }

  let writerOutput: WorkshopWriterOutput | undefined
  let guardianOutput: WorkshopGuardianOutput | undefined
  let blockingNotes: string[] = []
  let clean = false
  for (let round = 0; round <= MAX_REVISION_ROUNDS; round++) {
    signal.throwIfAborted()
    params.reportStage?.('drafting', round + 1)
    const revisionNote =
      blockingNotes.length > 0
        ? `\n上一稿存在以下必须消除的问题:\n${blockingNotes.map((note) => `- ${note}`).join('\n')}`
        : ''
    writerOutput = await callStructured<WorkshopWriterOutput>(
      'writer',
      `${params.instruction}${revisionNote}\n目标章节:${chapterId}`,
      WorkshopWriterOutputSchema as never,
      base
    )
    if (writerOutput.chapterId !== chapterId) writerOutput = { ...writerOutput, chapterId }

    signal.throwIfAborted()
    params.reportStage?.('extracting', round + 1)
    guardianOutput = await callStructured<WorkshopGuardianOutput>(
      'guardian',
      `提取第 ${chapterId} 章草稿的台账更新`,
      WorkshopGuardianOutputSchema as never,
      { ...base, targetChapter: { chapterId, content: writerOutput.content } }
    )
    if (guardianOutput.chapterId !== chapterId) guardianOutput = { ...guardianOutput, chapterId }

    const candidate = materializeCandidate(base, chapterId, guardianOutput, writerOutput.planStatus)
    const newErrors: WorkshopFinding[] = runWorkshopInvariants(candidate).filter(
      (finding) => finding.severity === 'error' && !baselineErrorKeys.has(finding.key)
    )
    blockingNotes = newErrors.map((finding) => `[连续性错误] ${finding.detail}`)

    if (blockingNotes.length === 0 && params.review) {
      signal.throwIfAborted()
      params.reportStage?.('reviewing', round + 1)
      const review = await callStructured<WorkshopReviewerOutput>(
        'reviewer',
        `审阅第 ${chapterId} 章草稿`,
        WorkshopReviewerOutputSchema as never,
        { ...base, targetChapter: { chapterId, content: writerOutput.content } }
      )
      if (review.verdict === 'revise') {
        blockingNotes = review.findings
          .filter((finding) => finding.severity === 'error')
          .map((finding) => `[审校] ${finding.detail}`)
        if (blockingNotes.length === 0 && review.notes) blockingNotes = [`[审校] ${review.notes}`]
      }
    }
    if (blockingNotes.length === 0) {
      clean = true
      break
    }
  }
  if (!writerOutput || !guardianOutput) throw new Error('Chapter cycle produced no draft')

  const now = new Date().toISOString()
  const existingPlan = base.entities.find(
    (item) => item.collection === 'outline/chapters' && item.entity.id === chapterId
  )?.entity
  const changes: WorkshopChangeset = [
    ...buildWriterChangeset(writerOutput, { proposalId, role: 'writer', now }, existingPlan),
    ...buildPlannerChangeset(guardianOutput, { proposalId, role: 'guardian', now })
  ]
  const checkNote = clean
    ? '\n[机检与审校通过]'
    : `\n[质量关未全部通过,遗留问题待人工裁决]\n${blockingNotes.map((note) => `- ${note}`).join('\n')}`

  signal.throwIfAborted()
  await params.projectLock.runExclusive(rootPath, async () => {
    signal.throwIfAborted()
    const kernel = await WorkshopKernel.open(rootPath)
    await kernel.createProposal({
      id: proposalId,
      title: writerOutput.title,
      rationale: `${writerOutput.rationale}${checkNote}`,
      origin: { kind: 'ai', role: 'writer', proposalId },
      changes
    })
  })
  return { proposalId, clean, recovered: false }
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
      const result = await produceChapterProposal({
        rootPath: ctx.input.rootPath,
        chapterId: ctx.input.chapterId,
        instruction: ctx.input.instruction,
        models: ctx.input.models,
        proposalId: ctx.jobId,
        review: ctx.input.review ?? true,
        signal: ctx.signal,
        projectLock,
        reportStage: (stage, round) => ctx.reportProgress(Math.min(90, 10 + round * 25), { stage, round })
      })
      ctx.reportProgress(100, { stage: 'completed', proposalId: result.proposalId, recovered: result.recovered })
      return WorkshopGenerationOutputSchema.parse({ proposalId: result.proposalId })
    }
  }
}
