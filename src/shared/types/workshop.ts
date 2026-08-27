import { type JobSnapshot, JobSnapshotSchema } from '@shared/data/api/schemas/jobs'
import { UniqueModelIdSchema } from '@shared/data/types/model'
import * as z from 'zod'

/**
 * 小说工坊（workshop）目标架构的共享类型：实体库、changeset 与提案。
 * 事实源是 git 化项目文件夹，一实体一文件；本文件是实体 schema 的唯一来源。
 * 架构决策见 docs/writer/architecture.md（ADR-002，目标架构 v2）。
 */

export const WORKSHOP_SCHEMA_VERSION = 1 as const
export const WORKSHOP_MAX_CHAPTER_CHARS = 1_000_000 as const
export const WORKSHOP_MAX_CHANGES_PER_PROPOSAL = 500 as const

export const WorkshopIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
export type WorkshopId = z.infer<typeof WorkshopIdSchema>

export const WorkshopCommitOidSchema = z.string().regex(/^[a-f0-9]{40}$/)
export type WorkshopCommitOid = z.infer<typeof WorkshopCommitOidSchema>

export const WorkshopTimestampSchema = z.string().datetime()

export const WorkshopAgentRoleSchema = z.enum(['planner', 'writer', 'reviewer', 'guardian'])
export type WorkshopAgentRole = z.infer<typeof WorkshopAgentRoleSchema>

export const WorkshopOriginSchema = z.strictObject({
  kind: z.enum(['human', 'ai']),
  role: WorkshopAgentRoleSchema.optional(),
  proposalId: WorkshopIdSchema.optional(),
  discussionId: WorkshopIdSchema.optional()
})
export type WorkshopOrigin = z.infer<typeof WorkshopOriginSchema>

// ---------------------------------------------------------------------------
// 实体 data schema（按集合划分；文件名即实体 id，id 唯一性由文件系统承载）
// ---------------------------------------------------------------------------

export const WorkshopCharacterDataSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  role: z.string().trim().max(500).default(''),
  description: z.string().trim().max(20_000).default(''),
  goals: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  constraints: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  relationships: z
    .array(
      z.strictObject({
        characterId: WorkshopIdSchema,
        kind: z.string().trim().min(1).max(200),
        note: z.string().trim().max(2_000).default('')
      })
    )
    .max(200)
    .default([]),
  arcNote: z.string().trim().max(20_000).default('')
})

export const WorkshopLoreDataSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(20_000),
    keys: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    enabled: z.boolean().default(true),
    alwaysActive: z.boolean().default(false),
    caseSensitive: z.boolean().default(false),
    matchWholeWords: z.boolean().default(false),
    order: z.number().int().min(0).max(10_000).default(100)
  })
  .refine((lore) => lore.alwaysActive || lore.keys.length > 0, {
    message: 'Lore entries must have an activation key unless they are always active',
    path: ['keys']
  })

export const WorkshopRuleDataSchema = z.strictObject({
  kind: z.enum(['hard', 'world', 'style']),
  text: z.string().trim().min(1).max(2_000),
  note: z.string().trim().max(2_000).default('')
})

export const WorkshopVolumeDataSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(20_000).default(''),
  chapterIds: z.array(WorkshopIdSchema).max(20_000).default([])
})

export const WorkshopArcDataSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(20_000).default(''),
  chapterIds: z.array(WorkshopIdSchema).max(20_000).default([])
})

export const WorkshopChapterPlanDataSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(10_000).default(''),
  beats: z.array(z.string().trim().min(1).max(2_000)).max(200).default([]),
  wordBudget: z.number().int().positive().max(1_000_000).optional(),
  requirements: z
    .array(
      z.strictObject({
        id: WorkshopIdSchema,
        description: z.string().trim().min(1).max(2_000)
      })
    )
    .max(200)
    .default([]),
  status: z.enum(['planned', 'drafted', 'revised']).default('planned')
})

