import { type JobSnapshot, JobSnapshotSchema } from '@shared/data/api/schemas/jobs'
import { UniqueModelIdSchema } from '@shared/data/types/model'
import * as z from 'zod'

export const WRITER_PROJECT_SCHEMA_VERSION = 1 as const
export const WRITER_MAX_CHAPTER_CHARS = 1_000_000 as const
export const WRITER_MAX_PROPOSAL_CHARS = 1_000_000 as const
export const WRITER_MAX_CONTEXT_BUDGET_CHARS = 48_000 as const
export const WRITER_MAX_CONTINUITY_FINDINGS = 10_000 as const
export const WRITER_MAX_CONTINUITY_WAIVERS = 1_000 as const
export const WRITER_MAX_CONTINUITY_REVIEW_REPORT_BYTES = 4 * 1024 * 1024
export const WRITER_MAX_CONTINUITY_AUDIT_OBSERVATIONS = 100_000 as const
export const WRITER_MISSING_CONTINUITY_REVIEW_REVISION = 'missing' as const

export const WriterOperationSchema = z.enum([
  'brainstorm',
  'chapter_plan',
  'draft',
  'continue',
  'rewrite',
  'review',
  'summarize'
])
export type WriterOperation = z.infer<typeof WriterOperationSchema>

export const WriterProposalModeSchema = z.enum(['replace', 'append'])
export type WriterProposalMode = z.infer<typeof WriterProposalModeSchema>

export const WriterEntityIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
export const WriterRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const WriterTimestampSchema = z.string().datetime()

export const WriterChapterMetadataSchema = z.strictObject({
  id: WriterEntityIdSchema,
  title: z.string().trim().min(1).max(200),
  fileName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,220}\.md$/),
  order: z.number().int().nonnegative(),
  createdAt: WriterTimestampSchema,
  updatedAt: WriterTimestampSchema,
  revision: WriterRevisionSchema
})
export type WriterChapterMetadata = z.infer<typeof WriterChapterMetadataSchema>

export const WriterProjectManifestSchema = z.strictObject({
  schemaVersion: z.literal(WRITER_PROJECT_SCHEMA_VERSION),
  id: WriterEntityIdSchema,
  title: z.string().trim().min(1).max(200),
  genre: z.string().trim().max(200).optional(),
  premise: z.string().trim().max(10_000).optional(),
  targetWordCount: z.number().int().positive().max(100_000_000).optional(),
  createdAt: WriterTimestampSchema,
  updatedAt: WriterTimestampSchema,
  activeChapterId: WriterEntityIdSchema,
  chapters: z.array(WriterChapterMetadataSchema).max(20_000)
})
export type WriterProjectManifest = z.infer<typeof WriterProjectManifestSchema>

export const WriterCharacterSchema = z.strictObject({
  id: WriterEntityIdSchema,
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(500).default(''),
  description: z.string().trim().max(20_000).default(''),
  goals: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([]),
  constraints: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([])
})
export type WriterCharacter = z.infer<typeof WriterCharacterSchema>

export const WriterLoreEntrySchema = z.strictObject({
  id: WriterEntityIdSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  keys: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  enabled: z.boolean().default(true),
  alwaysActive: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  matchWholeWords: z.boolean().default(false),
  order: z.number().int().min(0).max(10_000).default(100)
})
export type WriterLoreEntry = z.infer<typeof WriterLoreEntrySchema>

export const WriterStoryBibleSchema = z
  .strictObject({
    schemaVersion: z.literal(WRITER_PROJECT_SCHEMA_VERSION),
    genre: z.string().trim().max(200).default(''),
    premise: z.string().trim().max(10_000).default(''),
    authorGoal: z.string().trim().max(10_000).default(''),
    hardRules: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([]),
    themes: z.array(z.string().trim().min(1).max(500)).max(1_000).default([]),
    characters: z.array(WriterCharacterSchema).max(10_000).default([]),
    loreEntries: z.array(WriterLoreEntrySchema).max(500).default([]),
    worldRules: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([]),
    styleGuide: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([])
  })
  .superRefine((storyBible, context) => {
    const characterIds = new Set<string>()
    for (const [index, character] of storyBible.characters.entries()) {
      if (characterIds.has(character.id)) {
        context.addIssue({
          code: 'custom',
          path: ['characters', index, 'id'],
          message: 'Character ids must be unique'
        })
      }
      characterIds.add(character.id)
    }
    const entryIds = new Set<string>()
    for (const [index, entry] of storyBible.loreEntries.entries()) {
      if (entryIds.has(entry.id)) {
        context.addIssue({
          code: 'custom',
          path: ['loreEntries', index, 'id'],
          message: 'Lore entry ids must be unique'
        })
      }
      entryIds.add(entry.id)
      if (!entry.alwaysActive && entry.keys.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['loreEntries', index, 'keys'],
          message: 'Lore entries must have an activation key unless they are always active'
        })
      }
    }
  })
