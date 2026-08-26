import { Badge, Button } from '@cherrystudio/ui'
import type { WriterCharacter, WriterStoryBible } from '@shared/types/writer'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { createEntityId, SectionHeading, StringListField, TextAreaField, TextField } from './documentFormFields'

interface WriterStoryBibleFormProps {
  storyBible: WriterStoryBible
  disabled: boolean
  onChange: (storyBible: WriterStoryBible) => void
}

export function WriterStoryBibleForm({ storyBible, disabled, onChange }: WriterStoryBibleFormProps) {
  const { t } = useTranslation()

  const updateCharacter = (index: number, character: WriterCharacter) => {
    const characters = [...storyBible.characters]
    characters[index] = character
    onChange({ ...storyBible, characters })
  }

  const addCharacter = () => {
    const id = createEntityId(
      'character',
      storyBible.characters.map((character) => character.id)
    )
    onChange({
      ...storyBible,
      characters: [
        ...storyBible.characters,
        { id, name: t('writer.story_studio.new_character'), role: '', description: '', goals: [], constraints: [] }
      ]
    })
  }

  return (
    <div data-ui="writer.story-studio.story-bible" className="min-h-0 space-y-5 overflow-y-auto p-4">
      <section className="space-y-4" aria-labelledby="writer-story-overview-heading">
        <SectionHeading
          id="writer-story-overview-heading"
          title={t('writer.story_studio.overview')}
          description={t('writer.story_studio.overview_description')}
        />
        <div className="space-y-4">
          <TextField
            label={t('writer.create.genre')}
            value={storyBible.genre}
            disabled={disabled}
            onChange={(genre) => onChange({ ...storyBible, genre })}
          />
          <TextAreaField
            label={t('writer.create.premise')}
            value={storyBible.premise}
            disabled={disabled}
            minHeight="min-h-20"
            onChange={(premise) => onChange({ ...storyBible, premise })}
          />
          <TextAreaField
            label={t('writer.story_studio.author_goal')}
            value={storyBible.authorGoal}
            disabled={disabled}
            minHeight="min-h-20"
            onChange={(authorGoal) => onChange({ ...storyBible, authorGoal })}
          />
        </div>
      </section>

      <section className="space-y-4 border-border-subtle border-t pt-4" aria-labelledby="writer-story-rules-heading">
        <SectionHeading
          id="writer-story-rules-heading"
          title={t('writer.story_studio.story_rules')}
          description={t('writer.story_studio.story_rules_description')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <StringListField
            label={t('writer.memory.hard_rules')}
            values={storyBible.hardRules}
            disabled={disabled}
            placeholder={t('writer.story_studio.hard_rule_placeholder')}
            onChange={(hardRules) => onChange({ ...storyBible, hardRules })}
          />
          <StringListField
            label={t('writer.story_studio.world_rules')}
            values={storyBible.worldRules}
            disabled={disabled}
            placeholder={t('writer.story_studio.world_rule_placeholder')}
            onChange={(worldRules) => onChange({ ...storyBible, worldRules })}
          />
          <StringListField
            label={t('writer.story_studio.themes')}
            values={storyBible.themes}
            disabled={disabled}
            placeholder={t('writer.story_studio.theme_placeholder')}
            onChange={(themes) => onChange({ ...storyBible, themes })}
          />
          <StringListField
            label={t('writer.story_studio.style_guide')}
            values={storyBible.styleGuide}
            disabled={disabled}
            placeholder={t('writer.story_studio.style_placeholder')}
            onChange={(styleGuide) => onChange({ ...storyBible, styleGuide })}
          />
        </div>
      </section>

      <section
        className="space-y-4 border-border-subtle border-t pt-4"
        aria-labelledby="writer-story-characters-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            id="writer-story-characters-heading"
            title={t('writer.story_studio.characters')}
            description={t('writer.story_studio.characters_description')}
          />
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={addCharacter}>
            <Plus className="size-3.5" aria-hidden />
            {t('writer.story_studio.add_character')}
          </Button>
        </div>

        {storyBible.characters.length ? (
          <div className="space-y-3">
            {storyBible.characters.map((character, index) => (
              <CharacterCard
                key={character.id}
                character={character}
                disabled={disabled}
                onChange={(nextCharacter) => updateCharacter(index, nextCharacter)}
                onDelete={() =>
                  onChange({
                    ...storyBible,
                    characters: storyBible.characters.filter((item) => item.id !== character.id)
                  })
                }
              />
            ))}
          </div>
        ) : (
          <p className="py-2 text-muted-foreground text-xs">{t('writer.story_studio.no_characters')}</p>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 border-border-subtle border-t pt-4">
        <div className="min-w-0">
          <h2 className="font-medium text-sm">{t('writer.memory.lorebook')}</h2>
          <p className="mt-1 text-muted-foreground text-xs">{t('writer.story_studio.lorebook_description')}</p>
        </div>
        <Badge variant="outline">{t('writer.story_studio.entries', { count: storyBible.loreEntries.length })}</Badge>
      </section>
    </div>
  )
}

function CharacterCard({
  character,
  disabled,
  onChange,
  onDelete
}: {
  character: WriterCharacter
  disabled: boolean
  onChange: (character: WriterCharacter) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  return (
    <article className="space-y-3 rounded-md border border-border p-3 [contain-intrinsic-size:auto_360px] [content-visibility:auto]">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <TextField
            label={t('common.name')}
            value={character.name}
            disabled={disabled}
            onChange={(name) => onChange({ ...character, name })}
          />
          <TextField
            label={t('writer.story_studio.role')}
            value={character.role}
            disabled={disabled}
            onChange={(role) => onChange({ ...character, role })}
          />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('writer.story_studio.delete_character', { name: character.name })}
          disabled={disabled}
          onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
      <TextAreaField
        label={t('common.description')}
        value={character.description}
        disabled={disabled}
        minHeight="min-h-20"
        onChange={(description) => onChange({ ...character, description })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <StringListField
          label={t('writer.story_studio.goals')}
          values={character.goals}
          disabled={disabled}
          placeholder={t('writer.story_studio.goal_placeholder')}
          onChange={(goals) => onChange({ ...character, goals })}
        />
        <StringListField
          label={t('writer.story_studio.constraints')}
          values={character.constraints}
          disabled={disabled}
          placeholder={t('writer.story_studio.constraint_placeholder')}
          onChange={(constraints) => onChange({ ...character, constraints })}
        />
      </div>
    </article>
  )
}
