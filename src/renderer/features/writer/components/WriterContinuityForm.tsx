import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger
} from '@cherrystudio/ui'
import type {
  WriterChapterMetadata,
  WriterChapterPlan,
  WriterChapterSummary,
  WriterCharacter,
  WriterCharacterState,
  WriterContinuityFact,
  WriterContinuityLedger,
  WriterForeshadowing,
  WriterTimelineEvent
} from '@shared/types/writer'
import { Plus, Trash2, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ChapterSelectField,
  createEntityId,
  EnumSelectField,
  NumberField,
  patchOptionalArray,
  TextAreaField,
  TextField
} from './documentFormFields'

const FORESHADOWING_STATUS_LABEL_KEYS = {
  open: 'writer.continuity_studio.foreshadowing_status.open',
  resolved: 'writer.continuity_studio.foreshadowing_status.resolved',
  abandoned: 'writer.continuity_studio.foreshadowing_status.abandoned'
} as const satisfies Record<WriterForeshadowing['status'], string>

const ASSESSMENT_STATUS_LABEL_KEYS = {
  met: 'writer.continuity_studio.assessment_status.met',
  deviated: 'writer.continuity_studio.assessment_status.deviated',
  not_applicable: 'writer.continuity_studio.assessment_status.not_applicable'
} as const satisfies Record<NonNullable<WriterChapterSummary['requirementAssessments']>[number]['status'], string>

const LIFE_STATUS_LABEL_KEYS = {
  unknown: 'writer.continuity_studio.life_status.unknown',
  alive: 'writer.continuity_studio.life_status.alive',
  dead: 'writer.continuity_studio.life_status.dead'
} as const satisfies Record<WriterCharacterState['lifeStatus'], string>

const CONTINUITY_TABS = ['facts', 'foreshadowing', 'chapterSummaries', 'timelineEvents', 'characterStates'] as const
type ContinuityTab = (typeof CONTINUITY_TABS)[number]

const CONTINUITY_TAB_LABEL_KEYS: Record<ContinuityTab, string> = {
  facts: 'writer.continuity_studio.tabs.facts',
  foreshadowing: 'writer.continuity_studio.tabs.foreshadowing',
  chapterSummaries: 'writer.continuity_studio.tabs.chapter_summaries',
  timelineEvents: 'writer.continuity_studio.tabs.timeline_events',
  characterStates: 'writer.continuity_studio.tabs.character_states'
}

const CONTINUITY_TAB_HINT_KEYS: Record<ContinuityTab, string> = {
  facts: 'writer.continuity_studio.tabs.facts_hint',
  foreshadowing: 'writer.continuity_studio.tabs.foreshadowing_hint',
  chapterSummaries: 'writer.continuity_studio.tabs.chapter_summaries_hint',
  timelineEvents: 'writer.continuity_studio.tabs.timeline_events_hint',
  characterStates: 'writer.continuity_studio.tabs.character_states_hint'
}

interface WriterContinuityFormProps {
  continuity: WriterContinuityLedger
  chapters: WriterChapterMetadata[]
  characters: WriterCharacter[]
  chapterPlans: WriterChapterPlan[]
  disabled: boolean
  onChange: (continuity: WriterContinuityLedger) => void
}

