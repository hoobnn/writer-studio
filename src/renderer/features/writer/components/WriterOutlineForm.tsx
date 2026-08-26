import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import type { WriterChapterMetadata, WriterChapterPlan, WriterOutline, WriterStoryArc } from '@shared/types/writer'
import { Plus, Trash2, X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ChapterSelectField,
  createEntityId,
  EnumSelectField,
  patchOptionalArray,
  SectionHeading,
  StringListField,
  TextAreaField,
  TextField
} from './documentFormFields'

const PLAN_STATUS_LABEL_KEYS = {
  planned: 'writer.outline_studio.plan_status.planned',
  drafted: 'writer.outline_studio.plan_status.drafted',
  revised: 'writer.outline_studio.plan_status.revised'
} as const satisfies Record<WriterChapterPlan['status'], string>

interface WriterOutlineFormProps {
  outline: WriterOutline
  chapters: WriterChapterMetadata[]
  disabled: boolean
  onChange: (outline: WriterOutline) => void
}

export function WriterOutlineForm({ outline, chapters, disabled, onChange }: WriterOutlineFormProps) {
  const { t } = useTranslation()

  const addArc = () => {
    const id = createEntityId(
      'arc',
      outline.arcs.map((arc) => arc.id)
    )
    onChange({
      ...outline,
      arcs: [...outline.arcs, { id, title: t('writer.outline_studio.new_arc'), summary: '', chapterIds: [] }]
    })
  }

  const updateArc = (index: number, arc: WriterStoryArc) => {
    const arcs = [...outline.arcs]
    arcs[index] = arc
    onChange({ ...outline, arcs })
  }

  const plannedChapterIds = new Set(outline.chapterPlans.map((plan) => plan.chapterId))
  const unplannedChapters = chapters.filter((chapter) => !plannedChapterIds.has(chapter.id))

  const addChapterPlan = () => {
    const chapter = unplannedChapters[0]
    if (!chapter) return
    onChange({
      ...outline,
      chapterPlans: [
        ...outline.chapterPlans,
        { chapterId: chapter.id, title: chapter.title, goal: '', beats: [], status: 'planned' }
      ]
    })
  }

  const updatePlan = (index: number, plan: WriterChapterPlan) => {
    const chapterPlans = [...outline.chapterPlans]
    chapterPlans[index] = plan
    onChange({ ...outline, chapterPlans })
  }

  return (
    <div data-ui="writer.outline-studio.form" className="min-h-0 space-y-5 overflow-y-auto p-4">
      <section className="space-y-4" aria-labelledby="writer-outline-overview-heading">
        <SectionHeading
          id="writer-outline-overview-heading"
          title={t('writer.outline_studio.overview')}
          description={t('writer.outline_studio.overview_description')}
        />
        <TextAreaField
          label={t('writer.outline_studio.book_summary')}
          value={outline.bookSummary}
          disabled={disabled}
          minHeight="min-h-24"
          hint={t('writer.outline_studio.book_summary_hint')}
          onChange={(bookSummary) => onChange({ ...outline, bookSummary })}
        />
      </section>

      <section className="space-y-4 border-border-subtle border-t pt-4" aria-labelledby="writer-outline-arcs-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            id="writer-outline-arcs-heading"
            title={t('writer.outline_studio.arcs')}
            description={t('writer.outline_studio.arcs_description')}
          />
          <Button
            data-ui="writer.outline-studio.add-arc"
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={addArc}>
            <Plus className="size-3.5" aria-hidden />
            {t('writer.outline_studio.add_arc')}
          </Button>
        </div>
        {outline.arcs.length ? (
          <div className="space-y-3">
            {outline.arcs.map((arc, index) => (
              <ArcCard
                key={arc.id}
                arc={arc}
                chapters={chapters}
                disabled={disabled}
                onChange={(nextArc) => updateArc(index, nextArc)}
                onDelete={() => onChange({ ...outline, arcs: outline.arcs.filter((item) => item.id !== arc.id) })}
              />
            ))}
          </div>
        ) : (
          <p className="py-2 text-muted-foreground text-xs">{t('writer.outline_studio.no_arcs')}</p>
        )}
      </section>

      <section className="space-y-4 border-border-subtle border-t pt-4" aria-labelledby="writer-outline-plans-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            id="writer-outline-plans-heading"
            title={t('writer.outline_studio.chapter_plans')}
            description={t('writer.outline_studio.chapter_plans_description')}
          />
          <Button
            data-ui="writer.outline-studio.add-plan"
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || unplannedChapters.length === 0}
            onClick={addChapterPlan}>
            <Plus className="size-3.5" aria-hidden />
            {t('writer.outline_studio.add_chapter_plan')}
          </Button>
        </div>
        {outline.chapterPlans.length ? (
          <div className="space-y-3">
            {outline.chapterPlans.map((plan, index) => (
              <ChapterPlanCard
                key={plan.chapterId}
                plan={plan}
                chapters={chapters}
                unplannedChapters={unplannedChapters}
                disabled={disabled}
                onChange={(nextPlan) => updatePlan(index, nextPlan)}
                onDelete={() =>
                  onChange({
                    ...outline,
                    chapterPlans: outline.chapterPlans.filter((item) => item.chapterId !== plan.chapterId)
                  })
                }
              />
            ))}
          </div>
        ) : (
          <p className="py-2 text-muted-foreground text-xs">{t('writer.outline_studio.no_chapter_plans')}</p>
        )}
      </section>
    </div>
  )
}

