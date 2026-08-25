import { Badge, Button, Textarea } from '@cherrystudio/ui'
import type { WriterContinuityAuditRule, WriterContinuityCoverageView } from '@shared/types/writer'
import { CheckCheck, Undo2 } from 'lucide-react'
import { type ChangeEvent, memo, useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'

import { CONTINUITY_COVERAGE_RULE_KEYS, CONTINUITY_COVERAGE_STATUS_KEYS } from '../continuityReviewLabels'

interface WriterContinuityCoverageRowProps {
  coverage: WriterContinuityCoverageView
  throughChapterTitle?: string
  note: string
  reportStale: boolean
  reviewNotRun: boolean
  mutationBusy: boolean
  activeAction?: string
  onNoteChange: (rule: WriterContinuityAuditRule, note: string) => void
  onUpdate: (rule: WriterContinuityAuditRule, covered: boolean) => void
}

export const WriterContinuityCoverageRow = memo(function WriterContinuityCoverageRow({
  coverage,
  throughChapterTitle,
  note,
  reportStale,
  reviewNotRun,
  mutationBusy,
  activeAction,
  onNoteChange,
  onUpdate
}: WriterContinuityCoverageRowProps) {
  const { t } = useTranslation()
  const noteId = useId()
  const noteHintId = useId()
  const action = `coverage:${coverage.rule}`
  const checked = coverage.status === 'checked'
  const dataStale = coverage.staleItems > 0
  const markDisabled = reportStale || reviewNotRun || dataStale || !coverage.basisFingerprint || mutationBusy

  const handleNoteChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => onNoteChange(coverage.rule, event.target.value),
    [coverage.rule, onNoteChange]
  )
  const handleMark = useCallback(() => onUpdate(coverage.rule, true), [coverage.rule, onUpdate])
  const handleRevoke = useCallback(() => onUpdate(coverage.rule, false), [coverage.rule, onUpdate])

  return (
    <li
      data-ui="writer.continuity-review.coverage"
      data-coverage-status={coverage.status}
      className="rounded-lg border border-border bg-background px-3 py-2.5 [contain-intrinsic-size:auto_220px] [content-visibility:auto]">
      <article className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-xs">{t(CONTINUITY_COVERAGE_RULE_KEYS[coverage.rule])}</span>
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
            {t(CONTINUITY_COVERAGE_STATUS_KEYS[coverage.status])}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('writer.continuity_review.evaluated_items', { count: coverage.evaluatedItems })}
        </p>
        {throughChapterTitle ? (
          <p className="text-[11px] text-muted-foreground">
            {t('writer.continuity_review.through_chapter', { chapter: throughChapterTitle })}
          </p>
        ) : null}

        {checked ? (
          note ? (
            <p className="whitespace-pre-wrap text-[11px] leading-4">{note}</p>
          ) : null
        ) : (
          <div className="space-y-1">
            <label htmlFor={noteId} className="font-medium text-[11px]">
              {t('writer.continuity_review.coverage_note')}
            </label>
            <Textarea.Input
              id={noteId}
              value={note}
              rows={2}
              maxLength={2000}
              disabled={markDisabled}
              aria-describedby={noteHintId}
              placeholder={t('writer.continuity_review.coverage_note_placeholder')}
              onChange={handleNoteChange}
            />
            <p id={noteHintId} className="text-[10px] text-muted-foreground">
              {reportStale
                ? t('writer.continuity_review.coverage_stale_disabled')
                : dataStale
                  ? t('writer.continuity_review.coverage_data_stale_disabled')
                  : t('writer.continuity_review.coverage_note_hint')}
            </p>
          </div>
        )}

        <div className="flex justify-end">
          {checked ? (
            <Button
              data-ui="writer.continuity-review.coverage.revoke"
              type="button"
              size="sm"
              variant="outline"
              disabled={mutationBusy}
              loading={activeAction === action}
              onClick={handleRevoke}>
              <Undo2 className="size-3.5" aria-hidden />
              {t('writer.continuity_review.actions.revoke_coverage')}
            </Button>
          ) : (
            <Button
              data-ui="writer.continuity-review.coverage.mark"
              type="button"
              size="sm"
              disabled={markDisabled}
              loading={activeAction === action}
              onClick={handleMark}>
              <CheckCheck className="size-3.5" aria-hidden />
              {t('writer.continuity_review.actions.mark_covered')}
            </Button>
          )}
        </div>
      </article>
    </li>
  )
})
