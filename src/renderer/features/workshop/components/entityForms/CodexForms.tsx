import { Button } from '@cherrystudio/ui'
import type {
  WorkshopCharacterDataSchema,
  WorkshopLoreDataSchema,
  WorkshopRuleDataSchema
} from '@shared/types/workshop'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'

import {
  EnumSelectField,
  NumberField,
  ReferenceField,
  StringListField,
  SwitchField,
  TextAreaField,
  TextField
} from './fields'
import type { EntityFormProps } from './types'

type CharacterData = z.input<typeof WorkshopCharacterDataSchema>

export function CharacterForm({ data, errors, disabled, refs, entityId, onChange }: EntityFormProps<CharacterData>) {
  const { t } = useTranslation()
  const relationships = data.relationships ?? []
  const characterOptions = refs.characters.filter((option) => option.value !== entityId)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('workshop.entity_form.characters.name')}
          value={data.name}
          error={errors.name}
          disabled={disabled}
          onChange={(name) => onChange({ ...data, name })}
        />
        <TextField
          label={t('workshop.entity_form.characters.role')}
          value={data.role ?? ''}
          error={errors.role}
          disabled={disabled}
          onChange={(role) => onChange({ ...data, role })}
        />
      </div>
      <StringListField
        label={t('workshop.entity_form.characters.aliases')}
        values={data.aliases ?? []}
        errorAt={(index) => errors[`aliases.${index}`]}
        disabled={disabled}
        onChange={(aliases) => onChange({ ...data, aliases })}
      />
      <TextAreaField
        label={t('workshop.entity_form.characters.description')}
        value={data.description ?? ''}
        error={errors.description}
        disabled={disabled}
        onChange={(description) => onChange({ ...data, description })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <StringListField
          label={t('workshop.entity_form.characters.goals')}
          values={data.goals ?? []}
          errorAt={(index) => errors[`goals.${index}`]}
          disabled={disabled}
          onChange={(goals) => onChange({ ...data, goals })}
        />
        <StringListField
          label={t('workshop.entity_form.characters.constraints')}
          values={data.constraints ?? []}
          errorAt={(index) => errors[`constraints.${index}`]}
          disabled={disabled}
          onChange={(constraints) => onChange({ ...data, constraints })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-xs">{t('workshop.entity_form.characters.relationships')}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({ ...data, relationships: [...relationships, { characterId: '', kind: '', note: '' }] })
            }>
            {t('workshop.entity_form.characters.add_relationship')}
          </Button>
        </div>
        {relationships.map((relationship, index) => (
          <div key={index} className="space-y-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                <ReferenceField
                  label={t('workshop.entity_form.characters.relationship_character')}
                  value={relationship.characterId || undefined}
                  options={characterOptions}
                  error={errors[`relationships.${index}.characterId`]}
                  disabled={disabled}
                  onChange={(characterId) => {
                    const next = [...relationships]
                    next[index] = { ...relationship, characterId: characterId ?? '' }
                    onChange({ ...data, relationships: next })
                  }}
                />
                <TextField
                  label={t('workshop.entity_form.characters.relationship_kind')}
                  value={relationship.kind}
                  error={errors[`relationships.${index}.kind`]}
                  disabled={disabled}
                  onChange={(kind) => {
                    const next = [...relationships]
                    next[index] = { ...relationship, kind }
                    onChange({ ...data, relationships: next })
                  }}
                />
                <TextField
                  label={t('workshop.entity_form.characters.relationship_note')}
                  value={relationship.note ?? ''}
                  error={errors[`relationships.${index}.note`]}
                  disabled={disabled}
                  onChange={(note) => {
                    const next = [...relationships]
                    next[index] = { ...relationship, note }
                    onChange({ ...data, relationships: next })
                  }}
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`${t('common.delete')} ${t('workshop.entity_form.characters.relationships')} ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onChange({ ...data, relationships: relationships.filter((_, itemIndex) => itemIndex !== index) })
                }>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <TextAreaField
        label={t('workshop.entity_form.characters.arc_note')}
        value={data.arcNote ?? ''}
        error={errors.arcNote}
        disabled={disabled}
        onChange={(arcNote) => onChange({ ...data, arcNote })}
      />
    </div>
  )
}

type LoreData = z.input<typeof WorkshopLoreDataSchema>

export function LoreForm({ data, errors, disabled, onChange }: EntityFormProps<LoreData>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <TextField
        label={t('workshop.entity_form.lore.title')}
        value={data.title}
        error={errors.title}
        disabled={disabled}
        onChange={(title) => onChange({ ...data, title })}
      />
      <TextAreaField
        label={t('workshop.entity_form.lore.content')}
        value={data.content}
        minHeight="min-h-40"
        error={errors.content}
        disabled={disabled}
        onChange={(content) => onChange({ ...data, content })}
      />
      <StringListField
        label={t('workshop.entity_form.lore.keys')}
        values={data.keys ?? []}
        hint={t('workshop.entity_form.lore.keys_hint')}
        error={errors.keys}
        errorAt={(index) => errors[`keys.${index}`]}
        max={20}
        disabled={disabled}
        onChange={(keys) => onChange({ ...data, keys })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <SwitchField
          label={t('workshop.entity_form.lore.enabled')}
          checked={data.enabled ?? true}
          disabled={disabled}
          onChange={(enabled) => onChange({ ...data, enabled })}
        />
        <SwitchField
          label={t('workshop.entity_form.lore.always_active')}
          checked={data.alwaysActive ?? false}
          disabled={disabled}
          onChange={(alwaysActive) => onChange({ ...data, alwaysActive })}
        />
        <SwitchField
          label={t('workshop.entity_form.lore.case_sensitive')}
          checked={data.caseSensitive ?? false}
          disabled={disabled}
          onChange={(caseSensitive) => onChange({ ...data, caseSensitive })}
        />
        <SwitchField
          label={t('workshop.entity_form.lore.match_whole_words')}
          checked={data.matchWholeWords ?? false}
          disabled={disabled}
          onChange={(matchWholeWords) => onChange({ ...data, matchWholeWords })}
        />
      </div>
      <NumberField
        label={t('workshop.entity_form.lore.order')}
        value={data.order ?? 100}
        min={0}
        max={10_000}
        integer
        hint={t('workshop.entity_form.lore.order_hint')}
        error={errors.order}
        disabled={disabled}
        onChange={(order) => onChange({ ...data, order: order ?? 100 })}
      />
    </div>
  )
}

type RuleData = z.input<typeof WorkshopRuleDataSchema>

export function RuleForm({ data, errors, disabled, onChange }: EntityFormProps<RuleData>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <EnumSelectField
        label={t('workshop.entity_form.rule.kind')}
        value={data.kind}
        options={[
          { value: 'hard', label: t('workshop.entity_form.rule.kind_hard') },
          { value: 'world', label: t('workshop.entity_form.rule.kind_world') },
          { value: 'style', label: t('workshop.entity_form.rule.kind_style') }
        ]}
        error={errors.kind}
        disabled={disabled}
        onChange={(kind) => onChange({ ...data, kind })}
      />
      <TextAreaField
        label={t('workshop.entity_form.rule.text')}
        value={data.text}
        error={errors.text}
        disabled={disabled}
        onChange={(text) => onChange({ ...data, text })}
      />
      <TextAreaField
        label={t('workshop.entity_form.rule.note')}
        value={data.note ?? ''}
        error={errors.note}
        disabled={disabled}
        onChange={(note) => onChange({ ...data, note })}
      />
    </div>
  )
}