function ArcCard({
  arc,
  chapters,
  disabled,
  onChange,
  onDelete
}: {
  arc: WriterStoryArc
  chapters: WriterChapterMetadata[]
  disabled: boolean
  onChange: (arc: WriterStoryArc) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const chaptersLabelId = useId()
  const chaptersHintId = useId()
  const selectedIds = new Set(arc.chapterIds)
  const availableChapters = chapters.filter((chapter) => !selectedIds.has(chapter.id))

  return (
    <article className="space-y-3 rounded-md border border-border p-3 [contain-intrinsic-size:auto_320px] [content-visibility:auto]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            label={t('writer.outline_studio.arc_title')}
            value={arc.title}
            disabled={disabled}
            hint={t('writer.outline_studio.arc_title_hint')}
            onChange={(title) => onChange({ ...arc, title })}
          />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('writer.outline_studio.delete_arc', { title: arc.title })}
          disabled={disabled}
          onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
      <TextAreaField
        label={t('writer.outline_studio.arc_summary')}
        value={arc.summary}
        disabled={disabled}
        minHeight="min-h-20"
        hint={t('writer.outline_studio.arc_summary_hint')}
        onChange={(summary) => onChange({ ...arc, summary })}
      />
      <div className="space-y-1.5">
        <span id={chaptersLabelId} className="block font-medium text-xs">
          {t('writer.outline_studio.arc_chapters')}
        </span>
        <div className="flex flex-wrap items-center gap-1.5" aria-labelledby={chaptersLabelId}>
          {arc.chapterIds.length ? (
            arc.chapterIds.map((chapterId) => {
              const chapter = chapters.find((item) => item.id === chapterId)
              return (
                <Badge key={chapterId} variant={chapter ? 'outline' : 'destructive'} className="gap-1">
                  {chapter?.title ?? chapterId}
                  <button
                    type="button"
                    aria-label={t('writer.outline_studio.remove_arc_chapter', { title: chapter?.title ?? chapterId })}
                    disabled={disabled}
                    onClick={() => onChange({ ...arc, chapterIds: arc.chapterIds.filter((id) => id !== chapterId) })}>
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              )
            })
          ) : (
            <Badge variant="secondary">{t('writer.outline_studio.arc_global_badge')}</Badge>
          )}
          {availableChapters.length ? (
            <Select
              value=""
              disabled={disabled}
              onValueChange={(chapterId) => onChange({ ...arc, chapterIds: [...arc.chapterIds, chapterId] })}>
              <SelectTrigger size="sm" aria-labelledby={chaptersLabelId} aria-describedby={chaptersHintId}>
                <SelectValue placeholder={t('writer.outline_studio.add_arc_chapter')} />
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
        <span id={chaptersHintId} className="block text-muted-foreground text-xs">
          {t('writer.outline_studio.arc_chapters_hint')}
        </span>
      </div>
    </article>
  )
}

function ChapterPlanCard({
  plan,
  chapters,
  unplannedChapters,
  disabled,
  onChange,
  onDelete
}: {
  plan: WriterChapterPlan
  chapters: WriterChapterMetadata[]
  unplannedChapters: WriterChapterMetadata[]
  disabled: boolean
  onChange: (plan: WriterChapterPlan) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const requirementsLabelId = useId()
  const requirementsHintId = useId()
  const requirements = plan.requirements ?? []
  // Only chapters without their own plan are selectable, so the outline-level
  // "unique chapter ids" rule cannot be violated from the form.
  const currentChapter = chapters.filter((chapter) => chapter.id === plan.chapterId)
  const selectableChapters = [...currentChapter, ...unplannedChapters]

  const addRequirement = () => {
    const id = createEntityId(
      'req',
      requirements.map((requirement) => requirement.id)
    )
    onChange({ ...plan, requirements: [...requirements, { id, description: '' }] })
  }

  const updateRequirements = (next: NonNullable<WriterChapterPlan['requirements']>) => {
    onChange({ ...plan, requirements: patchOptionalArray(next) })
  }

  return (
    <article className="space-y-3 rounded-md border border-border p-3 [contain-intrinsic-size:auto_420px] [content-visibility:auto]">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
          <ChapterSelectField
            label={t('writer.outline_studio.plan_chapter')}
            value={plan.chapterId}
            chapters={selectableChapters}
            disabled={disabled}
            hint={t('writer.outline_studio.plan_chapter_hint')}
            onChange={(chapterId) => {
              if (chapterId) onChange({ ...plan, chapterId })
            }}
          />
          <TextField
            label={t('writer.outline_studio.plan_title')}
            value={plan.title}
            disabled={disabled}
            hint={t('writer.outline_studio.plan_title_hint')}
            onChange={(title) => onChange({ ...plan, title })}
          />
          <EnumSelectField
            label={t('writer.outline_studio.plan_status')}
            value={plan.status}
            options={(Object.keys(PLAN_STATUS_LABEL_KEYS) as WriterChapterPlan['status'][]).map((status) => ({
              value: status,
              label: t(PLAN_STATUS_LABEL_KEYS[status])
            }))}
            disabled={disabled}
            hint={t('writer.outline_studio.plan_status_hint')}
            onChange={(status) => onChange({ ...plan, status })}
          />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('writer.outline_studio.delete_chapter_plan', { title: plan.title })}
          disabled={disabled}
          onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
      <TextAreaField
        label={t('writer.outline_studio.plan_goal')}
        value={plan.goal}
        disabled={disabled}
        minHeight="min-h-20"
        hint={t('writer.outline_studio.plan_goal_hint')}
        onChange={(goal) => onChange({ ...plan, goal })}
      />
      <StringListField
        label={t('writer.outline_studio.beats')}
        values={plan.beats}
        disabled={disabled}
        placeholder={t('writer.outline_studio.beat_placeholder')}
        hint={t('writer.outline_studio.beats_hint')}
        onChange={(beats) => onChange({ ...plan, beats })}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span id={requirementsLabelId} className="font-medium text-xs">
            {t('writer.outline_studio.requirements')}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('writer.outline_studio.add_requirement')}
            disabled={disabled}
            onClick={addRequirement}>
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>
        <span id={requirementsHintId} className="block text-muted-foreground text-xs">
          {t('writer.outline_studio.requirements_hint')}
        </span>
        {requirements.length ? (
          <div className="space-y-1.5" aria-labelledby={requirementsLabelId} aria-describedby={requirementsHintId}>
            {requirements.map((requirement, index) => (
              <div key={requirement.id} className="flex items-center gap-1.5">
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{requirement.id}</span>
                <Input
                  value={requirement.description}
                  disabled={disabled}
                  aria-label={`${t('writer.outline_studio.requirements')} ${index + 1}`}
                  placeholder={t('writer.outline_studio.requirement_placeholder')}
                  onChange={(event) => {
                    const next = [...requirements]
                    next[index] = { ...requirement, description: event.target.value }
                    updateRequirements(next)
                  }}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t('common.delete')} ${t('writer.outline_studio.requirements')} ${index + 1}`}
                  disabled={disabled}
                  onClick={() => updateRequirements(requirements.filter((item) => item.id !== requirement.id))}>
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-1 py-1.5 text-muted-foreground text-xs">{t('writer.story_studio.empty_list')}</p>
        )}
      </div>
    </article>
  )
}
