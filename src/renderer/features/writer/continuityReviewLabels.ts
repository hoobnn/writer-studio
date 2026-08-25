import type {
  WriterContinuityAuditRule,
  WriterContinuityCoverageView,
  WriterContinuityEvidence,
  WriterContinuityFindingRule,
  WriterContinuityFindingSuggestion,
  WriterContinuityFindingView,
  WriterContinuityReviewView
} from '@shared/types/writer'

export const CONTINUITY_REVIEW_STATUS_KEYS = {
  not_run: 'writer.continuity_review.status.not_run',
  stale: 'writer.continuity_review.status.stale',
  issues: 'writer.continuity_review.status.issues',
  incomplete: 'writer.continuity_review.status.incomplete',
  clear: 'writer.continuity_review.status.clear'
} as const satisfies Record<WriterContinuityReviewView['status'], string>

export const CONTINUITY_COVERAGE_RULE_KEYS = {
  timeline: 'writer.continuity_review.coverage_rules.timeline',
  character_location: 'writer.continuity_review.coverage_rules.character_location',
  character_life: 'writer.continuity_review.coverage_rules.character_life',
  foreshadowing_due: 'writer.continuity_review.coverage_rules.foreshadowing_due',
  future_information: 'writer.continuity_review.coverage_rules.future_information',
  chapter_plan: 'writer.continuity_review.coverage_rules.chapter_plan'
} as const satisfies Record<WriterContinuityAuditRule, string>

export const CONTINUITY_COVERAGE_STATUS_KEYS = {
  checked: 'writer.continuity_review.coverage_status.checked',
  stale: 'writer.continuity_review.coverage_status.stale',
  insufficient_data: 'writer.continuity_review.coverage_status.insufficient_data'
} as const satisfies Record<WriterContinuityCoverageView['status'], string>

export const CONTINUITY_FINDING_SEVERITY_KEYS = {
  error: 'writer.continuity_review.severity.error',
  warning: 'writer.continuity_review.severity.warning',
  info: 'writer.continuity_review.severity.info'
} as const satisfies Record<WriterContinuityFindingView['severity'], string>

export const CONTINUITY_FINDING_STATE_KEYS = {
  open: 'writer.continuity_review.states.open',
  exempted: 'writer.continuity_review.states.exempted',
  stale_exemption: 'writer.continuity_review.states.stale_exemption'
} as const satisfies Record<WriterContinuityFindingView['state'], string>

export const CONTINUITY_FINDING_RULE_KEYS = {
  invalid_reference: 'writer.continuity_review.rules.invalid_reference',
  timeline_regression: 'writer.continuity_review.rules.timeline_regression',
  foreshadowing_chronology: 'writer.continuity_review.rules.foreshadowing_chronology',
  foreshadowing_state_mismatch: 'writer.continuity_review.rules.foreshadowing_state_mismatch',
  character_location_conflict: 'writer.continuity_review.rules.character_location_conflict',
  character_life_conflict: 'writer.continuity_review.rules.character_life_conflict',
  character_resurrection: 'writer.continuity_review.rules.character_resurrection',
  foreshadowing_overdue: 'writer.continuity_review.rules.foreshadowing_overdue',
  future_information: 'writer.continuity_review.rules.future_information',
  chapter_plan_deviation: 'writer.continuity_review.rules.chapter_plan_deviation',
  chapter_plan_assessment_stale: 'writer.continuity_review.rules.chapter_plan_assessment_stale'
} as const satisfies Record<WriterContinuityFindingRule, string>

export const CONTINUITY_EVIDENCE_KIND_KEYS = {
  manifest: 'writer.continuity_review.evidence_kinds.manifest',
  story_arc: 'writer.continuity_review.evidence_kinds.story_arc',
  fact: 'writer.continuity_review.evidence_kinds.fact',
  foreshadowing: 'writer.continuity_review.evidence_kinds.foreshadowing',
  timeline_event: 'writer.continuity_review.evidence_kinds.timeline_event',
  character_state: 'writer.continuity_review.evidence_kinds.character_state',
  chapter_summary: 'writer.continuity_review.evidence_kinds.chapter_summary',
  chapter_plan: 'writer.continuity_review.evidence_kinds.chapter_plan'
} as const satisfies Record<WriterContinuityEvidence['kind'], string>

export const CONTINUITY_FINDING_SUGGESTION_KEYS = {
  repair_reference: 'writer.continuity_review.suggestions.repair_reference',
  repair_timeline: 'writer.continuity_review.suggestions.repair_timeline',
  resolve_location: 'writer.continuity_review.suggestions.resolve_location',
  resolve_life_state: 'writer.continuity_review.suggestions.resolve_life_state',
  explain_resurrection: 'writer.continuity_review.suggestions.explain_resurrection',
  resolve_or_reschedule_foreshadowing: 'writer.continuity_review.suggestions.resolve_or_reschedule_foreshadowing',
  move_information_reveal: 'writer.continuity_review.suggestions.move_information_reveal',
  update_plan_or_mark_intentional: 'writer.continuity_review.suggestions.update_plan_or_mark_intentional',
  refresh_plan_assessment: 'writer.continuity_review.suggestions.refresh_plan_assessment'
} as const satisfies Record<WriterContinuityFindingSuggestion, string>