export type WriterStoryBible = z.infer<typeof WriterStoryBibleSchema>

export const WriterStoryArcSchema = z.strictObject({
  id: WriterEntityIdSchema,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(20_000).default(''),
  chapterIds: z.array(WriterEntityIdSchema).max(20_000).default([])
})
export type WriterStoryArc = z.infer<typeof WriterStoryArcSchema>

export const WriterChapterPlanSchema = z
  .strictObject({
    chapterId: WriterEntityIdSchema,
    title: z.string().trim().min(1).max(200),
    goal: z.string().trim().max(10_000).default(''),
    beats: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([]),
    requirements: z
      .array(
        z.strictObject({
          id: WriterEntityIdSchema,
          description: z.string().trim().min(1).max(2_000)
        })
      )
      .max(1_000)
      .optional(),
    status: z.enum(['planned', 'drafted', 'revised']).default('planned')
  })
  .superRefine((plan, context) => {
    const ids = new Set<string>()
    for (const [index, requirement] of (plan.requirements ?? []).entries()) {
      if (ids.has(requirement.id)) {
        context.addIssue({
          code: 'custom',
          path: ['requirements', index, 'id'],
          message: 'Chapter plan requirement ids must be unique'
        })
      }
      ids.add(requirement.id)
    }
  })
export type WriterChapterPlan = z.infer<typeof WriterChapterPlanSchema>

export const WriterOutlineSchema = z
  .strictObject({
    schemaVersion: z.literal(WRITER_PROJECT_SCHEMA_VERSION),
    bookSummary: z.string().trim().max(20_000).default(''),
    arcs: z.array(WriterStoryArcSchema).max(5_000).default([]),
    chapterPlans: z.array(WriterChapterPlanSchema).max(20_000).default([])
  })
  .superRefine((outline, context) => {
    const chapterIds = new Set<string>()
    for (const [index, plan] of outline.chapterPlans.entries()) {
      if (chapterIds.has(plan.chapterId)) {
        context.addIssue({
          code: 'custom',
          path: ['chapterPlans', index, 'chapterId'],
          message: 'Chapter plans must use unique chapter ids'
        })
      }
      chapterIds.add(plan.chapterId)
    }
  })
export type WriterOutline = z.infer<typeof WriterOutlineSchema>

export const WriterContinuityFactSchema = z.strictObject({
  id: WriterEntityIdSchema,
  subject: z.string().trim().min(1).max(500),
  predicate: z.string().trim().min(1).max(500),
  detail: z.string().trim().max(10_000).default(''),
  sourceChapterId: WriterEntityIdSchema.optional(),
  usedInChapterIds: z.array(WriterEntityIdSchema).max(20_000).optional()
})
export type WriterContinuityFact = z.infer<typeof WriterContinuityFactSchema>

export const WriterForeshadowingSchema = z.strictObject({
  id: WriterEntityIdSchema,
  description: z.string().trim().min(1).max(10_000),
  plantedChapterId: WriterEntityIdSchema.optional(),
  resolvedChapterId: WriterEntityIdSchema.optional(),
  dueChapterId: WriterEntityIdSchema.optional(),
  status: z.enum(['open', 'resolved', 'abandoned']).default('open')
})
export type WriterForeshadowing = z.infer<typeof WriterForeshadowingSchema>