export function WriterContinuityForm({
  continuity,
  chapters,
  characters,
  chapterPlans,
  disabled,
  onChange
}: WriterContinuityFormProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ContinuityTab>('facts')
  const [selection, setSelection] = useState<Partial<Record<ContinuityTab, string>>>({})

  const facts = continuity.facts
  const foreshadowing = continuity.foreshadowing
  const chapterSummaries = continuity.chapterSummaries
  const timelineEvents = useMemo(() => continuity.timelineEvents ?? [], [continuity.timelineEvents])
  const characterStates = continuity.characterStates ?? []

  const tabCounts: Record<ContinuityTab, number> = {
    facts: facts.length,
    foreshadowing: foreshadowing.length,
    chapterSummaries: chapterSummaries.length,
    timelineEvents: timelineEvents.length,
    characterStates: characterStates.length
  }

  const select = (tab: ContinuityTab, key: string | undefined) =>
    setSelection((current) => ({ ...current, [tab]: key }))

  const timelineSlotConflicts = useMemo(() => {
    const slots = new Map<string, number>()
    for (const event of timelineEvents) {
      const slot = `${event.timelineId}:${event.chapterId}:${event.sequence}`
      slots.set(slot, (slots.get(slot) ?? 0) + 1)
    }
    return new Set(
      timelineEvents
        .filter((event) => (slots.get(`${event.timelineId}:${event.chapterId}:${event.sequence}`) ?? 0) > 1)
        .map((event) => event.id)
    )
  }, [timelineEvents])

  const chapterTitle = (chapterId: string) => chapters.find((chapter) => chapter.id === chapterId)?.title ?? chapterId
  const characterName = (characterId: string) =>
    characters.find((character) => character.id === characterId)?.name ?? characterId

  const addFact = () => {
    const id = createEntityId(
      'fact',
      facts.map((fact) => fact.id)
    )
    onChange({ ...continuity, facts: [...facts, { id, subject: '', predicate: '', detail: '' }] })
    select('facts', id)
  }

  const addForeshadowing = () => {
    const id = createEntityId(
      'foreshadowing',
      foreshadowing.map((item) => item.id)
    )
    onChange({ ...continuity, foreshadowing: [...foreshadowing, { id, description: '', status: 'open' }] })
    select('foreshadowing', id)
  }

  const summarizedChapterIds = new Set(chapterSummaries.map((summary) => summary.chapterId))
  const unsummarizedChapters = chapters.filter((chapter) => !summarizedChapterIds.has(chapter.id))

  const addChapterSummary = () => {
    const chapter = unsummarizedChapters[0]
    if (!chapter) return
    onChange({
      ...continuity,
      chapterSummaries: [
        ...chapterSummaries,
        { chapterId: chapter.id, summary: '', updatedAt: new Date().toISOString() }
      ]
    })
    select('chapterSummaries', chapter.id)
  }

  const addTimelineEvent = () => {
    const chapter = chapters[0]
    if (!chapter) return
    const id = createEntityId(
      'event',
      timelineEvents.map((event) => event.id)
    )
    onChange({
      ...continuity,
      timelineEvents: [
        ...timelineEvents,
        {
          id,
          timelineId: 'main',
          chapterId: chapter.id,
          sequence: 0,
          storyTime: 0,
          label: t('writer.continuity_studio.new_event'),
          evidence: ''
        }
      ]
    })
    select('timelineEvents', id)
  }

  const addCharacterState = () => {
    const chapter = chapters[0]
    const character = characters[0]
    if (!chapter || !character) return
    const id = createEntityId(
      'state',
      characterStates.map((state) => state.id)
    )
    onChange({
      ...continuity,
      characterStates: [
        ...characterStates,
        {
          id,
          timelineId: 'main',
          characterId: character.id,
          chapterId: chapter.id,
          sequence: 0,
          location: '',
          lifeStatus: 'unknown',
          transitionExplanation: '',
          evidence: ''
        }
      ]
    })
    select('characterStates', id)
  }

  const addForActiveTab: Record<ContinuityTab, { onAdd: () => void; disabled: boolean }> = {
    facts: { onAdd: addFact, disabled },
    foreshadowing: { onAdd: addForeshadowing, disabled },
    chapterSummaries: { onAdd: addChapterSummary, disabled: disabled || unsummarizedChapters.length === 0 },
    timelineEvents: { onAdd: addTimelineEvent, disabled: disabled || chapters.length === 0 },
    characterStates: {
      onAdd: addCharacterState,
      disabled: disabled || chapters.length === 0 || characters.length === 0
    }
  }

  const listItems: Record<ContinuityTab, ListItem[]> = {
    facts: facts.map((fact) => ({
      key: fact.id,
      title: `${fact.subject} ${fact.predicate}`.trim() || t('writer.continuity_studio.untitled'),
      subtitle: fact.sourceChapterId ? chapterTitle(fact.sourceChapterId) : undefined
    })),
    foreshadowing: foreshadowing.map((item) => ({
      key: item.id,
      title: item.description || t('writer.continuity_studio.untitled'),
      badge: t(FORESHADOWING_STATUS_LABEL_KEYS[item.status]),
      badgeVariant: foreshadowingMismatch(item) ? 'destructive' : 'outline'
    })),
    chapterSummaries: chapterSummaries.map((summary) => ({
      key: summary.chapterId,
      title: chapterTitle(summary.chapterId)
    })),
    timelineEvents: timelineEvents.map((event) => ({
      key: event.id,
      title: event.label,
      subtitle: chapterTitle(event.chapterId),
      badge: timelineSlotConflicts.has(event.id) ? t('writer.continuity_studio.slot_conflict_badge') : undefined,
      badgeVariant: 'destructive'
    })),
    characterStates: characterStates.map((state) => ({
      key: state.id,
      title: characterName(state.characterId),
      subtitle: chapterTitle(state.chapterId),
      badge: t(LIFE_STATUS_LABEL_KEYS[state.lifeStatus]),
      badgeVariant: 'outline'
    }))
  }

  const activeItems = listItems[activeTab]
  const selectedKey = selection[activeTab] ?? activeItems[0]?.key

  return (
    <div data-ui="writer.continuity-studio.form" className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-border border-b px-3 pt-2">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ContinuityTab)}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 pb-2">
            {CONTINUITY_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="gap-1.5">
                {t(CONTINUITY_TAB_LABEL_KEYS[tab])}
                <Badge variant="outline">{tabCounts[tab]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <p className="shrink-0 border-border border-b px-4 py-2 text-muted-foreground text-xs leading-5">
        {t(CONTINUITY_TAB_HINT_KEYS[activeTab])}
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)]">
        <ListPane
          items={activeItems}
          selectedKey={selectedKey}
          listLabel={t(CONTINUITY_TAB_LABEL_KEYS[activeTab])}
          addLabel={t('writer.continuity_studio.add_entry')}
          emptyLabel={t('writer.continuity_studio.empty')}
          addDisabled={addForActiveTab[activeTab].disabled}
          onAdd={addForActiveTab[activeTab].onAdd}
          onSelect={(key) => select(activeTab, key)}
        />

        <section className="min-h-0 overflow-y-auto p-4">
          {activeTab === 'facts' && selectedKey !== undefined ? (
            <FactDetail
              fact={facts.find((fact) => fact.id === selectedKey)}
              chapters={chapters}
              disabled={disabled}
              onChange={(next) =>
                onChange({ ...continuity, facts: facts.map((fact) => (fact.id === next.id ? next : fact)) })
              }
              onDelete={(id) => {
                onChange({ ...continuity, facts: facts.filter((fact) => fact.id !== id) })
                select('facts', undefined)
              }}
            />
          ) : null}
          {activeTab === 'foreshadowing' && selectedKey !== undefined ? (
            <ForeshadowingDetail
              item={foreshadowing.find((item) => item.id === selectedKey)}
              chapters={chapters}
              disabled={disabled}
              onChange={(next) =>
                onChange({
                  ...continuity,
                  foreshadowing: foreshadowing.map((item) => (item.id === next.id ? next : item))
                })
              }
              onDelete={(id) => {
                onChange({ ...continuity, foreshadowing: foreshadowing.filter((item) => item.id !== id) })
                select('foreshadowing', undefined)
              }}
            />
          ) : null}
          {activeTab === 'chapterSummaries' && selectedKey !== undefined ? (
            <ChapterSummaryDetail
              summary={chapterSummaries.find((summary) => summary.chapterId === selectedKey)}
              chapters={chapters}
              unsummarizedChapters={unsummarizedChapters}
              chapterPlans={chapterPlans}
              disabled={disabled}
              onChange={(previousChapterId, next) => {
                onChange({
                  ...continuity,
                  chapterSummaries: chapterSummaries.map((summary) =>
                    summary.chapterId === previousChapterId ? next : summary
                  )
                })
                select('chapterSummaries', next.chapterId)
              }}
              onDelete={(chapterId) => {
                onChange({
                  ...continuity,
                  chapterSummaries: chapterSummaries.filter((summary) => summary.chapterId !== chapterId)
                })
                select('chapterSummaries', undefined)
              }}
            />
          ) : null}
          {activeTab === 'timelineEvents' && selectedKey !== undefined ? (
            <TimelineEventDetail
              event={timelineEvents.find((event) => event.id === selectedKey)}
              chapters={chapters}
              hasSlotConflict={timelineSlotConflicts.has(selectedKey)}
              disabled={disabled}
              onChange={(next) =>
                onChange({
                  ...continuity,
                  timelineEvents: timelineEvents.map((event) => (event.id === next.id ? next : event))
                })
              }
              onDelete={(id) => {
                onChange({
                  ...continuity,
                  timelineEvents: patchOptionalArray(timelineEvents.filter((event) => event.id !== id))
                })
                select('timelineEvents', undefined)
              }}
            />
          ) : null}
          {activeTab === 'characterStates' && selectedKey !== undefined ? (
            <CharacterStateDetail
              state={characterStates.find((state) => state.id === selectedKey)}
              chapters={chapters}
              characters={characters}
              disabled={disabled}
              onChange={(next) =>
                onChange({
                  ...continuity,
                  characterStates: characterStates.map((state) => (state.id === next.id ? next : state))
                })
              }
              onDelete={(id) => {
                onChange({
                  ...continuity,
                  characterStates: patchOptionalArray(characterStates.filter((state) => state.id !== id))
                })
                select('characterStates', undefined)
              }}
            />
          ) : null}
          {selectedKey === undefined ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              {t('writer.continuity_studio.select_entry')}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function foreshadowingMismatch(item: WriterForeshadowing): boolean {
  return item.status === 'resolved' ? item.resolvedChapterId === undefined : item.resolvedChapterId !== undefined
}

interface ListItem {
  key: string
  title: string
  subtitle?: string
  badge?: string
  badgeVariant?: 'outline' | 'destructive'
}

function ListPane({
  items,
  selectedKey,
  listLabel,
  addLabel,
  emptyLabel,
  addDisabled,
  onAdd,
  onSelect
}: {
  items: ListItem[]
  selectedKey: string | undefined
  listLabel: string
  addLabel: string
  emptyLabel: string
  addDisabled: boolean
  onAdd: () => void
  onSelect: (key: string) => void
}) {
  return (
    <aside className="flex min-h-0 flex-col border-border border-r bg-background-subtle">
      <div className="flex items-center justify-between gap-2 border-border border-b p-2">
        <span className="truncate font-medium text-xs">{listLabel}</span>
        <Button
          data-ui="writer.continuity-studio.add"
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={addLabel}
          disabled={addDisabled}
          onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length ? (
          <ul className="space-y-1" aria-label={listLabel}>
            {items.map((item) => (
              <li key={item.key} className="[contain-intrinsic-size:auto_52px] [content-visibility:auto]">
                <button
                  type="button"
                  aria-pressed={item.key === selectedKey}
                  onClick={() => onSelect(item.key)}
                  className="w-full rounded-md border border-transparent px-2 py-2 text-left hover:bg-accent aria-pressed:border-border aria-pressed:bg-accent">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-xs">{item.title}</span>
                    {item.badge ? <Badge variant={item.badgeVariant ?? 'outline'}>{item.badge}</Badge> : null}
                  </span>
                  {item.subtitle ? (
                    <span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.subtitle}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-muted-foreground text-xs">{emptyLabel}</p>
            <Button type="button" size="sm" disabled={addDisabled} onClick={onAdd}>
              <Plus className="size-3.5" aria-hidden />
              {addLabel}
            </Button>
          </div>
        )}
      </div>
    </aside>
  )
}

function DetailWarning({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
      {children}
    </p>
  )
}

function DeleteEntryButton({ label, disabled, onDelete }: { label: string; disabled: boolean; onDelete: () => void }) {
  const { t } = useTranslation()
  return (
    <Button type="button" size="sm" variant="destructive" aria-label={label} disabled={disabled} onClick={onDelete}>
      <Trash2 className="size-3.5" aria-hidden />
      {t('writer.continuity_studio.remove_entry')}
    </Button>
  )
}

function FactDetail({
  fact,
  chapters,
  disabled,
  onChange,
  onDelete
}: {
  fact: WriterContinuityFact | undefined
  chapters: WriterChapterMetadata[]
  disabled: boolean
  onChange: (fact: WriterContinuityFact) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const usedInLabelId = useId()
  const usedInHintId = useId()
  if (!fact) return null
  const usedIn = fact.usedInChapterIds ?? []
  const availableChapters = chapters.filter((chapter) => !usedIn.includes(chapter.id))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('writer.continuity_studio.fact_subject')}
          value={fact.subject}
          disabled={disabled}
          hint={t('writer.continuity_studio.fact_subject_hint')}
          onChange={(subject) => onChange({ ...fact, subject })}
        />
        <TextField
          label={t('writer.continuity_studio.fact_predicate')}
          value={fact.predicate}
          disabled={disabled}
          hint={t('writer.continuity_studio.fact_predicate_hint')}
          onChange={(predicate) => onChange({ ...fact, predicate })}
        />
      </div>
      <TextAreaField
        label={t('writer.continuity_studio.fact_detail')}
        value={fact.detail}
        disabled={disabled}
        minHeight="min-h-24"
        hint={t('writer.continuity_studio.fact_detail_hint')}
        onChange={(detail) => onChange({ ...fact, detail })}
      />
      <ChapterSelectField
        label={t('writer.continuity_studio.fact_source_chapter')}
        value={fact.sourceChapterId}
        chapters={chapters}
        disabled={disabled}
        hint={t('writer.continuity_studio.fact_source_chapter_hint')}
        allowNone
        noneLabel={t('writer.continuity_studio.none_option')}
        onChange={(sourceChapterId) => onChange({ ...fact, sourceChapterId })}
      />
      <div className="space-y-1.5">
        <span id={usedInLabelId} className="block font-medium text-xs">
          {t('writer.continuity_studio.fact_used_in')}
        </span>
        <div className="flex flex-wrap items-center gap-1.5" aria-labelledby={usedInLabelId}>
          {usedIn.map((chapterId) => {
            const chapter = chapters.find((item) => item.id === chapterId)
            return (
              <Badge key={chapterId} variant={chapter ? 'outline' : 'destructive'} className="gap-1">
                {chapter?.title ?? chapterId}
                <button
                  type="button"
                  aria-label={t('writer.continuity_studio.remove_used_in', { title: chapter?.title ?? chapterId })}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...fact,
                      usedInChapterIds: patchOptionalArray(usedIn.filter((id) => id !== chapterId))
                    })
                  }>
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            )
          })}
          {availableChapters.length ? (
            <Select
              value=""
              disabled={disabled}
              onValueChange={(chapterId) => onChange({ ...fact, usedInChapterIds: [...usedIn, chapterId] })}>
              <SelectTrigger size="sm" aria-labelledby={usedInLabelId} aria-describedby={usedInHintId}>
                <SelectValue placeholder={t('writer.continuity_studio.add_used_in')} />
              </SelectTrigger>
              <SelectContent>
                {availableChapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <span id={usedInHintId} className="block text-muted-foreground text-xs">
          {t('writer.continuity_studio.fact_used_in_hint')}
        </span>
      </div>
      <DeleteEntryButton
        label={t('writer.continuity_studio.remove_entry')}
        disabled={disabled}
        onDelete={() => onDelete(fact.id)}
      />
    </div>
  )
}

function ForeshadowingDetail({
  item,
  chapters,
  disabled,
  onChange,
  onDelete
}: {
  item: WriterForeshadowing | undefined
  chapters: WriterChapterMetadata[]
  disabled: boolean
  onChange: (item: WriterForeshadowing) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!item) return null

  return (
    <div className="space-y-4">
      <TextAreaField
        label={t('writer.continuity_studio.foreshadowing_description')}
        value={item.description}
        disabled={disabled}
        minHeight="min-h-24"
        hint={t('writer.continuity_studio.foreshadowing_description_hint')}
        onChange={(description) => onChange({ ...item, description })}
      />
      <EnumSelectField
        label={t('writer.continuity_studio.foreshadowing_status')}
        value={item.status}
        options={(Object.keys(FORESHADOWING_STATUS_LABEL_KEYS) as WriterForeshadowing['status'][]).map((status) => ({
          value: status,
          label: t(FORESHADOWING_STATUS_LABEL_KEYS[status])
        }))}
        disabled={disabled}
        hint={t('writer.continuity_studio.foreshadowing_status_hint')}
        onChange={(status) => onChange({ ...item, status })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <ChapterSelectField
          label={t('writer.continuity_studio.planted_chapter')}
          value={item.plantedChapterId}
          chapters={chapters}
          disabled={disabled}
          hint={t('writer.continuity_studio.planted_chapter_hint')}
          allowNone
          noneLabel={t('writer.continuity_studio.none_option')}
          onChange={(plantedChapterId) => onChange({ ...item, plantedChapterId })}
        />
        <ChapterSelectField
          label={t('writer.continuity_studio.resolved_chapter')}
          value={item.resolvedChapterId}
          chapters={chapters}
          disabled={disabled}
          hint={t('writer.continuity_studio.resolved_chapter_hint')}
          allowNone
          noneLabel={t('writer.continuity_studio.none_option')}
          onChange={(resolvedChapterId) => onChange({ ...item, resolvedChapterId })}
        />
        <ChapterSelectField
          label={t('writer.continuity_studio.due_chapter')}
          value={item.dueChapterId}
          chapters={chapters}
          disabled={disabled}
          hint={t('writer.continuity_studio.due_chapter_hint')}
          allowNone
          noneLabel={t('writer.continuity_studio.none_option')}
          onChange={(dueChapterId) => onChange({ ...item, dueChapterId })}
        />
      </div>
      {foreshadowingMismatch(item) ? (
        <DetailWarning>{t('writer.continuity_studio.foreshadowing_resolved_mismatch')}</DetailWarning>
      ) : null}
      <DeleteEntryButton
        label={t('writer.continuity_studio.remove_entry')}
        disabled={disabled}
        onDelete={() => onDelete(item.id)}
      />
    </div>
  )
}

function ChapterSummaryDetail({
  summary,
  chapters,
  unsummarizedChapters,
  chapterPlans,
  disabled,
  onChange,
  onDelete
}: {
  summary: WriterChapterSummary | undefined
  chapters: WriterChapterMetadata[]
  unsummarizedChapters: WriterChapterMetadata[]
  chapterPlans: WriterChapterPlan[]
  disabled: boolean
  onChange: (previousChapterId: string, summary: WriterChapterSummary) => void
  onDelete: (chapterId: string) => void
}) {
  const { t } = useTranslation()
  const assessmentsLabelId = useId()
  const assessmentsHintId = useId()
  if (!summary) return null

  const chapter = chapters.find((item) => item.id === summary.chapterId)
  const assessmentUpToDate = chapter !== undefined && summary.assessmentRevision === chapter.revision
  const assessments = summary.requirementAssessments ?? []
  const planRequirements = chapterPlans.find((plan) => plan.chapterId === summary.chapterId)?.requirements ?? []
  const unassessedRequirements = planRequirements.filter(
    (requirement) => !assessments.some((assessment) => assessment.requirementId === requirement.id)
  )
  const requirementDescription = (requirementId: string) =>
    planRequirements.find((requirement) => requirement.id === requirementId)?.description ?? requirementId

  const patch = (partial: Partial<WriterChapterSummary>) =>
    onChange(summary.chapterId, { ...summary, ...partial, updatedAt: new Date().toISOString() })

  return (
    <div className="space-y-4">
      <ChapterSelectField
        label={t('writer.continuity_studio.summary_chapter')}
        value={summary.chapterId}
        chapters={[...chapters.filter((item) => item.id === summary.chapterId), ...unsummarizedChapters]}
        disabled={disabled}
        hint={t('writer.continuity_studio.summary_chapter_hint')}
        onChange={(chapterId) => {
          if (chapterId) patch({ chapterId })
        }}
      />
      <TextAreaField
        label={t('writer.continuity_studio.summary_text')}
        value={summary.summary}
        disabled={disabled}
        minHeight="min-h-32"
        hint={t('writer.continuity_studio.summary_text_hint')}
        onChange={(text) => patch({ summary: text })}
      />

      <div className="space-y-1.5 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-xs">{t('writer.continuity_studio.assessment_revision')}</span>
          <Badge variant={assessmentUpToDate ? 'outline' : 'destructive'}>
            {assessmentUpToDate
              ? t('writer.continuity_studio.assessment_revision_current')
              : t('writer.continuity_studio.assessment_revision_stale')}
          </Badge>
        </div>
        {summary.assessmentRevision ? (
          <p className="font-mono text-[10px] text-muted-foreground">{summary.assessmentRevision.slice(0, 12)}</p>
        ) : null}
        <span className="block text-muted-foreground text-xs">
          {t('writer.continuity_studio.assessment_revision_hint')}
        </span>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            data-ui="writer.continuity-studio.mark-assessed"
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || chapter === undefined || assessmentUpToDate}
            onClick={() => {
              if (chapter) patch({ assessmentRevision: chapter.revision })
            }}>
            {t('writer.continuity_studio.mark_assessed')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || summary.assessmentRevision === undefined}
            onClick={() => patch({ assessmentRevision: undefined })}>
            {t('writer.continuity_studio.clear_assessed')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span id={assessmentsLabelId} className="font-medium text-xs">
            {t('writer.continuity_studio.assessments')}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('writer.continuity_studio.add_assessment')}
            disabled={disabled || unassessedRequirements.length === 0}
            onClick={() => {
              const requirement = unassessedRequirements[0]
              if (!requirement) return
              patch({
                requirementAssessments: [...assessments, { requirementId: requirement.id, status: 'met', evidence: '' }]
              })
            }}>
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>
        <span id={assessmentsHintId} className="block text-muted-foreground text-xs">
          {t('writer.continuity_studio.assessments_hint')}
        </span>
        {assessments.length ? (
          <div className="space-y-3" aria-labelledby={assessmentsLabelId} aria-describedby={assessmentsHintId}>
            {assessments.map((assessment, index) => (
              <div key={assessment.requirementId} className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-xs">{requirementDescription(assessment.requirementId)}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{assessment.requirementId}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('common.delete')} ${t('writer.continuity_studio.assessments')} ${index + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      patch({
                        requirementAssessments: patchOptionalArray(
                          assessments.filter((item) => item.requirementId !== assessment.requirementId)
                        )
                      })
                    }>
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
                <EnumSelectField
                  label={t('writer.continuity_studio.assessment_status')}
                  value={assessment.status}
                  options={(Object.keys(ASSESSMENT_STATUS_LABEL_KEYS) as (typeof assessment.status)[]).map(
                    (status) => ({ value: status, label: t(ASSESSMENT_STATUS_LABEL_KEYS[status]) })
                  )}
                  disabled={disabled}
                  hint={t('writer.continuity_studio.assessment_status_hint')}
                  onChange={(status) =>
                    patch({
                      requirementAssessments: assessments.map((item) =>
                        item.requirementId === assessment.requirementId ? { ...item, status } : item
                      )
                    })
                  }
                />
                <TextAreaField
                  label={t('writer.continuity_studio.assessment_evidence')}
                  value={assessment.evidence}
                  disabled={disabled}
                  minHeight="min-h-16"
                  hint={t('writer.continuity_studio.assessment_evidence_hint')}
                  onChange={(evidence) =>
                    patch({
                      requirementAssessments: assessments.map((item) =>
                        item.requirementId === assessment.requirementId ? { ...item, evidence } : item
                      )
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-1 py-1.5 text-muted-foreground text-xs">{t('writer.story_studio.empty_list')}</p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {t('writer.continuity_studio.updated_at', { time: summary.updatedAt })}
      </p>
      <DeleteEntryButton
        label={t('writer.continuity_studio.remove_entry')}
        disabled={disabled}
        onDelete={() => onDelete(summary.chapterId)}
      />
    </div>
  )
}

function TimelineEventDetail({
  event,
  chapters,
  hasSlotConflict,
  disabled,
  onChange,
  onDelete
}: {
  event: WriterTimelineEvent | undefined
  chapters: WriterChapterMetadata[]
  hasSlotConflict: boolean
  disabled: boolean
  onChange: (event: WriterTimelineEvent) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!event) return null

  return (
    <div className="space-y-4">
      <TextField
        label={t('writer.continuity_studio.event_label')}
        value={event.label}
        disabled={disabled}
        hint={t('writer.continuity_studio.event_label_hint')}
        onChange={(label) => onChange({ ...event, label })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ChapterSelectField
          label={t('writer.continuity_studio.event_chapter')}
          value={event.chapterId}
          chapters={chapters}
          disabled={disabled}
          hint={t('writer.continuity_studio.event_chapter_hint')}
          onChange={(chapterId) => {
            if (chapterId) onChange({ ...event, chapterId })
          }}
        />
        <TextField
          label={t('writer.continuity_studio.timeline_id')}
          value={event.timelineId}
          disabled={disabled}
          hint={t('writer.continuity_studio.timeline_id_hint')}
          onChange={(timelineId) => onChange({ ...event, timelineId })}
        />
        <NumberField
          label={t('writer.continuity_studio.sequence')}
          value={event.sequence}
          min={0}
          max={1_000_000}
          integer
          disabled={disabled}
          hint={t('writer.continuity_studio.sequence_hint')}
          onChange={(sequence) => onChange({ ...event, sequence })}
        />
        <NumberField
          label={t('writer.continuity_studio.story_time')}
          value={event.storyTime}
          step="any"
          disabled={disabled}
          hint={t('writer.continuity_studio.story_time_hint')}
          onChange={(storyTime) => onChange({ ...event, storyTime })}
        />
      </div>
      {hasSlotConflict ? <DetailWarning>{t('writer.continuity_studio.timeline_slot_conflict')}</DetailWarning> : null}
      <TextAreaField
        label={t('writer.continuity_studio.evidence')}
        value={event.evidence}
        disabled={disabled}
        minHeight="min-h-16"
        hint={t('writer.continuity_studio.evidence_hint')}
        onChange={(evidence) => onChange({ ...event, evidence })}
      />
      <DeleteEntryButton
        label={t('writer.continuity_studio.remove_entry')}
        disabled={disabled}
        onDelete={() => onDelete(event.id)}
      />
    </div>
  )
}

function CharacterStateDetail({
  state,
  chapters,
  characters,
  disabled,
  onChange,
  onDelete
}: {
  state: WriterCharacterState | undefined
  chapters: WriterChapterMetadata[]
  characters: WriterCharacter[]
  disabled: boolean
  onChange: (state: WriterCharacterState) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!state) return null

  const characterOptions = [
    ...(characters.some((character) => character.id === state.characterId)
      ? []
      : [{ value: state.characterId, label: state.characterId }]),
    ...characters.map((character) => ({ value: character.id, label: character.name }))
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <EnumSelectField
          label={t('writer.continuity_studio.state_character')}
          value={state.characterId}
          options={characterOptions}
          disabled={disabled}
          hint={t('writer.continuity_studio.state_character_hint')}
          onChange={(characterId) => onChange({ ...state, characterId })}
        />
        <ChapterSelectField
          label={t('writer.continuity_studio.state_chapter')}
          value={state.chapterId}
          chapters={chapters}
          disabled={disabled}
          hint={t('writer.continuity_studio.state_chapter_hint')}
          onChange={(chapterId) => {
            if (chapterId) onChange({ ...state, chapterId })
          }}
        />
        <TextField
          label={t('writer.continuity_studio.timeline_id')}
          value={state.timelineId}
          disabled={disabled}
          hint={t('writer.continuity_studio.timeline_id_hint')}
          onChange={(timelineId) => onChange({ ...state, timelineId })}
        />
        <NumberField
          label={t('writer.continuity_studio.sequence')}
          value={state.sequence}
          min={0}
          max={1_000_000}
          integer
          disabled={disabled}
          hint={t('writer.continuity_studio.sequence_hint')}
          onChange={(sequence) => onChange({ ...state, sequence })}
        />
      </div>
      <TextField
        label={t('writer.continuity_studio.state_location')}
        value={state.location}
        disabled={disabled}
        hint={t('writer.continuity_studio.state_location_hint')}
        onChange={(location) => onChange({ ...state, location })}
      />
      <EnumSelectField
        label={t('writer.continuity_studio.life_status')}
        value={state.lifeStatus}
        options={(Object.keys(LIFE_STATUS_LABEL_KEYS) as WriterCharacterState['lifeStatus'][]).map((lifeStatus) => ({
          value: lifeStatus,
          label: t(LIFE_STATUS_LABEL_KEYS[lifeStatus])
        }))}
        disabled={disabled}
        hint={t('writer.continuity_studio.life_status_hint')}
        onChange={(lifeStatus) => onChange({ ...state, lifeStatus })}
      />
      <TextAreaField
        label={t('writer.continuity_studio.transition_explanation')}
        value={state.transitionExplanation}
        disabled={disabled}
        minHeight="min-h-16"
        hint={t('writer.continuity_studio.transition_explanation_hint')}
        onChange={(transitionExplanation) => onChange({ ...state, transitionExplanation })}
      />
      <TextAreaField
        label={t('writer.continuity_studio.evidence')}
        value={state.evidence}
        disabled={disabled}
        minHeight="min-h-16"
        hint={t('writer.continuity_studio.evidence_hint')}
        onChange={(evidence) => onChange({ ...state, evidence })}
      />
      <DeleteEntryButton
        label={t('writer.continuity_studio.remove_entry')}
        disabled={disabled}
        onDelete={() => onDelete(state.id)}
      />
    </div>
  )
}
