import { createHash } from 'node:crypto'

import { writerErrorCodes } from '@shared/ipc/errors/writer'
import {
  WRITER_MAX_CONTINUITY_AUDIT_OBSERVATIONS,
  WRITER_MAX_CONTINUITY_FINDINGS,
  WRITER_MAX_CONTINUITY_REVIEW_REPORT_BYTES,
  WRITER_MISSING_CONTINUITY_REVIEW_REVISION,
  type WriterCharacterState,
  type WriterContinuityAuditReport,
  type WriterContinuityAuditRule,
  type WriterContinuityCoverageDeclaration,
  type WriterContinuityCoverageView,
  type WriterContinuityEvidence,
  type WriterContinuityFinding,
  type WriterContinuityFindingRule,
  type WriterContinuityFindingSuggestion,
  type WriterContinuityFindingView,
  type WriterContinuityReviewDocument,
  type WriterContinuityReviewRevision,
  type WriterContinuityReviewView,
  type WriterContinuityRuleStat,
  type WriterProject,
  type WriterTimelineEvent
} from '@shared/types/writer'
import { clampSurrogateBoundary } from '@shared/utils/text'

import { WriterStudioError } from './writerErrors'

const AUDIT_RULES: readonly WriterContinuityAuditRule[] = [
  'timeline',
  'character_location',
  'character_life',
  'foreshadowing_due',
  'future_information',
  'chapter_plan'
]

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

interface FindingInput {
  rule: WriterContinuityFindingRule
  severity: WriterContinuityFinding['severity']
  exemptible: boolean
  chapterIds?: string[]
  entityIds?: string[]
  evidence: WriterContinuityEvidence[]
  suggestion: WriterContinuityFindingSuggestion
  identity: unknown
  basis: unknown
}

export interface CompileWriterContinuityAuditInput {
  project: WriterProject
  targetChapterId?: string
  now?: Date
}

export interface BuildWriterContinuityReviewViewInput {
  project: WriterProject
  targetChapterId?: string
  document?: WriterContinuityReviewDocument
  revision?: WriterContinuityReviewRevision
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function finding(input: FindingInput): WriterContinuityFinding {
  const identity = { version: 1, rule: input.rule, subject: input.identity }
  const chapterIds = uniqueSorted(input.chapterIds ?? [])
  const entityIds = uniqueSorted(input.entityIds ?? [])
  const evidenceItems = input.evidence.slice(0, 100)
  return {
    key: sha256(identity),
    fingerprint: sha256({ ...identity, basis: input.basis }),
    ruleVersion: 1,
    rule: input.rule,
    severity: input.severity,
    exemptible: input.exemptible,
    chapterIds: chapterIds.slice(0, 100),
    entityIds: entityIds.slice(0, 100),
    evidence: evidenceItems,
    evidenceTruncated:
      chapterIds.length > 100 ||
      entityIds.length > 100 ||
      input.evidence.length > 100 ||
      input.evidence.some((item) => item.truncated),
    suggestion: input.suggestion
  }
}

function manifestFingerprint(project: WriterProject): string {
  return sha256(
    project.manifest.chapters
      .map((chapter) => ({
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        revision: chapter.revision,
        updatedAt: chapter.updatedAt
      }))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  )
}

export function writerContinuitySourceFingerprint(project: WriterProject, targetChapterId: string): string {
  return sha256({
    targetChapterId,
    documentRevisions: project.documentRevisions,
    manifestFingerprint: manifestFingerprint(project)
  })
}

function targetChapter(project: WriterProject, requested?: string) {
  const targetId = requested ?? project.manifest.activeChapterId
  const target = project.manifest.chapters.find((chapter) => chapter.id === targetId)
  if (!target) throw new WriterStudioError(writerErrorCodes.CHAPTER_NOT_FOUND, 'Writer audit target chapter not found')
  return target
}

function evidence(
  kind: WriterContinuityEvidence['kind'],
  sourceId: string,
  label: string,
  chapterId?: string,
  detail = ''
): WriterContinuityEvidence {
  const boundedLabel = label.length <= 2_000 ? label : label.slice(0, clampSurrogateBoundary(label, 2_000))
  const boundedDetail = detail.length <= 10_000 ? detail : detail.slice(0, clampSurrogateBoundary(detail, 10_000))
  return {
    kind,
    sourceId,
    label: boundedLabel,
    detail: boundedDetail,
    truncated: boundedLabel.length < label.length || boundedDetail.length < detail.length,
    ...(chapterId ? { chapterId } : {})
  }
}

function normalizedStateValue(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US')
}

function assertAuditObservationLimit(project: WriterProject): void {
  let count =
    project.outline.chapterPlans.length +
    project.outline.arcs.length +
    project.continuity.facts.length +
    project.continuity.foreshadowing.length +
    project.continuity.chapterSummaries.length +
    (project.continuity.timelineEvents?.length ?? 0) +
    (project.continuity.characterStates?.length ?? 0)
  const add = (value: number) => {
    count += value
    if (count > WRITER_MAX_CONTINUITY_AUDIT_OBSERVATIONS) {
      throw new WriterStudioError(
        writerErrorCodes.CONTINUITY_CHECK_FAILED,
        'Writer continuity audit input exceeds the safe observation limit',
        { actualObservations: count, maxObservations: WRITER_MAX_CONTINUITY_AUDIT_OBSERVATIONS }
      )
    }
  }
  for (const arc of project.outline.arcs) add(arc.chapterIds.length)
  for (const plan of project.outline.chapterPlans) add(plan.requirements?.length ?? 0)
  for (const fact of project.continuity.facts) add(fact.usedInChapterIds?.length ?? 0)
  for (const summary of project.continuity.chapterSummaries) add(summary.requirementAssessments?.length ?? 0)
  add(0)
}

function statePosition(
  state: Pick<WriterCharacterState, 'chapterId' | 'sequence' | 'id'>,
  orderByChapterId: ReadonlyMap<string, number>
): readonly [number, number, string] {
  return [orderByChapterId.get(state.chapterId) ?? Number.MAX_SAFE_INTEGER, state.sequence, state.id]
}

function comparePosition(left: readonly [number, number, string], right: readonly [number, number, string]): number {
  return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2])
}