export const WriterChapterSummarySchema = z
  .strictObject({
    chapterId: WriterEntityIdSchema,
    summary: z.string().trim().max(20_000),
    assessmentRevision: WriterRevisionSchema.optional(),
    requirementAssessments: z
      .array(
        z.strictObject({
          requirementId: WriterEntityIdSchema,
          status: z.enum(['met', 'deviated', 'not_applicable']),
          evidence: z.string().trim().max(10_000).default('')
        })
      )
      .max(1_000)
      .optional(),
    updatedAt: WriterTimestampSchema
  })
  .superRefine((summary, context) => {
    const requirementIds = new Set<string>()
    for (const [index, assessment] of (summary.requirementAssessments ?? []).entries()) {
      if (requirementIds.has(assessment.requirementId)) {
        context.addIssue({
          code: 'custom',
          path: ['requirementAssessments', index, 'requirementId'],
          message: 'Requirement assessments must use unique requirement ids'
        })
      }
      requirementIds.add(assessment.requirementId)
    }
  })
export type WriterChapterSummary = z.infer<typeof WriterChapterSummarySchema>

export const WriterContinuityAuditRuleSchema = z.enum([
  'timeline',
  'character_location',
  'character_life',
  'foreshadowing_due',
  'future_information',
  'chapter_plan'
])
export type WriterContinuityAuditRule = z.infer<typeof WriterContinuityAuditRuleSchema>

export const WriterTimelineEventSchema = z.strictObject({
  id: WriterEntityIdSchema,
  timelineId: WriterEntityIdSchema.default('main'),
  chapterId: WriterEntityIdSchema,
  sequence: z.number().int().min(0).max(1_000_000).default(0),
  storyTime: z.number().finite(),
  label: z.string().trim().min(1).max(500),
  evidence: z.string().trim().max(10_000).default('')
})
export type WriterTimelineEvent = z.infer<typeof WriterTimelineEventSchema>

export const WriterCharacterStateSchema = z.strictObject({
  id: WriterEntityIdSchema,
  timelineId: WriterEntityIdSchema.default('main'),
  characterId: WriterEntityIdSchema,
  chapterId: WriterEntityIdSchema,
  sequence: z.number().int().min(0).max(1_000_000).default(0),
  location: z.string().trim().max(500).default(''),
  lifeStatus: z.enum(['unknown', 'alive', 'dead']).default('unknown'),
  transitionExplanation: z.string().trim().max(10_000).default(''),
  evidence: z.string().trim().max(10_000).default('')
})
export type WriterCharacterState = z.infer<typeof WriterCharacterStateSchema>

export const WriterContinuityCoverageDeclarationSchema = z.strictObject({
  rule: WriterContinuityAuditRuleSchema,
  throughChapterId: WriterEntityIdSchema,
  basisFingerprint: WriterRevisionSchema,
  updatedAt: WriterTimestampSchema,
  note: z.string().trim().max(2_000).default('')
})
export type WriterContinuityCoverageDeclaration = z.infer<typeof WriterContinuityCoverageDeclarationSchema>

export const WriterContinuityLedgerSchema = z
  .strictObject({
    schemaVersion: z.literal(WRITER_PROJECT_SCHEMA_VERSION),
    facts: z.array(WriterContinuityFactSchema).max(100_000).default([]),
    foreshadowing: z.array(WriterForeshadowingSchema).max(100_000).default([]),
    chapterSummaries: z.array(WriterChapterSummarySchema).max(20_000).default([]),
    timelineEvents: z.array(WriterTimelineEventSchema).max(100_000).optional(),
    characterStates: z.array(WriterCharacterStateSchema).max(100_000).optional()
  })
  .superRefine((ledger, context) => {
    const unique = (
      values: readonly string[],
      path: 'facts' | 'foreshadowing' | 'chapterSummaries' | 'timelineEvents' | 'characterStates'
    ) => {
      const seen = new Set<string>()
      for (const [index, value] of values.entries()) {
        if (seen.has(value)) {
          context.addIssue({ code: 'custom', path: [path, index], message: `${path} identities must be unique` })
        }
        seen.add(value)
      }
    }
    unique(
      ledger.facts.map((item) => item.id),
      'facts'
    )
    unique(
      ledger.foreshadowing.map((item) => item.id),
      'foreshadowing'
    )
    unique(
      ledger.chapterSummaries.map((item) => item.chapterId),
      'chapterSummaries'
    )
    unique(
      (ledger.timelineEvents ?? []).map((item) => item.id),
      'timelineEvents'
    )
    unique(
      (ledger.characterStates ?? []).map((item) => item.id),
      'characterStates'
    )
    const timelineSlots = new Set<string>()
    for (const [index, event] of (ledger.timelineEvents ?? []).entries()) {
      const slot = `${event.timelineId}:${event.chapterId}:${event.sequence}`
      if (timelineSlots.has(slot)) {
        context.addIssue({
          code: 'custom',
          path: ['timelineEvents', index, 'sequence'],
          message: 'Timeline event sequence slots must be unique within a chapter and timeline'
        })
      }
      timelineSlots.add(slot)
    }
    const characterStateSlots = new Map<string, number>()
    for (const [index, state] of (ledger.characterStates ?? []).entries()) {
      const slot = `${state.timelineId}:${state.characterId}:${state.chapterId}:${state.sequence}`
      const count = (characterStateSlots.get(slot) ?? 0) + 1
      if (count > 100) {
        context.addIssue({
          code: 'custom',
          path: ['characterStates', index],
          message: 'Character state slots cannot contain more than 100 observations'
        })
      }
      characterStateSlots.set(slot, count)
    }
  })
