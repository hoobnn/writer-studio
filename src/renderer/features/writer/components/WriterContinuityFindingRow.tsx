import { Badge, Button, Textarea } from '@cherrystudio/ui'
import type { WriterContinuityFindingView, WriterContinuityWaiver } from '@shared/types/writer'
import { RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
import { type ChangeEvent, memo, useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CONTINUITY_EVIDENCE_KIND_KEYS,
  CONTINUITY_FINDING_RULE_KEYS,
  CONTINUITY_FINDING_SEVERITY_KEYS,
  CONTINUITY_FINDING_STATE_KEYS,
  CONTINUITY_FINDING_SUGGESTION_KEYS
} from '../continuityReviewLabels'

const SEVERITY_CLASSES = {
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  info: 'border-info/40 bg-info/10 text-info'
} as const

const STATE_CLASSES = {
  open: 'border-border bg-background-subtle text-foreground',
  exempted: 'border-success/40 bg-success/10 text-success',
  stale_exemption: 'border-warning/40 bg-warning/10 text-warning'
} as const

interface WriterContinuityFindingRowProps {
  finding: WriterContinuityFindingView
  reason: string
  reasonError?: string
  reportStale: boolean
  mutationBusy: boolean
  activeAction?: string
  onReasonChange: (findingKey: string, reason: string) => void
  onWaive: (finding: WriterContinuityFindingView) => void
  onUnwaive: (findingKey: string) => void
}

export const WriterContinuityFindingRow = memo(function WriterContinuityFindingRow({
  finding,
  reason,
  reasonError,
  reportStale,
  mutationBusy,
  activeAction,
  onReasonChange,
  onWaive,
  onUnwaive
}: WriterContinuityFindingRowProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const reasonId = useId()
  const reasonHintId = useId()
  const reasonErrorId = useId()
  const waiveAction = `waive:${finding.key}`
  const unwaiveAction = `unwaive:${finding.key}`
  const canEditWaiver = finding.exemptible && finding.state !== 'exempted'

  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => onReasonChange(finding.key, event.target.value),
    [finding.key, onReasonChange]
  )
  const handleWaive = useCallback(() => onWaive(finding), [finding, onWaive])
  const handleUnwaive = useCallback(() => onUnwaive(finding.key), [finding.key, onUnwaive])

  return (
    <li
      data-ui="writer.continuity-review.finding"
      data-severity={finding.severity}
      data-state={finding.state}
      className="rounded-lg border border-border bg-background p-3 [contain-intrinsic-size:auto_280px] [content-visibility:auto]"
      aria-labelledby={headingId}>
      <article className="space-y-3">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={SEVERITY_CLASSES[finding.severity]}>
              {t(CONTINUITY_FINDING_SEVERITY_KEYS[finding.severity])}
            </Badge>
            <Badge variant="outline" className={STATE_CLASSES[finding.state]}>
              {t(CONTINUITY_FINDING_STATE_KEYS[finding.state])}
            </Badge>
            {!finding.exemptible ? (
              <Badge variant="outline">{t('writer.continuity_review.not_exemptible')}</Badge>
            ) : null}
          </div>
          <h3 id={headingId} className="font-medium text-sm leading-5">
            {t(CONTINUITY_FINDING_RULE_KEYS[finding.rule])}
          </h3>
          {finding.chapterIds.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('writer.continuity_review.chapters', { chapters: finding.chapterIds.join(', ') })}
            </p>
          ) : null}
        </header>

        <section aria-label={t('writer.continuity_review.evidence')} className="space-y-1.5">
          <h4 className="font-medium text-muted-foreground text-xs">{t('writer.continuity_review.evidence')}</h4>
          <ul className="space-y-1.5">
            {finding.evidence.map((evidence) => (
              <li
                key={`${evidence.kind}:${evidence.sourceId}:${evidence.chapterId ?? ''}:${evidence.label}`}
                className="rounded-md bg-background-subtle px-2.5 py-2 text-xs leading-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                    {t(CONTINUITY_EVIDENCE_KIND_KEYS[evidence.kind])}
                  </Badge>
                  {evidence.truncated ? (
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                      {t('writer.continuity_review.evidence_truncated')}
                    </Badge>
                  ) : null}
                  <span className="font-medium">{evidence.label}</span>
                </div>
                {evidence.detail ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{evidence.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {finding.evidenceTruncated ? (
            <p role="status" className="text-warning text-xs">
              {t('writer.continuity_review.evidence_list_truncated')}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-border bg-background-subtle px-2.5 py-2">
          <h4 className="font-medium text-muted-foreground text-xs">{t('writer.continuity_review.suggestion')}</h4>
          <p className="mt-1 text-xs leading-5">{t(CONTINUITY_FINDING_SUGGESTION_KEYS[finding.suggestion])}</p>
        </section>

        {finding.state === 'exempted' && finding.waiver ? (
          <section className="rounded-md border border-success/30 bg-success/5 px-2.5 py-2">
            <h4 className="font-medium text-xs">{t('writer.continuity_review.waiver_reason')}</h4>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-xs leading-5">{finding.waiver.reason}</p>
          </section>
        ) : null}

        {canEditWaiver ? (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="font-medium text-xs">
              {finding.state === 'stale_exemption'
                ? t('writer.continuity_review.renew_reason')
                : t('writer.continuity_review.waiver_reason')}
            </label>
            <Textarea.Input
              id={reasonId}
              value={reason}
              rows={3}
              maxLength={2000}
              disabled={reportStale || mutationBusy}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={`${reasonHintId}${reasonError ? ` ${reasonErrorId}` : ''}`}
              placeholder={t('writer.continuity_review.waiver_reason_placeholder')}
              onChange={handleReasonChange}
            />
            <p id={reasonHintId} className="text-[11px] text-muted-foreground">
              {reportStale
                ? t('writer.continuity_review.stale_waive_disabled')
                : t('writer.continuity_review.waiver_reason_hint')}
            </p>
            {reasonError ? (
              <p id={reasonErrorId} role="alert" className="text-destructive text-xs">
                {reasonError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {finding.state === 'exempted' || finding.state === 'stale_exemption' ? (
            <Button
              data-ui="writer.continuity-review.unwaive"
              type="button"
              size="sm"
              variant="outline"
              disabled={mutationBusy}
              loading={activeAction === unwaiveAction}
              onClick={handleUnwaive}>
              <ShieldOff className="size-3.5" aria-hidden />
              {t('writer.continuity_review.actions.unwaive')}
            </Button>
          ) : null}
          {canEditWaiver ? (
            <Button
              data-ui={
                finding.state === 'stale_exemption'
                  ? 'writer.continuity-review.renew'
                  : 'writer.continuity-review.waive'
              }
              type="button"
              size="sm"
              disabled={reportStale || mutationBusy}
              loading={activeAction === waiveAction}
              onClick={handleWaive}>
              {finding.state === 'stale_exemption' ? (
                <RotateCcw className="size-3.5" aria-hidden />
              ) : (
                <ShieldCheck className="size-3.5" aria-hidden />
              )}
              {finding.state === 'stale_exemption'
                ? t('writer.continuity_review.actions.renew')
                : t('writer.continuity_review.actions.waive')}
            </Button>
          ) : null}
        </div>
      </article>
    </li>
  )
})

interface WriterOrphanedWaiverRowProps {
  waiver: WriterContinuityWaiver
  mutationBusy: boolean
  activeAction?: string
  onUnwaive: (findingKey: string) => void
}

export const WriterOrphanedWaiverRow = memo(function WriterOrphanedWaiverRow({
  waiver,
  mutationBusy,
  activeAction,
  onUnwaive
}: WriterOrphanedWaiverRowProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const unwaiveAction = `unwaive:${waiver.findingKey}`
  const handleUnwaive = useCallback(() => onUnwaive(waiver.findingKey), [onUnwaive, waiver.findingKey])

  return (
    <li
      data-ui="writer.continuity-review.orphan"
      className="rounded-lg border border-warning/30 bg-warning/5 p-3 [contain-intrinsic-size:auto_180px] [content-visibility:auto]"
      aria-labelledby={headingId}>
      <article className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={headingId} className="font-medium text-sm">
              {t('writer.continuity_review.orphaned_waiver')}
            </h3>
            <code className="mt-1 block break-all text-[10px] text-muted-foreground">{waiver.findingKey}</code>
          </div>
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
            {t('writer.continuity_review.states.orphaned')}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap text-xs leading-5">{waiver.reason}</p>
        <div className="flex justify-end">
          <Button
            data-ui="writer.continuity-review.unwaive"
            type="button"
            size="sm"
            variant="outline"
            disabled={mutationBusy}
            loading={activeAction === unwaiveAction}
            onClick={handleUnwaive}>
            <ShieldOff className="size-3.5" aria-hidden />
            {t('writer.continuity_review.actions.unwaive')}
          </Button>
        </div>
      </article>
    </li>
  )
})