function ruleStats(
  values: Partial<Record<WriterContinuityAuditRule, number>>,
  staleValues: Partial<Record<WriterContinuityAuditRule, number>>,
  bases: Record<WriterContinuityAuditRule, unknown>
): WriterContinuityRuleStat[] {
  return AUDIT_RULES.map((rule) => ({
    rule,
    evaluatedItems: values[rule] ?? 0,
    staleItems: staleValues[rule] ?? 0,
    basisFingerprint: sha256({ rule, basis: bases[rule] })
  }))
}

export function compileWriterContinuityAudit(input: CompileWriterContinuityAuditInput): WriterContinuityAuditReport {
  const { project } = input
  assertAuditObservationLimit(project)
  const target = targetChapter(project, input.targetChapterId)
  const chapterById = new Map(project.manifest.chapters.map((chapter) => [chapter.id, chapter]))
  const orderByChapterId = new Map(project.manifest.chapters.map((chapter) => [chapter.id, chapter.order]))
  const targetOrder = target.order
  const characterById = new Map(project.storyBible.characters.map((character) => [character.id, character]))
  const findingByKey = new Map<string, WriterContinuityFinding>()
  const stats: Partial<Record<WriterContinuityAuditRule, number>> = {}
  const staleStats: Partial<Record<WriterContinuityAuditRule, number>> = {}
  let findingsBytes = 2
  let reportTruncated = false

  const add = (next: FindingInput) => {
    const compiled = finding(next)
    const existing = findingByKey.get(compiled.key)
    if (existing) {
      if (existing.fingerprint !== compiled.fingerprint) {
        throw new WriterStudioError(
          writerErrorCodes.CONTINUITY_CHECK_FAILED,
          'Writer continuity finding identity collision'
        )
      }
      return
    }
    if (compiled.evidenceTruncated) reportTruncated = true
    if (findingByKey.size >= WRITER_MAX_CONTINUITY_FINDINGS) {
      reportTruncated = true
      return
    }
    const nextBytes = Buffer.byteLength(JSON.stringify(compiled), 'utf8') + (findingByKey.size > 0 ? 1 : 0)
    if (findingsBytes + nextBytes > WRITER_MAX_CONTINUITY_REVIEW_REPORT_BYTES) {
      reportTruncated = true
      return
    }
    findingByKey.set(compiled.key, compiled)
    findingsBytes += nextBytes
  }
  const invalidChapterReference = (
    kind: WriterContinuityEvidence['kind'],
    sourceId: string,
    label: string,
    chapterId: string,
    entityIds: string[] = []
  ) =>
    add({
      rule: 'invalid_reference',
      severity: 'error',
      exemptible: false,
      chapterIds: [chapterId],
      entityIds,
      evidence: [evidence(kind, sourceId, label, chapterId)],
      suggestion: 'repair_reference',
      identity: [kind, sourceId, 'chapter', chapterId],
      basis: [chapterId]
    })

  for (const plan of project.outline.chapterPlans) {
    if (!chapterById.has(plan.chapterId)) {
      invalidChapterReference('chapter_plan', plan.chapterId, plan.title, plan.chapterId)
    }
  }
  for (const arc of project.outline.arcs) {
    for (const chapterId of arc.chapterIds) {
      if (!chapterById.has(chapterId)) invalidChapterReference('story_arc', arc.id, arc.title, chapterId, [arc.id])
    }
  }

  for (const fact of project.continuity.facts) {
    if (fact.sourceChapterId && !chapterById.has(fact.sourceChapterId)) {
      invalidChapterReference('fact', fact.id, `${fact.subject} ${fact.predicate}`, fact.sourceChapterId, [fact.id])
    }
    for (const usedChapterId of new Set(fact.usedInChapterIds ?? [])) {
      if (!chapterById.has(usedChapterId)) {
        invalidChapterReference('fact', fact.id, `${fact.subject} ${fact.predicate}`, usedChapterId, [fact.id])
      }
    }
  }
  for (const item of project.continuity.foreshadowing) {
    for (const chapterId of [item.plantedChapterId, item.resolvedChapterId, item.dueChapterId]) {
      if (chapterId && !chapterById.has(chapterId)) {
        invalidChapterReference('foreshadowing', item.id, item.description, chapterId, [item.id])
      }
    }
    const statusMismatch =
      (item.status === 'resolved' && !item.resolvedChapterId) ||
      (item.status !== 'resolved' && Boolean(item.resolvedChapterId))
    if (statusMismatch) {
      add({
        rule: 'foreshadowing_state_mismatch',
        severity: 'error',
        exemptible: false,
        chapterIds: [item.plantedChapterId, item.resolvedChapterId].filter((value): value is string => Boolean(value)),
        entityIds: [item.id],
        evidence: [evidence('foreshadowing', item.id, item.description, item.resolvedChapterId)],
        suggestion: 'repair_timeline',
        identity: [item.id, 'status'],
        basis: [item.status, item.resolvedChapterId]
      })
    }
  }
  for (const summary of project.continuity.chapterSummaries) {
    if (!chapterById.has(summary.chapterId)) {
      invalidChapterReference(
        'chapter_summary',
        summary.chapterId,
        summary.summary || summary.chapterId,
        summary.chapterId
      )
    }
  }
  for (const event of project.continuity.timelineEvents ?? []) {
    if (!chapterById.has(event.chapterId)) {
      invalidChapterReference('timeline_event', event.id, event.label, event.chapterId, [event.id])
    }
  }
  for (const state of project.continuity.characterStates ?? []) {
    if (!chapterById.has(state.chapterId)) {
      invalidChapterReference('character_state', state.id, state.evidence || state.id, state.chapterId, [state.id])
    }
    if (!characterById.has(state.characterId)) {
      add({
        rule: 'invalid_reference',
        severity: 'error',
        exemptible: false,
        chapterIds: [state.chapterId],
        entityIds: [state.id, state.characterId],
        evidence: [evidence('character_state', state.id, state.evidence || state.id, state.chapterId)],
        suggestion: 'repair_reference',
        identity: ['character_state', state.id, 'character', state.characterId],
        basis: [state.characterId]
      })
    }
  }

  const timelineEvents = (project.continuity.timelineEvents ?? [])
    .filter((event) => (orderByChapterId.get(event.chapterId) ?? Number.MAX_SAFE_INTEGER) <= targetOrder)
    .toSorted((left, right) =>
      comparePosition(statePosition(left, orderByChapterId), statePosition(right, orderByChapterId))
    )
  stats.timeline = timelineEvents.length + project.continuity.foreshadowing.length
  const latestTimelineEventByTimeline = new Map<string, WriterTimelineEvent>()
  for (const event of timelineEvents) {
    const latestTimelineEvent = latestTimelineEventByTimeline.get(event.timelineId)
    if (latestTimelineEvent && event.storyTime < latestTimelineEvent.storyTime) {
      add({
        rule: 'timeline_regression',
        severity: 'error',
        exemptible: true,
        chapterIds: [latestTimelineEvent.chapterId, event.chapterId],
        entityIds: [latestTimelineEvent.id, event.id],
        evidence: [
          evidence(
            'timeline_event',
            latestTimelineEvent.id,
            latestTimelineEvent.label,
            latestTimelineEvent.chapterId,
            latestTimelineEvent.evidence
          ),
          evidence('timeline_event', event.id, event.label, event.chapterId, event.evidence)
        ],
        suggestion: 'repair_timeline',
        identity: [event.timelineId, latestTimelineEvent.id, event.id],
        basis: [latestTimelineEvent.storyTime, event.storyTime]
      })
    }
    if (!latestTimelineEvent || event.storyTime >= latestTimelineEvent.storyTime) {
      latestTimelineEventByTimeline.set(event.timelineId, event)
    }
  }
  for (const item of project.continuity.foreshadowing) {
    const plantedOrder = item.plantedChapterId ? orderByChapterId.get(item.plantedChapterId) : undefined
    const resolvedOrder = item.resolvedChapterId ? orderByChapterId.get(item.resolvedChapterId) : undefined
    const dueOrder = item.dueChapterId ? orderByChapterId.get(item.dueChapterId) : undefined
    if (
      plantedOrder !== undefined &&
      ((resolvedOrder !== undefined && resolvedOrder < plantedOrder) ||
        (dueOrder !== undefined && dueOrder < plantedOrder))
    ) {
      add({
        rule: 'foreshadowing_chronology',
        severity: 'error',
        exemptible: false,
        chapterIds: [item.plantedChapterId, item.resolvedChapterId, item.dueChapterId].filter(
          (value): value is string => Boolean(value)
        ),
        entityIds: [item.id],
        evidence: [evidence('foreshadowing', item.id, item.description, item.plantedChapterId)],
        suggestion: 'repair_timeline',
        identity: [item.id, 'chronology'],
        basis: [item.plantedChapterId, item.resolvedChapterId, item.dueChapterId]
      })
    }
  }

  const validStates = (project.continuity.characterStates ?? []).filter(
    (state) =>
      characterById.has(state.characterId) &&
      (orderByChapterId.get(state.chapterId) ?? Number.MAX_SAFE_INTEGER) <= targetOrder
  )
  const locationStates = validStates.filter((state) => state.location.length > 0)
  stats.character_location = locationStates.length
  const locationGroups = new Map<string, WriterCharacterState[]>()
  for (const state of locationStates) {
    const groupKey = `${state.timelineId}:${state.characterId}:${state.chapterId}:${state.sequence}`
    const group = locationGroups.get(groupKey) ?? []
    group.push(state)
    locationGroups.set(groupKey, group)
  }
  for (const group of locationGroups.values()) {
    const locations = new Set(group.map((state) => normalizedStateValue(state.location)))
    if (locations.size <= 1) continue
    const first = group[0]
    const character = characterById.get(first.characterId)
    add({
      rule: 'character_location_conflict',
      severity: 'error',
      exemptible: true,
      chapterIds: [first.chapterId],
      entityIds: [first.characterId, ...group.map((state) => state.id)],
      evidence: group
        .toSorted((left, right) => left.id.localeCompare(right.id))
        .map((state) =>
          evidence('character_state', state.id, character?.name ?? state.characterId, state.chapterId, state.location)
        ),
      suggestion: 'resolve_location',
      identity: [first.timelineId, first.characterId, first.chapterId, first.sequence],
      basis: group
        .map((state) => [state.id, state.location, state.evidence])
        .sort(([left], [right]) => String(left).localeCompare(String(right)))
    })
  }

  const lifeStates = validStates.filter((state) => state.lifeStatus !== 'unknown')
  stats.character_life = lifeStates.length
  const lifeByCharacter = new Map<string, { timelineId: string; characterId: string; states: WriterCharacterState[] }>()
  for (const state of lifeStates) {
    const key = `${state.timelineId}:${state.characterId}`
    const group = lifeByCharacter.get(key) ?? {
      timelineId: state.timelineId,
      characterId: state.characterId,
      states: []
    }
    group.states.push(state)
    lifeByCharacter.set(key, group)
  }
  for (const { timelineId, characterId, states } of lifeByCharacter.values()) {
    const ordered = states.toSorted((left, right) =>
      comparePosition(statePosition(left, orderByChapterId), statePosition(right, orderByChapterId))
    )
    const simultaneous = new Map<string, WriterCharacterState[]>()
    for (const state of ordered) {
      const groupKey = `${state.chapterId}:${state.sequence}`
      const group = simultaneous.get(groupKey) ?? []
      group.push(state)
      simultaneous.set(groupKey, group)
    }
    let lastDead: WriterCharacterState | undefined
    for (const group of simultaneous.values()) {
      if (new Set(group.map((state) => state.lifeStatus)).size > 1) {
        add({
          rule: 'character_life_conflict',
          severity: 'error',
          exemptible: true,
          chapterIds: [group[0].chapterId],
          entityIds: [characterId, ...group.map((state) => state.id)],
          evidence: group.map((state) =>
            evidence(
              'character_state',
              state.id,
              characterById.get(characterId)?.name ?? characterId,
              state.chapterId,
              state.evidence
            )
          ),
          suggestion: 'resolve_life_state',
          identity: [timelineId, characterId, group[0].chapterId, group[0].sequence],
          basis: group.map((state) => [state.id, state.lifeStatus, state.evidence])
        })
        continue
      }
      const state = group.toSorted((left, right) => left.id.localeCompare(right.id))[0]
      if (state.lifeStatus === 'dead') {
        lastDead = state
        continue
      }
      if (state.lifeStatus === 'alive' && lastDead) {
        if (!state.transitionExplanation) {
          add({
            rule: 'character_resurrection',
            severity: 'error',
            exemptible: true,
            chapterIds: [lastDead.chapterId, state.chapterId],
            entityIds: [characterId, lastDead.id, state.id],
            evidence: [
              evidence(
                'character_state',
                lastDead.id,
                characterById.get(characterId)?.name ?? characterId,
                lastDead.chapterId,
                lastDead.evidence
              ),
              evidence(
                'character_state',
                state.id,
                characterById.get(characterId)?.name ?? characterId,
                state.chapterId,
                state.evidence
              )
            ],
            suggestion: 'explain_resurrection',
            identity: [timelineId, characterId, lastDead.id, state.id],
            basis: [lastDead.lifeStatus, state.lifeStatus, state.transitionExplanation]
          })
        }
        lastDead = undefined
      }
    }
  }

  const dueItems = project.continuity.foreshadowing.filter((item) => Boolean(item.dueChapterId))
  stats.foreshadowing_due = dueItems.length
  for (const item of dueItems) {
    const dueOrder = item.dueChapterId ? orderByChapterId.get(item.dueChapterId) : undefined
    if (item.status === 'open' && dueOrder !== undefined && dueOrder < targetOrder) {
      add({
        rule: 'foreshadowing_overdue',
        severity: 'warning',
        exemptible: true,
        chapterIds: [item.plantedChapterId, item.dueChapterId, target.id].filter((value): value is string =>
          Boolean(value)
        ),
        entityIds: [item.id],
        evidence: [evidence('foreshadowing', item.id, item.description, item.dueChapterId)],
        suggestion: 'resolve_or_reschedule_foreshadowing',
        identity: [item.id, 'overdue'],
        basis: [item.status, item.plantedChapterId, item.dueChapterId]
      })
    }
  }

  let futureInformationItems = 0
  for (const fact of project.continuity.facts) {
    const sourceOrder = fact.sourceChapterId ? orderByChapterId.get(fact.sourceChapterId) : undefined
    if (sourceOrder === undefined) continue
    for (const usedChapterId of new Set(fact.usedInChapterIds ?? [])) {
      const usedOrder = orderByChapterId.get(usedChapterId)
      if (usedOrder === undefined || usedOrder > targetOrder) continue
      futureInformationItems += 1
      if (usedOrder < sourceOrder) {
        add({
          rule: 'future_information',
          severity: 'error',
          exemptible: true,
          chapterIds: [usedChapterId, fact.sourceChapterId as string],
          entityIds: [fact.id],
          evidence: [
            evidence('fact', fact.id, `${fact.subject} ${fact.predicate}`, fact.sourceChapterId, fact.detail),
            evidence('fact', fact.id, `${fact.subject} ${fact.predicate}`, usedChapterId, fact.detail)
          ],
          suggestion: 'move_information_reveal',
          identity: [fact.id, usedChapterId],
          basis: [fact.sourceChapterId, usedChapterId, fact.subject, fact.predicate, fact.detail]
        })
      }
    }
  }
  stats.future_information = futureInformationItems

  let planAssessmentItems = 0
  const planByChapterId = new Map(project.outline.chapterPlans.map((plan) => [plan.chapterId, plan]))
  const stalePlanChapters = new Set<string>()
  for (const summary of project.continuity.chapterSummaries) {
    if ((orderByChapterId.get(summary.chapterId) ?? Number.MAX_SAFE_INTEGER) > targetOrder) continue
    const plan = planByChapterId.get(summary.chapterId)
    const requirementById = new Map((plan?.requirements ?? []).map((requirement) => [requirement.id, requirement]))
    const assessments = summary.requirementAssessments ?? []
    const currentRevision = chapterById.get(summary.chapterId)?.revision
    if (assessments.length > 0 && (!summary.assessmentRevision || summary.assessmentRevision !== currentRevision)) {
      stalePlanChapters.add(summary.chapterId)
      staleStats.chapter_plan = (staleStats.chapter_plan ?? 0) + assessments.length
      add({
        rule: 'chapter_plan_assessment_stale',
        severity: 'warning',
        exemptible: false,
        chapterIds: [summary.chapterId],
        evidence: [
          evidence('chapter_summary', summary.chapterId, summary.summary || summary.chapterId, summary.chapterId)
        ],
        suggestion: 'refresh_plan_assessment',
        identity: [summary.chapterId, 'assessment_revision'],
        basis: [summary.assessmentRevision, currentRevision]
      })
      continue
    }
    for (const assessment of assessments) {
      planAssessmentItems += 1
      const requirement = requirementById.get(assessment.requirementId)
      if (!requirement) {
        add({
          rule: 'invalid_reference',
          severity: 'error',
          exemptible: false,
          chapterIds: [summary.chapterId],
          entityIds: [assessment.requirementId],
          evidence: [
            evidence('chapter_summary', summary.chapterId, summary.summary || summary.chapterId, summary.chapterId)
          ],
          suggestion: 'repair_reference',
          identity: ['requirement', summary.chapterId, assessment.requirementId],
          basis: [assessment.requirementId]
        })
      } else if (assessment.status === 'deviated') {
        add({
          rule: 'chapter_plan_deviation',
          severity: 'warning',
          exemptible: true,
          chapterIds: [summary.chapterId],
          entityIds: [assessment.requirementId],
          evidence: [
            evidence('chapter_plan', assessment.requirementId, requirement.description, summary.chapterId),
            evidence(
              'chapter_summary',
              summary.chapterId,
              summary.summary || summary.chapterId,
              summary.chapterId,
              assessment.evidence
            )
          ],
          suggestion: 'update_plan_or_mark_intentional',
          identity: [summary.chapterId, assessment.requirementId],
          basis: [requirement.description, assessment.status, assessment.evidence, summary.updatedAt]
        })
      }
    }
  }
  const summaryByChapterId = new Map(project.continuity.chapterSummaries.map((summary) => [summary.chapterId, summary]))
  for (const plan of project.outline.chapterPlans) {
    if ((orderByChapterId.get(plan.chapterId) ?? Number.MAX_SAFE_INTEGER) > targetOrder) continue
    const requirements = plan.requirements ?? []
    if (requirements.length === 0 || stalePlanChapters.has(plan.chapterId)) continue
    const summary = summaryByChapterId.get(plan.chapterId)
    const assessmentIds = new Set((summary?.requirementAssessments ?? []).map((item) => item.requirementId))
    const missing = requirements.filter((requirement) => !assessmentIds.has(requirement.id))
    const currentRevision = chapterById.get(plan.chapterId)?.revision
    const revisionStale = !summary?.assessmentRevision || summary.assessmentRevision !== currentRevision
    if (missing.length === 0 && !revisionStale) continue
    staleStats.chapter_plan = (staleStats.chapter_plan ?? 0) + Math.max(1, missing.length)
    add({
      rule: 'chapter_plan_assessment_stale',
      severity: 'warning',
      exemptible: false,
      chapterIds: [plan.chapterId],
      entityIds: missing.map((requirement) => requirement.id),
      evidence: (missing.length > 0 ? missing : requirements)
        .slice(0, 100)
        .map((requirement) => evidence('chapter_plan', requirement.id, requirement.description, plan.chapterId)),
      suggestion: 'refresh_plan_assessment',
      identity: [plan.chapterId, 'assessment_coverage'],
      basis: [
        currentRevision,
        summary?.assessmentRevision,
        requirements.map((requirement) => requirement.id),
        [...assessmentIds].sort()
      ]
    })
  }
  stats.chapter_plan = planAssessmentItems

  const orderedFindings = [...findingByKey.values()].toSorted(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.rule.localeCompare(right.rule) ||
      left.key.localeCompare(right.key)
  )
  const selectedFindings = orderedFindings
  const truncated = reportTruncated
  const currentManifestFingerprint = manifestFingerprint(project)
  const ruleBases: Record<WriterContinuityAuditRule, unknown> = {
    timeline: [
      timelineEvents.map((event) => [event.id, event.timelineId, event.chapterId, event.sequence, event.storyTime]),
      project.continuity.foreshadowing.map((item) => [
        item.id,
        item.status,
        item.plantedChapterId,
        item.resolvedChapterId,
        item.dueChapterId
      ])
    ],
    character_location: locationStates.map((state) => [
      state.id,
      state.timelineId,
      state.characterId,
      state.chapterId,
      state.sequence,
      state.location
    ]),
    character_life: lifeStates.map((state) => [
      state.id,
      state.timelineId,
      state.characterId,
      state.chapterId,
      state.sequence,
      state.lifeStatus,
      state.transitionExplanation
    ]),
    foreshadowing_due: dueItems.map((item) => [
      item.id,
      item.status,
      item.plantedChapterId,
      item.dueChapterId,
      item.resolvedChapterId
    ]),
    future_information: project.continuity.facts.map((fact) => [
      fact.id,
      fact.sourceChapterId,
      fact.usedInChapterIds ?? []
    ]),
    chapter_plan: project.outline.chapterPlans.map((plan) => [
      plan.chapterId,
      plan.requirements ?? [],
      project.continuity.chapterSummaries.find((summary) => summary.chapterId === plan.chapterId)
    ])
  }
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    targetChapterId: target.id,
    sourceFingerprint: writerContinuitySourceFingerprint(project, target.id),
    sourceDocumentRevisions: project.documentRevisions,
    manifestFingerprint: currentManifestFingerprint,
    findings: selectedFindings,
    ruleStats: ruleStats(stats, staleStats, ruleBases),
    truncated
  }
}

