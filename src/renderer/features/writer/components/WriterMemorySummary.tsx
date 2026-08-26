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
  return (
    <section className="shrink-0 space-y-2 border-border border-t p-2.5" aria-labelledby="writer-memory-heading">
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

      <Button
        data-ui="writer.continuity-review.open"
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        disabled={project.manifest.chapters.length === 0}
        onClick={onReviewContinuity}>
        <ShieldCheck className="size-3.5" aria-hidden />
        {t('writer.memory.review_continuity')}
      </Button>
      <Button
        data-ui="writer.lorebook.open"
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={onManageLorebook}>
        <BookOpenText className="size-3.5" aria-hidden />
        {t('writer.memory.manage_lorebook')}
      </Button>
      <Button
        data-ui="writer.memory.manage"
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={onManageDocuments}>
        <Braces className="size-3.5" aria-hidden />
        {t('writer.memory.manage_documents')}
      </Button>
    </section>
  )
}

function MemoryCount({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-background px-2 py-1.5">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] text-muted-foreground" title={label}>
          {label}
        </div>
        <div className="font-semibold text-sm tabular-nums">{count}</div>
      </div>
    </div>
  )
}
