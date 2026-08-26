import { Badge, Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { WorkshopFileDiff, WorkshopProposal } from '@shared/types/workshop'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopProposalPanelProps {
  rootPath: string
  proposals: WorkshopProposal[]
  busy: boolean
  onMutate: (errorKey: string, action: () => Promise<void>) => Promise<void>
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
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{content}</pre>
    </div>
  )
}

function FileDiffCard({ diff }: { diff: WorkshopFileDiff }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-2">
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

export function WorkshopProposalPanel({ rootPath, proposals, busy, onMutate }: WorkshopProposalPanelProps) {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<string>()
  const [diffs, setDiffs] = useState<Record<string, WorkshopFileDiff[]>>({})

  const toggleExpand = async (proposal: WorkshopProposal) => {
    if (expandedId === proposal.id) {
      setExpandedId(undefined)
      return
    }
    setExpandedId(proposal.id)
    if (!diffs[proposal.id]) {
      const { changes } = await ipcApi.request('workshop.proposal.changes', { rootPath, id: proposal.id })
      setDiffs((current) => ({ ...current, [proposal.id]: changes }))
    }
  }

  if (proposals.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-muted-foreground text-sm">
        {t('workshop.proposals.empty')}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
      {proposals.map((proposal) => {
        const expanded = expandedId === proposal.id
        return (
          <div key={proposal.id} className="rounded-lg border border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background-subtle"
              onClick={() => void toggleExpand(proposal)}>
              {expanded ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{proposal.title}</span>
              <Badge
                variant={
                  proposal.status === 'pending' ? 'default' : proposal.status === 'applied' ? 'secondary' : 'outline'
                }>
                {t(`workshop.proposals.status_${proposal.status}`)}
              </Badge>
              {proposal.stale ? <Badge variant="destructive">{t('workshop.proposals.stale')}</Badge> : null}
            </button>
            {expanded ? (
              <div className="space-y-2 border-border border-t p-3">
                {proposal.rationale ? (
                  <p className="text-muted-foreground text-sm leading-6">{proposal.rationale}</p>
                ) : null}
                {(diffs[proposal.id] ?? []).map((diff) => (
                  <FileDiffCard key={diff.filepath} diff={diff} />
                ))}
                {proposal.status === 'pending' ? (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void onMutate('workshop.errors.reject_proposal', async () => {
                          await ipcApi.request('workshop.proposal.reject', { rootPath, id: proposal.id })
                        })
                      }>
                      {t('workshop.proposals.reject')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || proposal.stale}
                      title={proposal.stale ? t('workshop.proposals.stale_hint') : undefined}
                      onClick={() =>
                        void onMutate('workshop.errors.apply_proposal', async () => {
                          await ipcApi.request('workshop.proposal.apply', { rootPath, id: proposal.id })
                        })
                      }>
                      {t('workshop.proposals.apply')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