export const WorkshopFactDataSchema = z.strictObject({
  subject: z.string().trim().min(1).max(500),
  predicate: z.string().trim().min(1).max(500),
  detail: z.string().trim().max(10_000).default(''),
  sourceChapterId: WorkshopIdSchema.optional(),
  usedInChapterIds: z.array(WorkshopIdSchema).max(20_000).default([])
})

export const WorkshopForeshadowingDataSchema = z.strictObject({
  description: z.string().trim().min(1).max(10_000),
  plantedChapterId: WorkshopIdSchema.optional(),
  dueChapterId: WorkshopIdSchema.optional(),
  resolvedChapterId: WorkshopIdSchema.optional(),
  status: z.enum(['open', 'resolved', 'abandoned']).default('open')
})

export const WorkshopChapterSummaryDataSchema = z.strictObject({
  summary: z.string().trim().max(20_000),
  requirementAssessments: z
    .array(
      z.strictObject({
        requirementId: WorkshopIdSchema,
        status: z.enum(['met', 'deviated', 'not_applicable']),
        evidence: z.string().trim().max(10_000).default('')
      })
    )
    .max(200)
    .default([])
})

export const WorkshopCharacterStateDataSchema = z.strictObject({
  timelineId: WorkshopIdSchema.default('main'),
  characterId: WorkshopIdSchema,
  chapterId: WorkshopIdSchema,
  sequence: z.number().int().min(0).max(1_000_000).default(0),
  location: z.string().trim().max(500).default(''),
  lifeStatus: z.enum(['unknown', 'alive', 'dead']).default('unknown'),
  transitionExplanation: z.string().trim().max(10_000).default(''),
  evidence: z.string().trim().max(10_000).default('')
})

export const WorkshopTimelineEventDataSchema = z.strictObject({
  timelineId: WorkshopIdSchema.default('main'),
  chapterId: WorkshopIdSchema,
  sequence: z.number().int().min(0).max(1_000_000).default(0),
  storyTime: z.number().finite(),
  label: z.string().trim().min(1).max(500),
  evidence: z.string().trim().max(10_000).default('')
})

// ---------------------------------------------------------------------------
// 集合注册表：集合名 ↔ 项目内目录 ↔ data schema 的唯一映射
// ---------------------------------------------------------------------------

export const WORKSHOP_COLLECTION_DATA_SCHEMAS = {
  'codex/characters': WorkshopCharacterDataSchema,
  'codex/lore': WorkshopLoreDataSchema,
  'codex/rules': WorkshopRuleDataSchema,
  'outline/volumes': WorkshopVolumeDataSchema,
  'outline/arcs': WorkshopArcDataSchema,
  'outline/chapters': WorkshopChapterPlanDataSchema,
  'ledger/facts': WorkshopFactDataSchema,
  'ledger/foreshadowing': WorkshopForeshadowingDataSchema,
  'ledger/summaries': WorkshopChapterSummaryDataSchema,
  'ledger/states': WorkshopCharacterStateDataSchema,
  'ledger/events': WorkshopTimelineEventDataSchema
} as const

export type WorkshopCollection = keyof typeof WORKSHOP_COLLECTION_DATA_SCHEMAS
export const WORKSHOP_COLLECTIONS = Object.keys(WORKSHOP_COLLECTION_DATA_SCHEMAS) as WorkshopCollection[]
export const WorkshopCollectionSchema = z.enum(WORKSHOP_COLLECTIONS as [WorkshopCollection, ...WorkshopCollection[]])

const entityEnvelope = <T extends z.ZodType>(data: T) =>
  z.strictObject({
    schemaVersion: z.literal(WORKSHOP_SCHEMA_VERSION),
    id: WorkshopIdSchema,
    origin: WorkshopOriginSchema,
    updatedAt: WorkshopTimestampSchema,
    data
  })

/** 返回某集合的完整实体文件 schema（公共信封 + 该集合的 data schema）。 */
export function workshopEntitySchemaFor(collection: WorkshopCollection) {
  return entityEnvelope(WORKSHOP_COLLECTION_DATA_SCHEMAS[collection])
}