export type WriterContinuityLedger = z.infer<typeof WriterContinuityLedgerSchema>

export const WriterProjectDocumentRevisionsSchema = z.strictObject({
  storyBible: WriterRevisionSchema,
  outline: WriterRevisionSchema,
  continuity: WriterRevisionSchema
})
export type WriterProjectDocumentRevisions = z.infer<typeof WriterProjectDocumentRevisionsSchema>

export const WriterProjectSchema = z.strictObject({
  rootPath: z.string().min(1),
  manifest: WriterProjectManifestSchema,
  storyBible: WriterStoryBibleSchema,
  outline: WriterOutlineSchema,
  continuity: WriterContinuityLedgerSchema,
  documentRevisions: WriterProjectDocumentRevisionsSchema
})
export type WriterProject = z.infer<typeof WriterProjectSchema>

export const WriterContinuityFindingRuleSchema = z.enum([
  'invalid_reference',
  'timeline_regression',
  'foreshadowing_chronology',
  'foreshadowing_state_mismatch',
  'character_location_conflict',
  'character_life_conflict',
  'character_resurrection',
  'foreshadowing_overdue',
  'future_information',
  'chapter_plan_deviation',
  'chapter_plan_assessment_stale'
])
export type WriterContinuityFindingRule = z.infer<typeof WriterContinuityFindingRuleSchema>

export const WriterContinuityFindingSuggestionSchema = z.enum([
  'repair_reference',
  'repair_timeline',
  'resolve_location',
  'resolve_life_state',
  'explain_resurrection',
  'resolve_or_reschedule_foreshadowing',
  'move_information_reveal',
  'update_plan_or_mark_intentional',
  'refresh_plan_assessment'
])
export type WriterContinuityFindingSuggestion = z.infer<typeof WriterContinuityFindingSuggestionSchema>

export const WriterContinuityEvidenceSchema = z.strictObject({
  kind: z.enum([
    'manifest',
    'story_arc',
    'fact',
    'foreshadowing',
    'timeline_event',
    'character_state',
    'chapter_summary',
    'chapter_plan'
  ]),
  sourceId: z.string().trim().min(1).max(500),
  chapterId: WriterEntityIdSchema.optional(),
  label: z.string().trim().min(1).max(2_000),
  detail: z.string().trim().max(10_000).default(''),
  truncated: z.boolean().default(false)
})
export type WriterContinuityEvidence = z.infer<typeof WriterContinuityEvidenceSchema>

export const WriterContinuityFindingSchema = z.strictObject({
  key: WriterRevisionSchema,
  fingerprint: WriterRevisionSchema,
  ruleVersion: z.literal(1),
  rule: WriterContinuityFindingRuleSchema,
  severity: z.enum(['error', 'warning', 'info']),
  exemptible: z.boolean(),
  chapterIds: z.array(WriterEntityIdSchema).max(100),
  entityIds: z.array(WriterEntityIdSchema).max(100),
  evidence: z.array(WriterContinuityEvidenceSchema).min(1).max(100),
  evidenceTruncated: z.boolean().default(false),
  suggestion: WriterContinuityFindingSuggestionSchema
})
export type WriterContinuityFinding = z.infer<typeof WriterContinuityFindingSchema>

