import {
  WORKSHOP_COLLECTION_DATA_SCHEMAS,
  WORKSHOP_COLLECTIONS,
  WORKSHOP_MAX_CHAPTER_CHARS,
  WORKSHOP_SCHEMA_VERSION,
  type WorkshopChange,
  type WorkshopChangeset,
  type WorkshopCollection,
  WorkshopCollectionSchema,
  WorkshopDiscussionQuestionSchema,
  type WorkshopEntity,
  WorkshopIdSchema
} from '@shared/types/workshop'
import * as z from 'zod'

/**
 * 编辑部角色的模型输出契约。信封字段(origin/updatedAt/schemaVersion)不进模型输出,
 * 由映射层统一补齐 —— 模型只负责领域内容。
 */

const entityWriteVariants = WORKSHOP_COLLECTIONS.map((collection) =>
  z.strictObject({
    collection: z.literal(collection),
    id: WorkshopIdSchema,
    data: WORKSHOP_COLLECTION_DATA_SCHEMAS[collection]
  })
)

export const WorkshopEntityWriteOutputSchema = z.discriminatedUnion(
  'collection',
  entityWriteVariants as unknown as [(typeof entityWriteVariants)[number], ...typeof entityWriteVariants]
)
export type WorkshopEntityWriteOutput = z.infer<typeof WorkshopEntityWriteOutputSchema>

export const WorkshopPlannerOutputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().max(20_000).default(''),
  entities: z.array(WorkshopEntityWriteOutputSchema).min(1).max(100),
  removals: z
    .array(z.strictObject({ collection: WorkshopCollectionSchema, id: WorkshopIdSchema }))
    .max(50)
    .default([])
})
export type WorkshopPlannerOutput = z.infer<typeof WorkshopPlannerOutputSchema>

const LEDGER_COLLECTIONS = [
  'ledger/facts',
  'ledger/foreshadowing',
  'ledger/summaries',
  'ledger/states',
  'ledger/events'
] as const

const ledgerWriteVariants = LEDGER_COLLECTIONS.map((collection) =>
  z.strictObject({
    collection: z.literal(collection),
    id: WorkshopIdSchema,
    data: WORKSHOP_COLLECTION_DATA_SCHEMAS[collection]
  })
)

/** 守卫只允许写台账集合:从正文提取的事实/伏笔流转/状态/摘要不允许触碰设定与大纲。 */
export const WorkshopGuardianOutputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().max(20_000).default(''),
  chapterId: WorkshopIdSchema,
  entities: z
    .array(
      z.discriminatedUnion(
        'collection',
        ledgerWriteVariants as unknown as [(typeof ledgerWriteVariants)[number], ...typeof ledgerWriteVariants]
      )
    )
    .min(1)
    .max(100),
  removals: z
    .array(z.strictObject({ collection: WorkshopCollectionSchema, id: WorkshopIdSchema }))
    .max(50)
    .default([])
})
export type WorkshopGuardianOutput = z.infer<typeof WorkshopGuardianOutputSchema>

export const WorkshopWriterOutputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().max(20_000).default(''),
  chapterId: WorkshopIdSchema,
  content: z.string().min(1).max(WORKSHOP_MAX_CHAPTER_CHARS),
  planStatus: z.enum(['drafted', 'revised']).optional()
})
export type WorkshopWriterOutput = z.infer<typeof WorkshopWriterOutputSchema>

/** 审校输出:结构化判定 + 发现列表。verdict 为 revise 时循环携带发现重写。 */
export const WorkshopReviewerOutputSchema = z.strictObject({
  verdict: z.enum(['pass', 'revise']),
  notes: z.string().max(4_000).default(''),
  findings: z
    .array(
      z.strictObject({
        severity: z.enum(['error', 'warning']),
        detail: z.string().trim().min(1).max(2_000)
      })
    )
    .max(50)
    .default([])
})
export type WorkshopReviewerOutput = z.infer<typeof WorkshopReviewerOutputSchema>

export const WorkshopDiscussionActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('plan'), proposal: WorkshopPlannerOutputSchema }),
  z.strictObject({ kind: z.literal('draft'), proposal: WorkshopWriterOutputSchema })
])
export type WorkshopDiscussionAction = z.infer<typeof WorkshopDiscussionActionSchema>

export const WorkshopDiscussionOutputSchema = z
  .strictObject({
    reply: z.string().trim().min(1).max(20_000),
    questions: z.array(WorkshopDiscussionQuestionSchema).min(1).max(4).optional(),
    action: WorkshopDiscussionActionSchema.optional()
  })
  .refine((output) => !(output.questions && output.action), {
    message: 'Discussion output cannot ask the author to choose and create a proposal in the same turn'
  })
export type WorkshopDiscussionOutput = z.infer<typeof WorkshopDiscussionOutputSchema>

interface BuildChangesetInput {
  proposalId: string
  role: 'planner' | 'writer' | 'guardian'
  now: string
}

function entityEnvelope(input: BuildChangesetInput, id: string, data: unknown): WorkshopEntity {
  return {
    schemaVersion: WORKSHOP_SCHEMA_VERSION,
    id,
    origin: { kind: 'ai', role: input.role, proposalId: input.proposalId },
    updatedAt: input.now,
    data
  }
}

/** 实体写入类输出(策划/守卫)→ changeset:同一实体取最后一次写入;同时出现写与删时删除优先。 */
export function buildPlannerChangeset(
  output: { entities: WorkshopEntityWriteOutput[]; removals: { collection: WorkshopCollection; id: string }[] },
  input: BuildChangesetInput
): WorkshopChangeset {
  const key = (collection: WorkshopCollection, id: string) => `${collection}/${id}`
  const writes = new Map<string, WorkshopChange>()
  for (const entity of output.entities) {
    writes.set(key(entity.collection, entity.id), {
      op: 'write_entity',
      collection: entity.collection,
      id: entity.id,
      entity: entityEnvelope(input, entity.id, entity.data)
    })
  }
  const removals: WorkshopChange[] = []
  for (const removal of output.removals) {
    writes.delete(key(removal.collection, removal.id))
    removals.push({ op: 'delete_entity', collection: removal.collection, id: removal.id })
  }
  return [...writes.values(), ...removals]
}

/** 写手输出 → changeset:正文写入,可选地把既有章计划的 status 推进。 */
export function buildWriterChangeset(
  output: WorkshopWriterOutput,
  input: BuildChangesetInput,
  existingPlan: WorkshopEntity | undefined
): WorkshopChangeset {
  const changes: WorkshopChange[] = [{ op: 'write_chapter', chapterId: output.chapterId, content: output.content }]
  if (output.planStatus && existingPlan) {
    const planData = existingPlan.data as Record<string, unknown>
    changes.push({
      op: 'write_entity',
      collection: 'outline/chapters',
      id: output.chapterId,
      entity: entityEnvelope(input, output.chapterId, { ...planData, status: output.planStatus })
    })
  }
  return changes
}
