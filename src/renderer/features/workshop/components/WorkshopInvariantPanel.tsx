import { Badge, Button, EmptyState, Scrollbar, Tooltip } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import type { WorkshopCollection, WorkshopInvariantReport } from '@shared/types/workshop'
import { ShieldCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WORKSHOP_INVARIANT_RULE_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopInvariantPanelProps {
  rootPath: string
  /** 正史 head 变化时由父组件传入,用于提示报告已过期。 */
  headCommit: string
  /** 在实体索引里定位 finding 引用的实体所属集合;找不到返回 undefined。 */
  locateEntity: (entityId: string) => WorkshopCollection | undefined
  onOpenChapter: (chapterId: string) => void
  onOpenEntity: (collection: WorkshopCollection, entityId: string) => void
}

const SEVERITY_BADGE = { error: 'destructive', warning: 'default', info: 'outline' } as const

export function WorkshopInvariantPanel({
  rootPath,
  headCommit,
  locateEntity,
  onOpenChapter,
  onOpenEntity
}: WorkshopInvariantPanelProps) {
  const { t } = useTranslation()
  const [report, setReport] = useState<WorkshopInvariantReport>()
  const [running, setRunning] = useState(false)

  const run = useCallback(async () => {
    setRunning(true)
    try {
      setReport(await ipcApi.request('workshop.invariants.run', { rootPath }))
    } catch (error) {
      toast.error({ title: t('workshop.invariants.failed'), description: getErrorMessage(error) })
    } finally {
      setRunning(false)
    }
  }, [rootPath, t])

  const stale = report && report.headCommit !== headCommit
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-border border-b-[0.5px] p-3">
        <div className="flex items-center gap-1.5">
          {report ? (
            <>
              <Badge variant="destructive">{report.counts.error}</Badge>
              <Badge>{report.counts.warning}</Badge>
              <Badge variant="outline">{report.counts.info}</Badge>
              {stale ? <Badge variant="secondary">{t('workshop.invariants.stale')}</Badge> : null}
            </>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant={stale ? 'default' : report ? 'outline' : 'default'}
          loading={running}
          onClick={() => void run()}>
          <ShieldCheck className="size-3.5" aria-hidden />
          {t('workshop.invariants.run')}
        </Button>
      </div>
      <Scrollbar className="min-h-0 flex-1 space-y-1.5 p-2">
        {!report ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            description={t('workshop.invariants.not_run')}
            actionLabel={t('workshop.invariants.run')}
            onAction={() => void run()}
          />
        ) : null}
        {report && report.findings.length === 0 ? (
          <EmptyState compact icon={ShieldCheck} description={t('workshop.invariants.clear')} />
        ) : null}
        {(report?.findings ?? []).map((finding) => (
          <div key={finding.key} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge variant={SEVERITY_BADGE[finding.severity]}>
                {t(WORKSHOP_INVARIANT_RULE_LABEL_KEYS[finding.rule])}
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6">{finding.detail}</p>
            {finding.chapterIds.length > 0 || finding.entityIds.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {finding.chapterIds.map((chapterId) => (
                  <button
                    key={chapterId}
                    type="button"
                    onClick={() => onOpenChapter(chapterId)}
                    className="rounded border border-border bg-background-subtle px-1.5 py-0.5 font-mono text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground">
                    {chapterId}
                  </button>
                ))}
                {finding.entityIds.map((entityId) => {
                  const collection = locateEntity(entityId)
                  const chip = (
                    <button
                      key={entityId}
                      type="button"
                      disabled={!collection}
                      onClick={collection ? () => onOpenEntity(collection, entityId) : undefined}
                      className="rounded border border-border bg-background-subtle px-1.5 py-0.5 font-mono text-muted-foreground text-xs enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:opacity-60">
                      {entityId}
                    </button>
                  )
                  return collection ? (
                    chip
                  ) : (
                    <Tooltip key={entityId} content={t('workshop.invariants.entity_missing')}>
                      {chip}
                    </Tooltip>
                  )
                })}
              </div>
            ) : null}
          </div>
        ))}
      </Scrollbar>
    </div>
  )
}
