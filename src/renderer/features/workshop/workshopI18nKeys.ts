import type {
  WorkshopCollection,
  WorkshopInvariantRule,
  WorkshopProposalStatus,
  WorkshopTimelineEntry
} from '@shared/types/workshop'

// t() 禁用模板字面量动态 key(i18n/no-template-in-t),封闭集合到文案 key 的映射集中在此维护。

export const WORKSHOP_COLLECTION_LABEL_KEYS: Record<WorkshopCollection, string> = {
  'codex/characters': 'workshop.collections.codex_characters',
  'codex/lore': 'workshop.collections.codex_lore',
  'codex/rules': 'workshop.collections.codex_rules',
  'ledger/events': 'workshop.collections.ledger_events',
  'ledger/facts': 'workshop.collections.ledger_facts',
  'ledger/foreshadowing': 'workshop.collections.ledger_foreshadowing',
  'ledger/states': 'workshop.collections.ledger_states',
  'ledger/summaries': 'workshop.collections.ledger_summaries',
  'outline/arcs': 'workshop.collections.outline_arcs',
  'outline/chapters': 'workshop.collections.outline_chapters',
  'outline/volumes': 'workshop.collections.outline_volumes'
}

export const WORKSHOP_INVARIANT_RULE_LABEL_KEYS: Record<WorkshopInvariantRule, string> = {
  character_life_conflict: 'workshop.invariants.rule_character_life_conflict',
  character_resurrection: 'workshop.invariants.rule_character_resurrection',
  duplicate_volume_membership: 'workshop.invariants.rule_duplicate_volume_membership',
  foreshadowing_chronology: 'workshop.invariants.rule_foreshadowing_chronology',
  foreshadowing_overdue: 'workshop.invariants.rule_foreshadowing_overdue',
  foreshadowing_state_mismatch: 'workshop.invariants.rule_foreshadowing_state_mismatch',
  invalid_reference: 'workshop.invariants.rule_invalid_reference',
  missing_summary: 'workshop.invariants.rule_missing_summary',
  plan_status_mismatch: 'workshop.invariants.rule_plan_status_mismatch',
  timeline_regression: 'workshop.invariants.rule_timeline_regression'
}

export const WORKSHOP_TIMELINE_KIND_LABEL_KEYS: Record<WorkshopTimelineEntry['kind'], string> = {
  canon_edit: 'workshop.timeline.kind_canon_edit',
  init: 'workshop.timeline.kind_init',
  proposal_applied: 'workshop.timeline.kind_proposal_applied',
  rollback: 'workshop.timeline.kind_rollback'
}

export const WORKSHOP_PROPOSAL_STATUS_LABEL_KEYS: Record<WorkshopProposalStatus, string> = {
  applied: 'workshop.proposals.status_applied',
  pending: 'workshop.proposals.status_pending',
  rejected: 'workshop.proposals.status_rejected'
}

export const WORKSHOP_PROPOSAL_FILTER_LABEL_KEYS: Record<'all' | WorkshopProposalStatus, string> = {
  all: 'workshop.proposals.filter_all',
  applied: 'workshop.proposals.filter_applied',
  pending: 'workshop.proposals.filter_pending',
  rejected: 'workshop.proposals.filter_rejected'
}

export const WORKSHOP_ROLE_LABEL_KEYS: Record<'planner' | 'writer' | 'reviewer' | 'guardian' | 'cycle', string> = {
  cycle: 'workshop.generate.role_cycle',
  guardian: 'workshop.generate.role_guardian',
  planner: 'workshop.generate.role_planner',
  reviewer: 'workshop.generate.role_reviewer',
  writer: 'workshop.generate.role_writer'
}

export const WORKSHOP_NAV_GROUP_LABEL_KEYS: Record<'codex' | 'outline' | 'ledger', string> = {
  codex: 'workshop.nav.group_codex',
  ledger: 'workshop.nav.group_ledger',
  outline: 'workshop.nav.group_outline'
}

export const WORKSHOP_VOLUME_STOP_REASON_LABEL_KEYS: Record<
  'volume_done' | 'quality_gate' | 'review_gate' | 'max_chapters' | 'stale_canon',
  string
> = {
  max_chapters: 'workshop.volume.reason_max_chapters',
  quality_gate: 'workshop.volume.reason_quality_gate',
  review_gate: 'workshop.volume.reason_review_gate',
  stale_canon: 'workshop.volume.reason_stale_canon',
  volume_done: 'workshop.volume.reason_volume_done'
}