export const WorkshopEntitySchema = entityEnvelope(z.unknown())
export type WorkshopEntity<TData = unknown> = Omit<z.infer<typeof WorkshopEntitySchema>, 'data'> & { data: TData }

// ---------------------------------------------------------------------------
// 项目卡（project.json）
// ---------------------------------------------------------------------------

export const WorkshopProjectCardSchema = z.strictObject({
  schemaVersion: z.literal(WORKSHOP_SCHEMA_VERSION),
  id: WorkshopIdSchema,
  title: z.string().trim().min(1).max(200),
  genre: z.string().trim().max(200).default(''),
  premise: z.string().trim().max(10_000).default(''),
  authorGoal: z.string().trim().max(10_000).default(''),
  targetWordCount: z.number().int().positive().max(100_000_000).optional(),
  volumeOrder: z.array(WorkshopIdSchema).max(1_000).default([]),
  looseChapterIds: z.array(WorkshopIdSchema).max(20_000).default([]),
  createdAt: WorkshopTimestampSchema
})
export type WorkshopProjectCard = z.infer<typeof WorkshopProjectCardSchema>

// ---------------------------------------------------------------------------
// changeset：一次原子提交的语义化变更集
// ---------------------------------------------------------------------------

export const WorkshopChangeSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('write_entity'),
    collection: WorkshopCollectionSchema,
    id: WorkshopIdSchema,
    entity: WorkshopEntitySchema
  }),
  z.strictObject({
    op: z.literal('delete_entity'),
    collection: WorkshopCollectionSchema,
    id: WorkshopIdSchema
  }),
  z.strictObject({
    op: z.literal('write_chapter'),
    chapterId: WorkshopIdSchema,
    content: z.string().max(WORKSHOP_MAX_CHAPTER_CHARS)
  }),
  z.strictObject({
    op: z.literal('delete_chapter'),
    chapterId: WorkshopIdSchema
  }),
  z.strictObject({
    op: z.literal('write_project'),
    card: WorkshopProjectCardSchema
  })
])
export type WorkshopChange = z.infer<typeof WorkshopChangeSchema>

export const WorkshopChangesetSchema = z.array(WorkshopChangeSchema).min(1).max(WORKSHOP_MAX_CHANGES_PER_PROPOSAL)
export type WorkshopChangeset = z.infer<typeof WorkshopChangesetSchema>

// ---------------------------------------------------------------------------
// 提案：refs/workshop/{proposals,applied,rejected}/<id> 上的一个 commit。
// 元数据内嵌于 commit message（标题行 + JSON 块），状态由 ref 命名空间承载。
// ---------------------------------------------------------------------------

export const WorkshopProposalStatusSchema = z.enum(['pending', 'applied', 'rejected'])
export type WorkshopProposalStatus = z.infer<typeof WorkshopProposalStatusSchema>

export const WorkshopProposalMetadataSchema = z.strictObject({
  id: WorkshopIdSchema,
  title: z.string().trim().min(1).max(200),
  rationale: z.string().max(20_000).default(''),
  origin: WorkshopOriginSchema,
  createdAt: WorkshopTimestampSchema
})
export type WorkshopProposalMetadata = z.infer<typeof WorkshopProposalMetadataSchema>

export const WorkshopProposalSchema = WorkshopProposalMetadataSchema.extend({
  baseCommit: WorkshopCommitOidSchema,
  commit: WorkshopCommitOidSchema,
  status: WorkshopProposalStatusSchema,
  /** pending 提案的 base 是否已落后于正史（需 rebase 或重新生成）。 */
  stale: z.boolean(),
  appliedAt: WorkshopTimestampSchema.optional(),
  appliedCommit: WorkshopCommitOidSchema.optional()
})
export type WorkshopProposal = z.infer<typeof WorkshopProposalSchema>

