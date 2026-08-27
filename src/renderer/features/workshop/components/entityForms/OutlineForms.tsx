import { Button } from '@cherrystudio/ui'
import type {
  WorkshopArcDataSchema,
  WorkshopChapterPlanDataSchema,
  WorkshopVolumeDataSchema
} from '@shared/types/workshop'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'

import {
  EnumSelectField,
  NumberField,
  OrderedReferenceListField,
  StringListField,
  TextAreaField,
  TextField
} from './fields'
import type { EntityFormProps } from './types'

type OutlineGroupData = z.input<typeof WorkshopVolumeDataSchema> | z.input<typeof WorkshopArcDataSchema>

/** 卷与弧完全同构:标题 + 概要 + 有序章节列表。 */
export function OutlineGroupForm({ data, errors, disabled, refs, onChange }: EntityFormProps<OutlineGroupData>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <TextField
        label={t('workshop.entity_form.outline.title')}
        value={data.title}
        error={errors.title}
        disabled={disabled}
        onChange={(title) => onChange({ ...data, title })}
      />
      <TextAreaField
        label={t('workshop.entity_form.outline.summary')}
        value={data.summary ?? ''}
        error={errors.summary}
        disabled={disabled}
        onChange={(summary) => onChange({ ...data, summary })}
      />
      <OrderedReferenceListField
        label={t('workshop.entity_form.outline.chapters')}
        values={data.chapterIds ?? []}
        options={refs.chapters}
        error={errors.chapterIds}
        disabled={disabled}
        onChange={(chapterIds) => onChange({ ...data, chapterIds })}
      />
    </div>
  )
}

type ChapterPlanData = z.input<typeof WorkshopChapterPlanDataSchema>

function nextRequirementId(existing: { id: string }[]): string {
  const taken = new Set(existing.map((requirement) => requirement.id))
  let index = existing.length + 1
  while (taken.has(`req-${index}`)) index += 1
  return `req-${index}`
}

export function ChapterPlanForm({ data, errors, disabled, onChange }: EntityFormProps<ChapterPlanData>) {
  const { t } = useTranslation()
  const requirements = data.requirements ?? []
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('workshop.entity_form.chapter.title')}
          value={data.title}
          error={errors.title}
          disabled={disabled}
          onChange={(title) => onChange({ ...data, title })}
        />
        <EnumSelectField
          label={t('workshop.entity_form.chapter.status')}
          value={data.status ?? 'planned'}
          options={[
            { value: 'planned', label: t('workshop.entity_form.chapter.status_planned') },
            { value: 'drafted', label: t('workshop.entity_form.chapter.status_drafted') },
            { value: 'revised', label: t('workshop.entity_form.chapter.status_revised') }
          ]}
          error={errors.status}
          disabled={disabled}
          onChange={(status) => onChange({ ...data, status })}
        />
      </div>
      <TextAreaField
        label={t('workshop.entity_form.chapter.goal')}
        value={data.goal ?? ''}
        error={errors.goal}
        disabled={disabled}
        onChange={(goal) => onChange({ ...data, goal })}
      />
      <StringListField
        label={t('workshop.entity_form.chapter.beats')}
        values={data.beats ?? []}
        errorAt={(index) => errors[`beats.${index}`]}
        disabled={disabled}
        onChange={(beats) => onChange({ ...data, beats })}
      />
      <NumberField
        label={t('workshop.entity_form.chapter.word_budget')}
        value={data.wordBudget}
        min={1}
        max={1_000_000}
        integer
        optional
        hint={t('workshop.entity_form.chapter.word_budget_hint')}
        error={errors.wordBudget}
        disabled={disabled}
        onChange={(wordBudget) => onChange({ ...data, wordBudget })}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-xs">{t('workshop.entity_form.chapter.requirements')}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...data,
                requirements: [...requirements, { id: nextRequirementId(requirements), description: '' }]
              })
            }>
            {t('workshop.entity_form.chapter.add_requirement')}
          </Button>
        </div>
        {requirements.map((requirement, index) => (
          <div key={index} className="flex items-start gap-2 rounded-md border border-border bg-card p-3">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[8rem_1fr]">
              <TextField
                label={t('workshop.entity_form.chapter.requirement_id')}
                value={requirement.id}
                hint={t('workshop.entity_form.chapter.requirement_id_hint')}
                error={errors[`requirements.${index}.id`]}
                disabled={disabled}
                onChange={(id) => {
                  const next = [...requirements]
                  next[index] = { ...requirement, id }
                  onChange({ ...data, requirements: next })
                }}
              />
              <TextField
                label={t('workshop.entity_form.chapter.requirement_description')}
                value={requirement.description}
                error={errors[`requirements.${index}.description`]}
                disabled={disabled}
                onChange={(description) => {
                  const next = [...requirements]
                  next[index] = { ...requirement, description }
                  onChange({ ...data, requirements: next })
                }}
              />
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`${t('common.delete')} ${t('workshop.entity_form.chapter.requirements')} ${index + 1}`}
              disabled={disabled}
              onClick={() =>
                onChange({ ...data, requirements: requirements.filter((_, itemIndex) => itemIndex !== index) })
              }>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
