import { Badge, Button, ConfirmDialog, Scrollbar } from '@cherrystudio/ui'
import type { WorkshopTimelineEntry } from '@shared/types/workshop'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WORKSHOP_TIMELINE_KIND_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopTimelinePanelProps {
  headCommit: string
  entries: WorkshopTimelineEntry[]
  busy: boolean
  onRollback: (commit: string) => Promise<void>
}

export function WorkshopTimelinePanel({ headCommit, entries, busy, onRollback }: WorkshopTimelinePanelProps) {
  const { t } = useTranslation()
  const [confirmingEntry, setConfirmingEntry] = useState<WorkshopTimelineEntry>()

  return (
    <Scrollbar className="min-h-0 flex-1 space-y-1.5 p-2">
      {entries.map((entry) => {
        const isHead = entry.commit === headCommit
        return (
          <div key={entry.commit} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
              <Badge variant="outline">{t(WORKSHOP_TIMELINE_KIND_LABEL_KEYS[entry.kind])}</Badge>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {new Date(entry.timestamp).toLocaleString()} ·{' '}
                {entry.origin.kind === 'human' ? t('workshop.entity.origin_human') : t('workshop.entity.origin_ai')}
              </span>
              {isHead ? (
                <span className="text-muted-foreground text-xs">{t('workshop.timeline.current')}</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmingEntry(entry)}>
                  {t('workshop.timeline.rollback')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
      <ConfirmDialog
        open={Boolean(confirmingEntry)}
        onOpenChange={(open) => {
          if (!open) setConfirmingEntry(undefined)
        }}
        title={t('workshop.timeline.rollback')}
        description={
          confirmingEntry ? t('workshop.timeline.rollback_description', { title: confirmingEntry.title }) : ''
        }
        confirmText={t('workshop.timeline.confirm_rollback')}
        cancelText={t('common.cancel')}
        destructive
        confirmLoading={busy}
        onConfirm={() => {
          if (confirmingEntry) void onRollback(confirmingEntry.commit)
        }}
      />
    </Scrollbar>
  )
}