// ---------------------------------------------------------------------------
// 时间线：正史 commit 流的语义化视图
// ---------------------------------------------------------------------------

export const WorkshopTimelineEntrySchema = z.strictObject({
  commit: WorkshopCommitOidSchema,
  kind: z.enum(['init', 'canon_edit', 'proposal_applied', 'rollback']),
  title: z.string().max(200),
  origin: WorkshopOriginSchema,
  proposalId: WorkshopIdSchema.optional(),
  timestamp: WorkshopTimestampSchema
})
export type WorkshopTimelineEntry = z.infer<typeof WorkshopTimelineEntrySchema>

// ---------------------------------------------------------------------------
// 文件路径映射：changeset 与项目布局之间的唯一换算
// ---------------------------------------------------------------------------

export const WORKSHOP_PROJECT_FILE = 'project.json'
export const WORKSHOP_MANUSCRIPT_DIR = 'manuscript'

export function workshopEntityFilepath(collection: WorkshopCollection, id: WorkshopId): string {
  return `${collection}/${id}.json`
}

export function workshopChapterFilepath(chapterId: WorkshopId): string {
  return `${WORKSHOP_MANUSCRIPT_DIR}/${chapterId}.md`
}

// ---------------------------------------------------------------------------
// IpcApi 输入/输出 schema（路由见 src/shared/ipc/schemas/workshop.ts）
// ---------------------------------------------------------------------------

export const WorkshopProjectCreateInputSchema = z.strictObject({
  parentDirectory: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  genre: z.string().trim().max(200).optional(),
  premise: z.string().trim().max(10_000).optional(),
  authorGoal: z.string().trim().max(10_000).optional(),
  targetWordCount: z.number().int().positive().max(100_000_000).optional()
})
export type WorkshopProjectCreateInput = z.infer<typeof WorkshopProjectCreateInputSchema>

export const WorkshopProjectOpenInputSchema = z.strictObject({ rootPath: z.string().trim().min(1) })
export type WorkshopProjectOpenInput = z.infer<typeof WorkshopProjectOpenInputSchema>

export const WorkshopProjectSnapshotSchema = z.strictObject({
  rootPath: z.string().min(1),
  head: WorkshopCommitOidSchema,
  card: WorkshopProjectCardSchema,
  chapterIds: z.array(WorkshopIdSchema).max(20_000)
})
export type WorkshopProjectSnapshot = z.infer<typeof WorkshopProjectSnapshotSchema>

export const WorkshopEntityListInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  collection: WorkshopCollectionSchema
})
export type WorkshopEntityListInput = z.infer<typeof WorkshopEntityListInputSchema>

export const WorkshopEntityListResultSchema = z.strictObject({
  entities: z.array(WorkshopEntitySchema).max(100_000)
})
export type WorkshopEntityListResult = z.infer<typeof WorkshopEntityListResultSchema>

export const WorkshopEntityReadInputSchema = WorkshopEntityListInputSchema.extend({ id: WorkshopIdSchema })
export type WorkshopEntityReadInput = z.infer<typeof WorkshopEntityReadInputSchema>

export const WorkshopChapterReadInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WorkshopIdSchema
})
export type WorkshopChapterReadInput = z.infer<typeof WorkshopChapterReadInputSchema>

export const WorkshopChapterReadResultSchema = z.strictObject({
  content: z.string().max(WORKSHOP_MAX_CHAPTER_CHARS)
})
export type WorkshopChapterReadResult = z.infer<typeof WorkshopChapterReadResultSchema>

export const WorkshopCanonCommitInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  changes: WorkshopChangesetSchema
})
export type WorkshopCanonCommitInput = z.infer<typeof WorkshopCanonCommitInputSchema>

export const WorkshopProposalCreateInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  rationale: z.string().max(20_000).optional(),
  origin: WorkshopOriginSchema,
  changes: WorkshopChangesetSchema
})
export type WorkshopProposalCreateInput = z.infer<typeof WorkshopProposalCreateInputSchema>