export const WriterContinuityRuleStatSchema = z.strictObject({
  rule: WriterContinuityAuditRuleSchema,
  evaluatedItems: z.number().int().nonnegative(),
  staleItems: z.number().int().nonnegative().default(0),
  basisFingerprint: WriterRevisionSchema
})
export type WriterContinuityRuleStat = z.infer<typeof WriterContinuityRuleStatSchema>

export const WriterContinuityAuditReportSchema = z.strictObject({
  generatedAt: WriterTimestampSchema,
  targetChapterId: WriterEntityIdSchema,
  sourceFingerprint: WriterRevisionSchema,
  sourceDocumentRevisions: WriterProjectDocumentRevisionsSchema,
  manifestFingerprint: WriterRevisionSchema,
  findings: z.array(WriterContinuityFindingSchema).max(WRITER_MAX_CONTINUITY_FINDINGS),
  ruleStats: z.array(WriterContinuityRuleStatSchema).length(6),
  truncated: z.boolean()
})
export type WriterContinuityAuditReport = z.infer<typeof WriterContinuityAuditReportSchema>

export const WriterContinuityWaiverSchema = z.strictObject({
  findingKey: WriterRevisionSchema,
  findingFingerprint: WriterRevisionSchema,
  reason: z.string().trim().min(1).max(2_000),
  createdAt: WriterTimestampSchema,
  updatedAt: WriterTimestampSchema
})
export type WriterContinuityWaiver = z.infer<typeof WriterContinuityWaiverSchema>

export const WriterContinuityReviewDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(WRITER_PROJECT_SCHEMA_VERSION),
    updatedAt: WriterTimestampSchema,
    report: WriterContinuityAuditReportSchema.optional(),
    coverageDeclarations: z.array(WriterContinuityCoverageDeclarationSchema).max(6).default([]),
    waivers: z.array(WriterContinuityWaiverSchema).max(WRITER_MAX_CONTINUITY_WAIVERS).default([])
  })
  .superRefine((review, context) => {
    const findingKeys = new Set<string>()
    for (const [index, waiver] of review.waivers.entries()) {
      if (findingKeys.has(waiver.findingKey)) {
        context.addIssue({
          code: 'custom',
          path: ['waivers', index, 'findingKey'],
          message: 'Continuity waiver finding keys must be unique'
        })
      }
      findingKeys.add(waiver.findingKey)
    }
    const coverageRules = new Set<WriterContinuityAuditRule>()
    for (const [index, declaration] of review.coverageDeclarations.entries()) {
      if (coverageRules.has(declaration.rule)) {
        context.addIssue({
          code: 'custom',
          path: ['coverageDeclarations', index, 'rule'],
          message: 'Coverage declarations must use unique rules'
        })
      }
      coverageRules.add(declaration.rule)
    }
  })
export type WriterContinuityReviewDocument = z.infer<typeof WriterContinuityReviewDocumentSchema>

export const WriterContinuityReviewRevisionSchema = z.union([
  WriterRevisionSchema,
  z.literal(WRITER_MISSING_CONTINUITY_REVIEW_REVISION)
])
export type WriterContinuityReviewRevision = z.infer<typeof WriterContinuityReviewRevisionSchema>

export const WriterContinuityFindingViewSchema = WriterContinuityFindingSchema.extend({
  state: z.enum(['open', 'exempted', 'stale_exemption']),
  waiver: WriterContinuityWaiverSchema.optional()
})
export type WriterContinuityFindingView = z.infer<typeof WriterContinuityFindingViewSchema>

export const WriterContinuityCoverageViewSchema = z.strictObject({
  rule: WriterContinuityAuditRuleSchema,
  status: z.enum(['checked', 'stale', 'insufficient_data']),
  throughChapterId: WriterEntityIdSchema.optional(),
  evaluatedItems: z.number().int().nonnegative(),
  staleItems: z.number().int().nonnegative().default(0),
  basisFingerprint: WriterRevisionSchema.optional(),
  note: z.string().max(2_000).default('')
})
export type WriterContinuityCoverageView = z.infer<typeof WriterContinuityCoverageViewSchema>