function coverageFor(
  project: WriterProject,
  targetId: string,
  report: WriterContinuityAuditReport | undefined,
  declarations: readonly WriterContinuityCoverageDeclaration[]
): WriterContinuityCoverageView[] {
  const orderByChapterId = new Map(project.manifest.chapters.map((chapter) => [chapter.id, chapter.order]))
  const targetOrder = orderByChapterId.get(targetId) ?? Number.MAX_SAFE_INTEGER
  const declarationByRule = new Map(declarations.map((declaration) => [declaration.rule, declaration]))
  const statByRule = new Map((report?.ruleStats ?? []).map((stat) => [stat.rule, stat]))
  return AUDIT_RULES.map((rule) => {
    const declaration = declarationByRule.get(rule)
    const throughOrder = declaration ? orderByChapterId.get(declaration.throughChapterId) : undefined
    const stat = statByRule.get(rule)
    const status =
      (stat?.staleItems ?? 0) > 0
        ? 'stale'
        : throughOrder === undefined
          ? 'insufficient_data'
          : declaration?.basisFingerprint !== stat?.basisFingerprint
            ? 'stale'
            : throughOrder >= targetOrder
              ? 'checked'
              : 'stale'
    return {
      rule,
      status,
      evaluatedItems: stat?.evaluatedItems ?? 0,
      staleItems: stat?.staleItems ?? 0,
      basisFingerprint: stat?.basisFingerprint,
      ...(declaration ? { throughChapterId: declaration.throughChapterId, note: declaration.note } : { note: '' })
    }
  })
}

