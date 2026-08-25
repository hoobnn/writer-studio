import { Badge, Button } from '@cherrystudio/ui'
import type { WriterProject } from '@shared/types/writer'
import { BookMarked, BookOpenText, Braces, GitBranch, ListChecks, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface WriterMemorySummaryProps {
  project: WriterProject
  onManageDocuments: () => void
  onManageLorebook: () => void
  onReviewContinuity: () => void
}

export function WriterMemorySummary({
  project,
  onManageDocuments,
  onManageLorebook,
  onReviewContinuity
}: WriterMemorySummaryProps) {
  const { t } = useTranslation()
  const storyBibleCount =
    project.storyBible.hardRules.length +
    project.storyBible.themes.length +
    project.storyBible.characters.length +
    project.storyBible.worldRules.length +
    project.storyBible.styleGuide.length
  const outlineCount = project.outline.arcs.length + project.outline.chapterPlans.length
  const continuityCount =
    project.continuity.facts.length +
    project.continuity.foreshadowing.length +
    project.continuity.chapterSummaries.length +
    (project.continuity.timelineEvents?.length ?? 0) +
    (project.continuity.characterStates?.length ?? 0)
  const openForeshadowing = project.continuity.foreshadowing.filter((item) => item.status === 'open')

  return (
    <section className="space-y-3 border-border border-t p-3" aria-labelledby="writer-memory-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="writer-memory-heading" className="font-medium text-xs uppercase tracking-wide">
          {t('writer.memory.title')}
        </h2>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {t('writer.memory.active')}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <MemoryCount
          icon={<BookMarked className="size-3.5" aria-hidden />}
          label={t('writer.memory.story_bible')}
          count={storyBibleCount}
        />
        <MemoryCount
          icon={<ListChecks className="size-3.5" aria-hidden />}
          label={t('writer.memory.outline')}
          count={outlineCount}
        />
        <MemoryCount
          icon={<GitBranch className="size-3.5" aria-hidden />}
          label={t('writer.memory.continuity')}
          count={continuityCount}
        />
        <MemoryCount
          icon={<BookOpenText className="size-3.5" aria-hidden />}
          label={t('writer.memory.lorebook')}
          count={project.storyBible.loreEntries.length}
        />
      </div>

      <MemoryList
        title={t('writer.memory.hard_rules')}
        emptyLabel={t('writer.memory.no_hard_rules')}
        items={project.storyBible.hardRules.slice(0, 3)}
        remaining={Math.max(0, project.storyBible.hardRules.length - 3)}
      />
      <MemoryList
        title={t('writer.memory.open_foreshadowing')}
        emptyLabel={t('writer.memory.no_open_foreshadowing')}
        items={openForeshadowing.slice(0, 3).map((item) => item.description)}
        remaining={Math.max(0, openForeshadowing.length - 3)}
      />
      <Button
        data-ui="writer.continuity-review.open"
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={project.manifest.chapters.length === 0}
        onClick={onReviewContinuity}>
        <ShieldCheck className="size-3.5" aria-hidden />
        {t('writer.memory.review_continuity')}
      </Button>
      <Button
        data-ui="writer.lorebook.open"
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onManageLorebook}>
        <BookOpenText className="size-3.5" aria-hidden />
        {t('writer.memory.manage_lorebook')}
      </Button>
      <Button
        data-ui="writer.memory.manage"
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onManageDocuments}>
        <Braces className="size-3.5" aria-hidden />
        {t('writer.memory.manage_documents')}
      </Button>
    </section>
  )
}

function MemoryCount({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-2 py-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="truncate text-[10px]">{label}</span>
      </div>
      <div className="mt-1 font-semibold text-base tabular-nums">{count}</div>
    </div>
  )
}

function MemoryList({
  title,
  emptyLabel,
  items,
  remaining
}: {
  title: string
  emptyLabel: string
  items: string[]
  remaining: number
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs">{title}</h3>
        {remaining > 0 ? (
          <span className="text-[10px] text-muted-foreground">{t('writer.memory.more', { count: remaining })}</span>
        ) : null}
      </div>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="line-clamp-2 rounded bg-background-subtle px-2 py-1.5 text-xs leading-5">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded bg-background-subtle px-2 py-1.5 text-muted-foreground text-xs">{emptyLabel}</p>
      )}
    </div>
  )
}