export const WorkshopProposalListInputSchema = z.strictObject({ rootPath: z.string().trim().min(1) })
export type WorkshopProposalListInput = z.infer<typeof WorkshopProposalListInputSchema>

export const WorkshopProposalListResultSchema = z.strictObject({
  proposals: z.array(WorkshopProposalSchema).max(10_000)
})
export type WorkshopProposalListResult = z.infer<typeof WorkshopProposalListResultSchema>

export const WorkshopProposalReadInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  id: WorkshopIdSchema
})
export type WorkshopProposalReadInput = z.infer<typeof WorkshopProposalReadInputSchema>

export const WorkshopFileDiffSchema = z.strictObject({
  filepath: z.string().min(1),
  before: z.string().nullable(),
  after: z.string().nullable()
})
export type WorkshopFileDiff = z.infer<typeof WorkshopFileDiffSchema>

export const WorkshopProposalChangesResultSchema = z.strictObject({
  changes: z.array(WorkshopFileDiffSchema).max(WORKSHOP_MAX_CHANGES_PER_PROPOSAL)
})
export type WorkshopProposalChangesResult = z.infer<typeof WorkshopProposalChangesResultSchema>

export const WorkshopTimelineListInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  limit: z.number().int().min(1).max(1_000).default(100)
})
export type WorkshopTimelineListInput = z.infer<typeof WorkshopTimelineListInputSchema>

export const WorkshopTimelineListResultSchema = z.strictObject({
  entries: z.array(WorkshopTimelineEntrySchema).max(1_000)
})
export type WorkshopTimelineListResult = z.infer<typeof WorkshopTimelineListResultSchema>

export const WorkshopGenerationStartInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  role: z.enum(['planner', 'writer', 'guardian']),
  instruction: z.string().trim().min(1).max(20_000),
  uniqueModelId: UniqueModelIdSchema.optional(),
  /** writer 角色的目标章节;省略则由模型在输出中指定(可为新章节)。 */
  chapterId: WorkshopIdSchema.optional()
})
export type WorkshopGenerationStartInput = z.infer<typeof WorkshopGenerationStartInputSchema>

export const WorkshopGenerationStartResultSchema = JobSnapshotSchema
export type WorkshopGenerationStartResult = JobSnapshot

export const WorkshopChapterCycleStartInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WorkshopIdSchema,
  instruction: z.string().trim().min(1).max(20_000),
  uniqueModelId: UniqueModelIdSchema.optional()
})
export type WorkshopChapterCycleStartInput = z.infer<typeof WorkshopChapterCycleStartInputSchema>

export const WorkshopVolumeRunStartInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  volumeId: WorkshopIdSchema,
  instruction: z.string().trim().min(1).max(20_000),
  gate: z.enum(['auto', 'review']).default('auto'),
  maxChapters: z.number().int().min(1).max(50).default(10),
  uniqueModelId: UniqueModelIdSchema.optional()
})
export type WorkshopVolumeRunStartInput = z.infer<typeof WorkshopVolumeRunStartInputSchema>

export const WorkshopExportInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  format: z.enum(['markdown', 'txt', 'epub', 'docx'])
})
export type WorkshopExportInput = z.infer<typeof WorkshopExportInputSchema>

export const WorkshopExportResultSchema = z.strictObject({
  /** docx 走系统保存对话框,路径由用户决定,返回 null。 */
  filePath: z.string().nullable()
})
export type WorkshopExportResult = z.infer<typeof WorkshopExportResultSchema>

export const WorkshopGenerationJobInputSchema = z.strictObject({ jobId: z.string().trim().min(1) })
export type WorkshopGenerationJobInput = z.infer<typeof WorkshopGenerationJobInputSchema>

export const WorkshopGenerationStatusResultSchema = JobSnapshotSchema.nullable()
export type WorkshopGenerationStatusResult = JobSnapshot | null