export function buildWriterContinuityReviewView(
  input: BuildWriterContinuityReviewViewInput
): WriterContinuityReviewView {
  const target = targetChapter(input.project, input.targetChapterId)
  const revision = input.revision ?? WRITER_MISSING_CONTINUITY_REVIEW_REVISION
  const document = input.document
  const report = document?.report
  const stale = Boolean(
    report &&
      (report.targetChapterId !== target.id ||
        report.sourceFingerprint !== writerContinuitySourceFingerprint(input.project, target.id))
  )
  const waiverByKey = new Map((document?.waivers ?? []).map((waiver) => [waiver.findingKey, waiver]))
  const reportKeys = new Set(report?.findings.map((item) => item.key) ?? [])
  const findings = (report?.findings ?? []).map((item) => {
    const waiver = waiverByKey.get(item.key)
    const state: WriterContinuityFindingView['state'] = !waiver
      ? 'open'
      : waiver.findingFingerprint === item.fingerprint
        ? 'exempted'
        : 'stale_exemption'
    return { ...item, state, ...(waiver ? { waiver } : {}) }
  })
  const orphanedWaivers = (document?.waivers ?? []).filter((waiver) => !reportKeys.has(waiver.findingKey))
  const coverage = coverageFor(input.project, target.id, report, document?.coverageDeclarations ?? [])
  const activeFindings = findings.filter((item) => item.state !== 'exempted')
  const counts = {
    open: activeFindings.length,
    exempted: findings.length - activeFindings.length,
    staleExemption: findings.filter((item) => item.state === 'stale_exemption').length,
    error: activeFindings.filter((item) => item.severity === 'error').length,
    warning: activeFindings.filter((item) => item.severity === 'warning').length,
    info: activeFindings.filter((item) => item.severity === 'info').length
  }
  const status = !report
    ? 'not_run'
    : stale
      ? 'stale'
      : activeFindings.length > 0
        ? 'issues'
        : report.truncated || coverage.some((item) => item.status !== 'checked')
          ? 'incomplete'
          : 'clear'
  return {
    revision,
    status,
    stale,
    targetChapterId: target.id,
    ...(report
      ? {
          generatedAt: report.generatedAt,
          sourceFingerprint: report.sourceFingerprint,
          findings,
          coverage,
          truncated: report.truncated
        }
      : { findings: [], coverage, truncated: false }),
    orphanedWaivers,
    counts
  }
}
