import { Button } from '@cherrystudio/ui'
import type {
  WorkshopChapterSummaryDataSchema,
  WorkshopCharacterStateDataSchema,
  WorkshopFactDataSchema,
  WorkshopForeshadowingDataSchema,
  WorkshopTimelineEventDataSchema
} from '@shared/types/workshop'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'

import { EnumSelectField, MultiReferenceField, NumberField, ReferenceField, TextAreaField, TextField } from './fields'
import type { EntityFormProps } from './types'

type FactData = z.input<typeof WorkshopFactDataSchema>

export function FactForm({ data, errors, disabled, refs, onChange }: EntityFormProps<FactData>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('workshop.entity_form.fact.subject')}
          value={data.subject}
          error={errors.subject}
          disabled={disabled}
          onChange={(subject) => onChange({ ...data, subject })}
        />
        <TextField
          label={t('workshop.entity_form.fact.predicate')}
          value={data.predicate}
          error={errors.predicate}
          disabled={disabled}
          onChange={(predicate) => onChange({ ...data, predicate })}
        />
      </div>
      <TextAreaField
        label={t('workshop.entity_form.fact.detail')}
        value={data.detail ?? ''}
        error={errors.detail}
        disabled={disabled}
        onChange={(detail) => onChange({ ...data, detail })}
      />
      <ReferenceField
        label={t('workshop.entity_form.fact.source_chapter')}
        value={data.sourceChapterId}
        options={refs.chapters}
        allowNone
        error={errors.sourceChapterId}
        disabled={disabled}
        onChange={(sourceChapterId) => onChange({ ...data, sourceChapterId })}
      />
      <MultiReferenceField
        label={t('workshop.entity_form.fact.used_in_chapters')}
        values={data.usedInChapterIds ?? []}
        options={refs.chapters}
        error={errors.usedInChapterIds}
        disabled={disabled}
        onChange={(usedInChapterIds) => onChange({ ...data, usedInChapterIds })}
      />
    </div>
  )
}

type ForeshadowingData = z.input<typeof WorkshopForeshadowingDataSchema>