export const WriterContinuityReviewViewSchema = z.strictObject({
  revision: WriterContinuityReviewRevisionSchema,
  status: z.enum(['not_run', 'stale', 'issues', 'incomplete', 'clear']),
  stale: z.boolean(),
  targetChapterId: WriterEntityIdSchema,
  generatedAt: WriterTimestampSchema.optional(),
  sourceFingerprint: WriterRevisionSchema.optional(),
  findings: z.array(WriterContinuityFindingViewSchema).max(WRITER_MAX_CONTINUITY_FINDINGS),
  coverage: z.array(WriterContinuityCoverageViewSchema).length(6),
  orphanedWaivers: z.array(WriterContinuityWaiverSchema).max(WRITER_MAX_CONTINUITY_WAIVERS),
  truncated: z.boolean(),
  counts: z.strictObject({
    open: z.number().int().nonnegative(),
    exempted: z.number().int().nonnegative(),
    staleExemption: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    info: z.number().int().nonnegative()
  })
})
export type WriterContinuityReviewView = z.infer<typeof WriterContinuityReviewViewSchema>

export const WriterChapterDocumentSchema = z.strictObject({
  chapter: WriterChapterMetadataSchema,
  content: z.string().max(WRITER_MAX_CHAPTER_CHARS)
})
export type WriterChapterDocument = z.infer<typeof WriterChapterDocumentSchema>

export const WriterContextSourceKindSchema = z.enum([
  'author_goal',
  'story_premise',
  'genre',
  'theme',
  'hard_rule',
  'world_rule',
  'style_guide',
  'current_chapter',
  'chapter_plan',
  'story_arc',
  'character',
  'lore',
  'foreshadowing',
  'fact',
  'recent_summary',
  'recent_manuscript',
  'related_history'
])
export type WriterContextSourceKind = z.infer<typeof WriterContextSourceKindSchema>

export const WriterContextSourceSchema = z.strictObject({
  kind: WriterContextSourceKindSchema,
  label: z.string().min(1).max(500),
  content: z.string().min(1),
  priority: z.number().int().min(1).max(100),
  truncated: z.boolean().default(false)
})
export type WriterContextSource = z.infer<typeof WriterContextSourceSchema>

export const WriterLoreActivationReceiptSchema = z.strictObject({
  entryId: WriterEntityIdSchema,
  title: z.string().trim().min(1).max(200),
  activation: z.enum(['always', 'keyword']),
  matchedKeys: z.array(z.string().trim().min(1).max(200)).max(20),
  status: z.enum(['included', 'dropped']),
  truncated: z.boolean()
})
export type WriterLoreActivationReceipt = z.infer<typeof WriterLoreActivationReceiptSchema>

export const WriterContextPacketSchema = z.strictObject({
  projectId: WriterEntityIdSchema,
  chapterId: WriterEntityIdSchema,
  operation: WriterOperationSchema,
  generatedAt: WriterTimestampSchema,
  budgetChars: z.number().int().positive(),
  usedChars: z.number().int().nonnegative(),
  truncated: z.boolean(),
  sources: z.array(WriterContextSourceSchema).max(20_000),
  documentRevisions: WriterProjectDocumentRevisionsSchema.optional(),
  loreActivations: z.array(WriterLoreActivationReceiptSchema).max(500).optional()
})
export type WriterContextPacket = z.infer<typeof WriterContextPacketSchema>

export const WriterProposalSchema = z
  .strictObject({
    id: WriterEntityIdSchema,
    projectId: WriterEntityIdSchema,
    chapterId: WriterEntityIdSchema,
    baseRevision: WriterRevisionSchema,
    operation: WriterOperationSchema,
    instruction: z.string().max(20_000).optional(),
    uniqueModelId: UniqueModelIdSchema,
    mode: WriterProposalModeSchema,
    content: z.string().max(WRITER_MAX_PROPOSAL_CHARS),
    rationale: z.string().max(20_000).optional(),
    createdAt: WriterTimestampSchema,
    status: z.enum(['pending', 'applying', 'applied']),
    targetRevision: WriterRevisionSchema.optional(),
    appliedAt: WriterTimestampSchema.optional(),
    appliedMode: WriterProposalModeSchema.optional(),
    appliedRevision: WriterRevisionSchema.optional(),
    contextPacket: WriterContextPacketSchema
  })
  .superRefine((proposal, ctx) => {
    if (proposal.status === 'applying' && (!proposal.targetRevision || !proposal.appliedMode)) {
      ctx.addIssue({ code: 'custom', message: 'Applying writer proposals require targetRevision and appliedMode' })
    }
    if (
      proposal.status === 'applied' &&
      (!proposal.targetRevision || !proposal.appliedAt || !proposal.appliedMode || !proposal.appliedRevision)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Applied writer proposals require complete application metadata' })
    }
  })
