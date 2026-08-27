import { Badge, Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WorkshopInvariantReport } from '@shared/types/workshop'
import { ShieldCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopInvariantPanelProps {
  rootPath: string
  /** 正史 head 变化时由父组件传入,用于提示报告已过期。 */
  headCommit: string
}

const SEVERITY_BADGE = { error: 'destructive', warning: 'default', info: 'outline' } as const

export function WorkshopInvariantPanel({ rootPath, headCommit }: WorkshopInvariantPanelProps) {
  const { t } = useTranslation()
  const [report, setReport] = useState<WorkshopInvariantReport>()
  const [running, setRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const run = useCallback(async () => {
    setRunning(true)
    setErrorMessage('')
    try {
      setReport(await ipcApi.request('workshop.invariants.run', { rootPath }))
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('workshop.invariants.failed')))
    } finally {
      setRunning(false)
    }
  }, [rootPath, t])

  const stale = report && report.headCommit !== headCommit
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-border border-b p-3">
        <div className="flex items-center gap-1.5">
          {report ? (
            <>
              <Badge variant="destructive">{report.counts.error}</Badge>
              <Badge>{report.counts.warning}</Badge>
              <Badge variant="outline">{report.counts.info}</Badge>
              {stale ? <Badge variant="secondary">{t('workshop.invariants.stale')}</Badge> : null}
            </>
          ) : (
            <span className="text-muted-foreground text-xs">{t('workshop.invariants.not_run')}</span>
          )}
        </div>
        <Button type="button" size="sm" loading={running} onClick={() => void run()}>
          <ShieldCheck className="size-3.5" aria-hidden />
          {t('workshop.invariants.run')}
        </Button>
      </div>
      {errorMessage ? (
        <p role="alert" className="m-3 rounded-md bg-error-subtle px-2 py-1.5 text-error-subtle-foreground text-xs">
          {errorMessage}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {report && report.findings.length === 0 ? (
          <p className="pt-8 text-center text-muted-foreground text-sm">{t('workshop.invariants.clear')}</p>
        ) : null}
        {(report?.findings ?? []).map((finding) => (
          <div key={finding.key} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge variant={SEVERITY_BADGE[finding.severity]}>{t(`workshop.invariants.rule_${finding.rule}`)}</Badge>
            </div>
            <p className="mt-1 text-sm leading-6">{finding.detail}</p>
            {finding.chapterIds.length > 0 || finding.entityIds.length > 0 ? (
              <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                {[...finding.chapterIds, ...finding.entityIds].join(' · ')}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