export function ForeshadowingForm({ data, errors, disabled, refs, onChange }: EntityFormProps<ForeshadowingData>) {
  const { t } = useTranslation()
  const status = data.status ?? 'open'
  // 状态与回收章不一致只提示不硬拦:裁决权留给机检(foreshadowing_state_mismatch)。
  const statusMismatch = (status === 'resolved') !== Boolean(data.resolvedChapterId)
  return (
    <div className="space-y-4">
      <TextAreaField
        label={t('workshop.entity_form.foreshadowing.description')}
        value={data.description}
        error={errors.description}
        disabled={disabled}
        onChange={(description) => onChange({ ...data, description })}
      />
      <EnumSelectField
        label={t('workshop.entity_form.foreshadowing.status')}
        value={status}
        options={[
          { value: 'open', label: t('workshop.entity_form.foreshadowing.status_open') },
          { value: 'resolved', label: t('workshop.entity_form.foreshadowing.status_resolved') },
          { value: 'abandoned', label: t('workshop.entity_form.foreshadowing.status_abandoned') }
        ]}
        hint={statusMismatch ? t('workshop.entity_form.foreshadowing.status_hint') : undefined}
        error={errors.status}
        disabled={disabled}
        onChange={(next) => onChange({ ...data, status: next })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <ReferenceField
          label={t('workshop.entity_form.foreshadowing.planted')}
          value={data.plantedChapterId}
          options={refs.chapters}
          allowNone
          error={errors.plantedChapterId}
          disabled={disabled}
          onChange={(plantedChapterId) => onChange({ ...data, plantedChapterId })}
        />
        <ReferenceField
          label={t('workshop.entity_form.foreshadowing.due')}
          value={data.dueChapterId}
          options={refs.chapters}
          allowNone
          error={errors.dueChapterId}
          disabled={disabled}
          onChange={(dueChapterId) => onChange({ ...data, dueChapterId })}
        />
        <ReferenceField
          label={t('workshop.entity_form.foreshadowing.resolved')}
          value={data.resolvedChapterId}
          options={refs.chapters}
          allowNone
          error={errors.resolvedChapterId}
          disabled={disabled}
          onChange={(resolvedChapterId) => onChange({ ...data, resolvedChapterId })}
        />
      </div>
    </div>
  )
}

type SummaryData = z.input<typeof WorkshopChapterSummaryDataSchema>

export function SummaryForm({ data, errors, disabled, refs, entityId, onChange }: EntityFormProps<SummaryData>) {
  const { t } = useTranslation()
  const assessments = data.requirementAssessments ?? []
  const requirementOptions = refs.requirementsForChapter(entityId ?? '')
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-5">{t('workshop.entity_form.summary.chapter_note')}</p>
      <TextAreaField
        label={t('workshop.entity_form.summary.summary')}
        value={data.summary}
        minHeight="min-h-40"
        error={errors.summary}
        disabled={disabled}
        onChange={(summary) => onChange({ ...data, summary })}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-xs">{t('workshop.entity_form.summary.assessments')}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...data,
                requirementAssessments: [...assessments, { requirementId: '', status: 'met', evidence: '' }]
              })
            }>
            {t('workshop.entity_form.summary.add_assessment')}
          </Button>
        </div>
        {assessments.map((assessment, index) => (
          <div key={index} className="space-y-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <ReferenceField
                  label={t('workshop.entity_form.summary.assessment_requirement')}
                  value={assessment.requirementId || undefined}
                  options={requirementOptions}
                  error={errors[`requirementAssessments.${index}.requirementId`]}
                  disabled={disabled}
                  onChange={(requirementId) => {
                    const next = [...assessments]
                    next[index] = { ...assessment, requirementId: requirementId ?? '' }
                    onChange({ ...data, requirementAssessments: next })
                  }}
                />
                <EnumSelectField
                  label={t('workshop.entity_form.summary.assessment_status')}
                  value={assessment.status}
                  options={[
                    { value: 'met', label: t('workshop.entity_form.summary.status_met') },
                    { value: 'deviated', label: t('workshop.entity_form.summary.status_deviated') },
                    { value: 'not_applicable', label: t('workshop.entity_form.summary.status_not_applicable') }
                  ]}
                  error={errors[`requirementAssessments.${index}.status`]}
                  disabled={disabled}
                  onChange={(status) => {
                    const next = [...assessments]
                    next[index] = { ...assessment, status }
                    onChange({ ...data, requirementAssessments: next })
                  }}
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`${t('common.delete')} ${t('workshop.entity_form.summary.assessments')} ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...data,
                    requirementAssessments: assessments.filter((_, itemIndex) => itemIndex !== index)
                  })
                }>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
            <TextAreaField
              label={t('workshop.entity_form.summary.assessment_evidence')}
              value={assessment.evidence ?? ''}
              minHeight="min-h-16"
              error={errors[`requirementAssessments.${index}.evidence`]}
              disabled={disabled}
              onChange={(evidence) => {
                const next = [...assessments]
                next[index] = { ...assessment, evidence }
                onChange({ ...data, requirementAssessments: next })
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

type CharacterStateData = z.input<typeof WorkshopCharacterStateDataSchema>

export function CharacterStateForm({ data, errors, disabled, refs, onChange }: EntityFormProps<CharacterStateData>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ReferenceField
          label={t('workshop.entity_form.state.character')}
          value={data.characterId || undefined}
          options={refs.characters}
          error={errors.characterId}
          disabled={disabled}
          onChange={(characterId) => onChange({ ...data, characterId: characterId ?? '' })}
        />
        <ReferenceField
          label={t('workshop.entity_form.state.chapter')}
          value={data.chapterId || undefined}
          options={refs.chapters}
          error={errors.chapterId}
          disabled={disabled}
          onChange={(chapterId) => onChange({ ...data, chapterId: chapterId ?? '' })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label={t('workshop.entity_form.state.timeline')}
          value={data.timelineId ?? 'main'}
          hint={t('workshop.entity_form.state.timeline_hint')}
          error={errors.timelineId}
          disabled={disabled}
          onChange={(timelineId) => onChange({ ...data, timelineId })}
        />
        <NumberField
          label={t('workshop.entity_form.state.sequence')}
          value={data.sequence ?? 0}
          min={0}
          integer
          error={errors.sequence}
          disabled={disabled}
          onChange={(sequence) => onChange({ ...data, sequence: sequence ?? 0 })}
        />
        <EnumSelectField
          label={t('workshop.entity_form.state.life_status')}
          value={data.lifeStatus ?? 'unknown'}
          options={[
            { value: 'unknown', label: t('workshop.entity_form.state.life_unknown') },
            { value: 'alive', label: t('workshop.entity_form.state.life_alive') },
            { value: 'dead', label: t('workshop.entity_form.state.life_dead') }
          ]}
          error={errors.lifeStatus}
          disabled={disabled}
          onChange={(lifeStatus) => onChange({ ...data, lifeStatus })}
        />
      </div>
      <TextField
        label={t('workshop.entity_form.state.location')}
        value={data.location ?? ''}
        error={errors.location}
        disabled={disabled}
        onChange={(location) => onChange({ ...data, location })}
      />
      <TextAreaField
        label={t('workshop.entity_form.state.transition_explanation')}
        value={data.transitionExplanation ?? ''}
        hint={t('workshop.entity_form.state.transition_hint')}
        error={errors.transitionExplanation}
        disabled={disabled}
        onChange={(transitionExplanation) => onChange({ ...data, transitionExplanation })}
      />
      <TextAreaField
        label={t('workshop.entity_form.state.evidence')}
        value={data.evidence ?? ''}
        error={errors.evidence}
        disabled={disabled}
        onChange={(evidence) => onChange({ ...data, evidence })}
      />
    </div>
  )
}

type TimelineEventData = z.input<typeof WorkshopTimelineEventDataSchema>

export function TimelineEventForm({ data, errors, disabled, refs, onChange }: EntityFormProps<TimelineEventData>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <TextField
        label={t('workshop.entity_form.event.label')}
        value={data.label}
        error={errors.label}
        disabled={disabled}
        onChange={(label) => onChange({ ...data, label })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ReferenceField
          label={t('workshop.entity_form.event.chapter')}
          value={data.chapterId || undefined}
          options={refs.chapters}
          error={errors.chapterId}
          disabled={disabled}
          onChange={(chapterId) => onChange({ ...data, chapterId: chapterId ?? '' })}
        />
        <TextField
          label={t('workshop.entity_form.event.timeline')}
          value={data.timelineId ?? 'main'}
          error={errors.timelineId}
          disabled={disabled}
          onChange={(timelineId) => onChange({ ...data, timelineId })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t('workshop.entity_form.event.sequence')}
          value={data.sequence ?? 0}
          min={0}
          integer
          error={errors.sequence}
          disabled={disabled}
          onChange={(sequence) => onChange({ ...data, sequence: sequence ?? 0 })}
        />
        <NumberField
          label={t('workshop.entity_form.event.story_time')}
          value={data.storyTime}
          step="any"
          hint={t('workshop.entity_form.event.story_time_hint')}
          error={errors.storyTime}
          disabled={disabled}
          onChange={(storyTime) => onChange({ ...data, storyTime: storyTime ?? 0 })}
        />
      </div>
      <TextAreaField
        label={t('workshop.entity_form.event.evidence')}
        value={data.evidence ?? ''}
        error={errors.evidence}
        disabled={disabled}
        onChange={(evidence) => onChange({ ...data, evidence })}
      />
    </div>
  )
}
