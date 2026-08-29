import { Badge, Button, EmptyState, Scrollbar } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import type { WorkshopFileDiff, WorkshopProposal } from '@shared/types/workshop'
import { ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkshopBusyApi } from '../hooks/useWorkshopBusy'
import { chapterIdFromDiffPath } from '../workshopEntityPresenter'
import { WORKSHOP_PROPOSAL_STATUS_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopProposalReviewProps {
  rootPath: string
  proposalId: string
  /** 来自工作区提案列表;应用/驳回后随 refreshAll 更新状态。 */
  proposal: WorkshopProposal | undefined
  busy: WorkshopBusyApi['busy']
  run: WorkshopBusyApi['run']
  onClose: () => void
  onOpenChapter: (chapterId: string) => void
  onMutated: () => Promise<void>
}

function DiffBlock({ label, content, tone }: { label: string; content: string; tone: 'before' | 'after' }) {
  return (
    <div
      className={`rounded-md border p-2 ${
        tone === 'before'
          ? 'border-error-border bg-error-subtle text-error-subtle-foreground'
          : 'border-success-border bg-success-subtle text-success-subtle-foreground'
      }`}>
      <div className="mb-1 font-medium text-xs">{label}</div>
      <pre className="overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{content}</pre>
    </div>
  )
}

function FileDiffCard({ diff }: { diff: WorkshopFileDiff }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 truncate font-mono text-muted-foreground text-xs">{diff.filepath}</div>
      <div className="space-y-2">
        {diff.before !== null ? (
          <DiffBlock label={t('workshop.proposals.diff_before')} content={diff.before} tone="before" />
        ) : null}
        {diff.after !== null ? (
          <DiffBlock label={t('workshop.proposals.diff_after')} content={diff.after} tone="after" />
        ) : null}
      </div>
    </div>
  )
}

export function WorkshopProposalReview({
  rootPath,
  proposalId,
  proposal,
  busy,
  run,
  onClose,
  onOpenChapter,
  onMutated
}: WorkshopProposalReviewProps) {
  const { t } = useTranslation()
  const [changes, setChanges] = useState<WorkshopFileDiff[]>()

  useEffect(() => {
    let cancelled = false
    ipcApi
      .request('workshop.proposal.changes', { rootPath, id: proposalId })
      .then((result) => {
        if (!cancelled) setChanges(result.changes)
      })
      .catch(() => {
        if (!cancelled) setChanges([])
      })
    return () => {
      cancelled = true
    }
  }, [proposalId, rootPath])

  const touchedChapterIds = useMemo(
    () => [...new Set((changes ?? []).map((diff) => chapterIdFromDiffPath(diff.filepath)).filter(Boolean))] as string[],
    [changes]
  )

  if (!proposal) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-border border-b-[0.5px] px-4 py-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('workshop.proposals.review_back')}
            onClick={onClose}>
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        </div>
        <EmptyState description={t('workshop.proposals.empty')} />
      </div>
    )
  }

  const mutating = Boolean(busy.proposal)
  return (
    <div data-ui="workshop.proposal-review" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-border border-b-[0.5px] px-4 py-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('workshop.proposals.review_back')}
          onClick={onClose}>
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="min-w-0 flex-1 truncate font-medium text-base">{proposal.title}</h2>
        <Badge
          variant={proposal.status === 'pending' ? 'default' : proposal.status === 'applied' ? 'secondary' : 'outline'}>
          {t(WORKSHOP_PROPOSAL_STATUS_LABEL_KEYS[proposal.status])}
        </Badge>
        {proposal.stale ? <Badge variant="destructive">{t('workshop.proposals.stale')}</Badge> : null}
        {touchedChapterIds.map((chapterId) => (
          <Button key={chapterId} type="button" size="sm" variant="ghost" onClick={() => onOpenChapter(chapterId)}>
            <FileText className="size-3.5" aria-hidden />
            {t('workshop.proposals.open_chapter', { id: chapterId })}
          </Button>
        ))}
        {proposal.status === 'pending' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mutating}
              onClick={async () => {
                const ok = await run('proposal', 'workshop.errors.reject_proposal', async () => {
                  await ipcApi.request('workshop.proposal.reject', { rootPath, id: proposal.id })
                  await onMutated()
                })
                if (ok) toast.success(t('workshop.proposals.rejected_toast'))
              }}>
              {t('workshop.proposals.reject')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={mutating || proposal.stale}
              loading={mutating}
              title={proposal.stale ? t('workshop.proposals.stale_hint') : undefined}
              onClick={async () => {
                const ok = await run('proposal', 'workshop.errors.apply_proposal', async () => {
                  await ipcApi.request('workshop.proposal.apply', { rootPath, id: proposal.id })
                  await onMutated()
                })
                if (ok) toast.success(t('workshop.proposals.applied_toast'))
              }}>
              {t('workshop.proposals.apply')}
            </Button>
          </>
        ) : null}
      </div>
      <Scrollbar className="min-h-0 flex-1 space-y-3 p-4">
        {proposal.rationale ? <p className="text-muted-foreground text-sm leading-6">{proposal.rationale}</p> : null}
        {changes === undefined ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('workshop.proposals.loading_changes')}
          </div>
        ) : (
          changes.map((diff) => <FileDiffCard key={diff.filepath} diff={diff} />)
        )}
      </Scrollbar>
    </div>
  )
}