export type WriterProposal = z.infer<typeof WriterProposalSchema>

export const WriterProposalSummarySchema = z.strictObject({
  id: WriterEntityIdSchema,
  chapterId: WriterEntityIdSchema,
  baseRevision: WriterRevisionSchema,
  operation: WriterOperationSchema,
  uniqueModelId: UniqueModelIdSchema,
  mode: WriterProposalModeSchema,
  createdAt: WriterTimestampSchema,
  status: z.enum(['pending', 'applying', 'applied']),
  appliedRevision: WriterRevisionSchema.optional()
})
export type WriterProposalSummary = z.infer<typeof WriterProposalSummarySchema>

export const WriterHistoryFileNameSchema = z.string().regex(/^\d{13}-[a-f0-9]{12}-[A-Za-z0-9][A-Za-z0-9-]{0,127}\.md$/)
export type WriterHistoryFileName = z.infer<typeof WriterHistoryFileNameSchema>

export const WriterHistorySummarySchema = z.strictObject({
  fileName: WriterHistoryFileNameSchema,
  createdAt: WriterTimestampSchema,
  revision: WriterRevisionSchema,
  characterCount: z.number().int().nonnegative().max(WRITER_MAX_CHAPTER_CHARS)
})
export type WriterHistorySummary = z.infer<typeof WriterHistorySummarySchema>

export const WriterHistorySnapshotSchema = WriterHistorySummarySchema.extend({
  content: z.string().max(WRITER_MAX_CHAPTER_CHARS)
})
export type WriterHistorySnapshot = z.infer<typeof WriterHistorySnapshotSchema>

export const WriterGenerationOutputSchema = z.strictObject({
  proposalId: WriterEntityIdSchema
})
export type WriterGenerationOutput = z.infer<typeof WriterGenerationOutputSchema>

export const WriterProjectCreateInputSchema = z.strictObject({
  parentDirectory: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  initialChapterTitle: z.string().trim().min(1).max(200).optional(),
  genre: z.string().trim().max(200).optional(),
  premise: z.string().trim().max(10_000).optional(),
  targetWordCount: z.number().int().positive().max(100_000_000).optional()
})
export type WriterProjectCreateInput = z.infer<typeof WriterProjectCreateInputSchema>

export const WriterProjectOpenInputSchema = z.strictObject({ rootPath: z.string().trim().min(1) })
export type WriterProjectOpenInput = z.infer<typeof WriterProjectOpenInputSchema>

export const WriterChapterCreateInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200).optional()
})
export type WriterChapterCreateInput = z.infer<typeof WriterChapterCreateInputSchema>

export const WriterChapterReadInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WriterEntityIdSchema
})
export type WriterChapterReadInput = z.infer<typeof WriterChapterReadInputSchema>

export const WriterChapterSaveInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WriterEntityIdSchema,
  content: z.string().max(WRITER_MAX_CHAPTER_CHARS),
  expectedRevision: WriterRevisionSchema
})
export type WriterChapterSaveInput = z.infer<typeof WriterChapterSaveInputSchema>

export const WriterStoryBibleSaveInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  storyBible: WriterStoryBibleSchema,
  expectedRevision: WriterRevisionSchema
})
export type WriterStoryBibleSaveInput = z.infer<typeof WriterStoryBibleSaveInputSchema>

export const WriterOutlineSaveInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  outline: WriterOutlineSchema,
  expectedRevision: WriterRevisionSchema
})
export type WriterOutlineSaveInput = z.infer<typeof WriterOutlineSaveInputSchema>

export const WriterContinuitySaveInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  continuity: WriterContinuityLedgerSchema,
  expectedRevision: WriterRevisionSchema
})
export type WriterContinuitySaveInput = z.infer<typeof WriterContinuitySaveInputSchema>

export const WriterContinuityReviewReadInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  targetChapterId: WriterEntityIdSchema.optional()
})
export type WriterContinuityReviewReadInput = z.infer<typeof WriterContinuityReviewReadInputSchema>