export const WorkshopGenerationCancelResultSchema = z.strictObject({ cancelled: z.boolean() })
export type WorkshopGenerationCancelResult = z.infer<typeof WorkshopGenerationCancelResultSchema>

export const WorkshopGenerationOutputSchema = z.strictObject({ proposalId: WorkshopIdSchema })
export type WorkshopGenerationOutput = z.infer<typeof WorkshopGenerationOutputSchema>

// ---------------------------------------------------------------------------
// 不变量检查(确定性,不调模型)
// ---------------------------------------------------------------------------

export const WorkshopInvariantRuleSchema = z.enum([
  'invalid_reference',
  'duplicate_volume_membership',
  'character_life_conflict',
  'character_resurrection',
  'timeline_regression',
  'foreshadowing_state_mismatch',
  'foreshadowing_chronology',
  'foreshadowing_overdue',
  'missing_summary',
  'plan_status_mismatch'
])
export type WorkshopInvariantRule = z.infer<typeof WorkshopInvariantRuleSchema>

export const WorkshopFindingSchema = z.strictObject({
  /** rule + 主体的稳定键(64 位十六进制),同一问题跨次运行保持一致。 */
  key: z.string().regex(/^[a-f0-9]{64}$/),
  rule: WorkshopInvariantRuleSchema,
  severity: z.enum(['error', 'warning', 'info']),
  detail: z.string().min(1).max(2_000),
  chapterIds: z.array(WorkshopIdSchema).max(50).default([]),
  entityIds: z.array(WorkshopIdSchema).max(50).default([])
})
export type WorkshopFinding = z.infer<typeof WorkshopFindingSchema>

export const WorkshopInvariantReportSchema = z.strictObject({
  headCommit: WorkshopCommitOidSchema,
  generatedAt: WorkshopTimestampSchema,
  findings: z.array(WorkshopFindingSchema).max(10_000),
  counts: z.strictObject({
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    info: z.number().int().nonnegative()
  })
})
export type WorkshopInvariantReport = z.infer<typeof WorkshopInvariantReportSchema>

export const WorkshopInvariantRunInputSchema = z.strictObject({ rootPath: z.string().trim().min(1) })
export type WorkshopInvariantRunInput = z.infer<typeof WorkshopInvariantRunInputSchema>

export const WorkshopDiscussionMessageSchema = z.strictObject({
  id: WorkshopIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(50_000),
  createdAt: WorkshopTimestampSchema,
  /** 助手消息在本回合落盘的提案(讨论即操作的溯源锚点)。 */
  proposalId: WorkshopIdSchema.optional()
})
export type WorkshopDiscussionMessage = z.infer<typeof WorkshopDiscussionMessageSchema>

export const WorkshopDiscussionListInputSchema = z.strictObject({ rootPath: z.string().trim().min(1) })
export type WorkshopDiscussionListInput = z.infer<typeof WorkshopDiscussionListInputSchema>

export const WorkshopDiscussionListResultSchema = z.strictObject({
  messages: z.array(WorkshopDiscussionMessageSchema).max(500)
})
export type WorkshopDiscussionListResult = z.infer<typeof WorkshopDiscussionListResultSchema>

export const WorkshopDiscussionSendInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  content: z.string().trim().min(1).max(20_000),
  uniqueModelId: UniqueModelIdSchema.optional()
})
export type WorkshopDiscussionSendInput = z.infer<typeof WorkshopDiscussionSendInputSchema>

export const WorkshopRollbackInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  commit: WorkshopCommitOidSchema
})
export type WorkshopRollbackInput = z.infer<typeof WorkshopRollbackInputSchema>

export function workshopChangeFilepath(change: WorkshopChange): string {
  switch (change.op) {
    case 'write_entity':
    case 'delete_entity':
      return workshopEntityFilepath(change.collection, change.id)
    case 'write_chapter':
    case 'delete_chapter':
      return workshopChapterFilepath(change.chapterId)
    case 'write_project':
      return WORKSHOP_PROJECT_FILE
  }
}
