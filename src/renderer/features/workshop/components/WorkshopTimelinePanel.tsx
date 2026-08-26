import { Badge, Button } from '@cherrystudio/ui'
import type { WorkshopTimelineEntry } from '@shared/types/workshop'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopTimelinePanelProps {
  headCommit: string
  entries: WorkshopTimelineEntry[]
  busy: boolean
  onRollback: (commit: string) => Promise<void>
}

export function WorkshopTimelinePanel({ headCommit, entries, busy, onRollback }: WorkshopTimelinePanelProps) {
  const { t } = useTranslation()
  const [confirmingCommit, setConfirmingCommit] = useState<string>()

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
      {entries.map((entry) => {
        const isHead = entry.commit === headCommit
        const confirming = confirmingCommit === entry.commit
        return (
          <div key={entry.commit} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
              <Badge variant="outline">{t(`workshop.timeline.kind_${entry.kind}`)}</Badge>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {new Date(entry.timestamp).toLocaleString()} ·{' '}
                {entry.origin.kind === 'human' ? t('workshop.entity.origin_human') : t('workshop.entity.origin_ai')}
              </span>
              {isHead ? (
                <span className="text-muted-foreground text-xs">{t('workshop.timeline.current')}</span>
              ) : confirming ? (
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingCommit(undefined)}>
                    {t('workshop.timeline.cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    loading={busy}
                    onClick={() => {
                      setConfirmingCommit(undefined)
                      void onRollback(entry.commit)
                    }}>
                    {t('workshop.timeline.confirm_rollback')}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmingCommit(entry.commit)}>
                  {t('workshop.timeline.rollback')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