export const WriterContinuityReviewRunInputSchema = WriterContinuityReviewReadInputSchema.extend({
  expectedRevision: WriterContinuityReviewRevisionSchema
})
export type WriterContinuityReviewRunInput = z.infer<typeof WriterContinuityReviewRunInputSchema>

export const WriterContinuityWaiveInputSchema = WriterContinuityReviewReadInputSchema.extend({
  findingKey: WriterRevisionSchema,
  findingFingerprint: WriterRevisionSchema,
  reason: z.string().trim().min(1).max(2_000),
  expectedRevision: WriterContinuityReviewRevisionSchema
})
export type WriterContinuityWaiveInput = z.infer<typeof WriterContinuityWaiveInputSchema>

export const WriterContinuityUnwaiveInputSchema = WriterContinuityReviewReadInputSchema.extend({
  findingKey: WriterRevisionSchema,
  expectedRevision: WriterContinuityReviewRevisionSchema
})
export type WriterContinuityUnwaiveInput = z.infer<typeof WriterContinuityUnwaiveInputSchema>

export const WriterContinuityCoverageUpdateInputSchema = WriterContinuityReviewReadInputSchema.extend({
  rule: WriterContinuityAuditRuleSchema,
  covered: z.boolean(),
  note: z.string().trim().max(2_000).optional(),
  expectedRevision: WriterContinuityReviewRevisionSchema
})
export type WriterContinuityCoverageUpdateInput = z.infer<typeof WriterContinuityCoverageUpdateInputSchema>

export const WriterGenerationStartInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WriterEntityIdSchema.optional(),
  operation: WriterOperationSchema,
  instruction: z.string().trim().max(20_000).optional(),
  uniqueModelId: UniqueModelIdSchema.optional()
})
export type WriterGenerationStartInput = z.infer<typeof WriterGenerationStartInputSchema>

export const WriterGenerationStartResultSchema = JobSnapshotSchema
export type WriterGenerationStartResult = JobSnapshot

export const WriterGenerationCancelInputSchema = z.strictObject({ jobId: z.string().trim().min(1) })
export type WriterGenerationCancelInput = z.infer<typeof WriterGenerationCancelInputSchema>

export const WriterGenerationCancelResultSchema = z.strictObject({ cancelled: z.boolean() })
export type WriterGenerationCancelResult = z.infer<typeof WriterGenerationCancelResultSchema>

export const WriterProposalApplyInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  proposalId: WriterEntityIdSchema,
  mode: WriterProposalModeSchema,
  expectedRevision: WriterRevisionSchema
})
export type WriterProposalApplyInput = z.infer<typeof WriterProposalApplyInputSchema>

export const WriterProposalListInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WriterEntityIdSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50)
})
export type WriterProposalListInput = z.infer<typeof WriterProposalListInputSchema>

export const WriterProposalListResultSchema = z.strictObject({
  proposals: z.array(WriterProposalSummarySchema).max(200)
})
export type WriterProposalListResult = z.infer<typeof WriterProposalListResultSchema>

export const WriterProposalReadInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  proposalId: WriterEntityIdSchema
})
export type WriterProposalReadInput = z.infer<typeof WriterProposalReadInputSchema>

export const WriterHistoryListInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WriterEntityIdSchema,
  limit: z.number().int().min(1).max(200).default(50)
})
export type WriterHistoryListInput = z.infer<typeof WriterHistoryListInputSchema>

export const WriterHistoryListResultSchema = z.strictObject({
  history: z.array(WriterHistorySummarySchema).max(200)
})
export type WriterHistoryListResult = z.infer<typeof WriterHistoryListResultSchema>

export const WriterHistoryReadInputSchema = z.strictObject({
  rootPath: z.string().trim().min(1),
  chapterId: WriterEntityIdSchema,
  fileName: WriterHistoryFileNameSchema
})
export type WriterHistoryReadInput = z.infer<typeof WriterHistoryReadInputSchema>

export const WriterHistoryRestoreInputSchema = WriterHistoryReadInputSchema.extend({
  expectedRevision: WriterRevisionSchema
})
export type WriterHistoryRestoreInput = z.infer<typeof WriterHistoryRestoreInputSchema>
