import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input
} from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type {
  WriterContinuityAuditRule,
  WriterContinuityFindingView,
  WriterContinuityReviewView,
  WriterProject
} from '@shared/types/writer'
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { type ChangeEvent, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CONTINUITY_REVIEW_STATUS_KEYS } from '../continuityReviewLabels'
import { isWriterRevisionConflict } from '../utils'
import { WriterContinuityCoverageRow } from './WriterContinuityCoverageRow'
import { WriterContinuityFindingRow, WriterOrphanedWaiverRow } from './WriterContinuityFindingRow'

type SeverityFilter = 'all' | WriterContinuityFindingView['severity']
type StateFilter = 'all' | WriterContinuityFindingView['state']

const STATUS_CLASSES = {
  not_run: 'border-border bg-background-subtle text-muted-foreground',
  stale: 'border-warning/40 bg-warning/10 text-warning',
  issues: 'border-destructive/40 bg-destructive/10 text-destructive',
  incomplete: 'border-warning/40 bg-warning/10 text-warning',
  clear: 'border-success/40 bg-success/10 text-success'
} as const

interface WriterContinuityReviewDialogProps {
  project: WriterProject
  targetChapterId?: string
  onClose: () => void
}

function reviewScope(rootPath: string, targetChapterId: string | undefined) {
  return targetChapterId ? { rootPath, targetChapterId } : { rootPath }
}

export function WriterContinuityReviewDialog({ project, targetChapterId, onClose }: WriterContinuityReviewDialogProps) {
  const { t, i18n } = useTranslation()
  const language = i18n?.language ?? 'en-US'
  const rootPath = project.rootPath
  const [view, setView] = useState<WriterContinuityReviewView>()
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState('')
  const [activeAction, setActiveAction] = useState<string>()
  const [actionError, setActionError] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({})
  const [coverageNotes, setCoverageNotes] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const readRequestIdRef = useRef(0)
  const mutationRequestIdRef = useRef(0)
  const activeActionRef = useRef<string | undefined>(undefined)
  const viewRef = useRef<WriterContinuityReviewView | undefined>(undefined)
  const reasonsRef = useRef<Record<string, string>>({})
  const coverageNotesRef = useRef<Record<string, string>>({})
  const searchId = useId()
  const searchHintId = useId()
  const severityId = useId()
  const stateId = useId()

  const chapterTitleById = useMemo(
    () => new Map(project.manifest.chapters.map((chapter) => [chapter.id, chapter.title])),
    [project.manifest.chapters]
  )
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }),
    [language]
  )
  const targetChapterTitle = view
    ? (chapterTitleById.get(view.targetChapterId) ?? view.targetChapterId)
    : targetChapterId
      ? (chapterTitleById.get(targetChapterId) ?? targetChapterId)
      : t('writer.continuity_review.current_chapter')

  const commitView = useCallback((nextView: WriterContinuityReviewView) => {
    viewRef.current = nextView
    setView(nextView)
  }, [])

  const loadReview = useCallback(async () => {
    const requestId = ++readRequestIdRef.current
    setLoading(true)
    setReadError('')
    try {
      const result = await ipcApi.request('writer.continuity_review.read', reviewScope(rootPath, targetChapterId))
      if (requestId !== readRequestIdRef.current) return
      commitView(result)
    } catch (error) {
      if (requestId !== readRequestIdRef.current) return
      setReadError(formatErrorMessageWithPrefix(error, t('writer.continuity_review.errors.read_failed')))
    } finally {
      if (requestId === readRequestIdRef.current) setLoading(false)
    }
  }, [commitView, rootPath, t, targetChapterId])

  useEffect(() => {
    void loadReview()
    return () => {
      readRequestIdRef.current += 1
      mutationRequestIdRef.current += 1
    }
  }, [loadReview])

  const runReview = useCallback(async () => {
    const currentView = viewRef.current
    if (!currentView || activeActionRef.current) return
    readRequestIdRef.current += 1
    const requestId = ++mutationRequestIdRef.current
    activeActionRef.current = 'run'
    setActiveAction('run')
    setActionError('')
    try {
      const result = await ipcApi.request('writer.continuity_review.run', {
        ...reviewScope(rootPath, targetChapterId),
        expectedRevision: currentView.revision
      })
      if (requestId !== mutationRequestIdRef.current) return
      commitView(result)
    } catch (error) {
      if (requestId !== mutationRequestIdRef.current) return
      setActionError(
        isWriterRevisionConflict(error)
          ? t('writer.continuity_review.errors.conflict')
          : formatErrorMessageWithPrefix(error, t('writer.continuity_review.errors.run_failed'))
      )
    } finally {
      if (requestId === mutationRequestIdRef.current) {
        activeActionRef.current = undefined
        setActiveAction(undefined)
      }
    }
  }, [commitView, rootPath, t, targetChapterId])

  const updateReason = useCallback((findingKey: string, reason: string) => {
    setReasons((current) => {
      const next = { ...current, [findingKey]: reason }
      reasonsRef.current = next
      return next
    })
    setReasonErrors((current) => {
      if (!current[findingKey]) return current
      const next = { ...current }
      delete next[findingKey]
      return next
    })
    setActionError('')
  }, [])

  const waiveFinding = useCallback(
    async (finding: WriterContinuityFindingView) => {
      const currentView = viewRef.current
      if (!currentView || currentView.stale || activeActionRef.current || !finding.exemptible) return
      const reason = (reasonsRef.current[finding.key] ?? finding.waiver?.reason ?? '').trim()
      if (!reason) {
        setReasonErrors((current) => ({
          ...current,
          [finding.key]: t('writer.continuity_review.errors.reason_required')
        }))
        return
      }

      readRequestIdRef.current += 1
      const requestId = ++mutationRequestIdRef.current
      const action = `waive:${finding.key}`
      activeActionRef.current = action
      setActiveAction(action)
      setActionError('')
      try {
        const result = await ipcApi.request('writer.continuity_review.waive', {
          ...reviewScope(rootPath, targetChapterId),
          findingKey: finding.key,
          findingFingerprint: finding.fingerprint,
          reason,
          expectedRevision: currentView.revision
        })
        if (requestId !== mutationRequestIdRef.current) return
        commitView(result)
        setReasons((current) => {
          const next = { ...current, [finding.key]: reason }
          reasonsRef.current = next
          return next
        })
        setReasonErrors((current) => {
          if (!current[finding.key]) return current
          const next = { ...current }
          delete next[finding.key]
          return next
        })
      } catch (error) {
        if (requestId !== mutationRequestIdRef.current) return
        setActionError(
          isWriterRevisionConflict(error)
            ? t('writer.continuity_review.errors.conflict_reason_preserved')
            : formatErrorMessageWithPrefix(error, t('writer.continuity_review.errors.waive_failed'))
        )
      } finally {
        if (requestId === mutationRequestIdRef.current) {
          activeActionRef.current = undefined
          setActiveAction(undefined)
        }
      }
    },
    [commitView, rootPath, t, targetChapterId]
  )

  const unwaiveFinding = useCallback(
    async (findingKey: string) => {
      const currentView = viewRef.current
      if (!currentView || activeActionRef.current) return
      readRequestIdRef.current += 1
      const requestId = ++mutationRequestIdRef.current
      const action = `unwaive:${findingKey}`
      activeActionRef.current = action
      setActiveAction(action)
      setActionError('')
      try {
        const result = await ipcApi.request('writer.continuity_review.unwaive', {
          ...reviewScope(rootPath, targetChapterId),
          findingKey,
          expectedRevision: currentView.revision
        })
        if (requestId !== mutationRequestIdRef.current) return
        commitView(result)
      } catch (error) {
        if (requestId !== mutationRequestIdRef.current) return
        setActionError(
          isWriterRevisionConflict(error)
            ? t('writer.continuity_review.errors.conflict')
            : formatErrorMessageWithPrefix(error, t('writer.continuity_review.errors.unwaive_failed'))
        )
      } finally {
        if (requestId === mutationRequestIdRef.current) {
          activeActionRef.current = undefined
          setActiveAction(undefined)
        }
      }
    },
    [commitView, rootPath, t, targetChapterId]
  )

  const updateCoverageNote = useCallback((rule: WriterContinuityAuditRule, note: string) => {
    setCoverageNotes((current) => {
      const next = { ...current, [rule]: note }
      coverageNotesRef.current = next
      return next
    })
    setActionError('')
  }, [])

  const updateCoverage = useCallback(
    async (rule: WriterContinuityAuditRule, covered: boolean) => {
      const currentView = viewRef.current
      if (!currentView || activeActionRef.current) return
      const currentCoverage = currentView.coverage.find((item) => item.rule === rule)
      if (
        !currentCoverage ||
        (covered && (currentView.stale || currentCoverage.staleItems > 0 || !currentCoverage.basisFingerprint))
      ) {
        return
      }

      readRequestIdRef.current += 1
      const requestId = ++mutationRequestIdRef.current
      const action = `coverage:${rule}`
      activeActionRef.current = action
      setActiveAction(action)
      setActionError('')
      try {
        const note = (coverageNotesRef.current[rule] ?? currentCoverage.note).trim()
        const result = await ipcApi.request('writer.continuity_review.coverage.update', {
          ...reviewScope(rootPath, targetChapterId),
          rule,
          covered,
          ...(covered && note ? { note } : {}),
          expectedRevision: currentView.revision
        })
        if (requestId !== mutationRequestIdRef.current) return
        commitView(result)
        if (covered) {
          setCoverageNotes((current) => {
            const next = { ...current, [rule]: note }
            coverageNotesRef.current = next
            return next
          })
        }
      } catch (error) {
        if (requestId !== mutationRequestIdRef.current) return
        setActionError(
          isWriterRevisionConflict(error)
            ? t('writer.continuity_review.errors.conflict')
            : formatErrorMessageWithPrefix(error, t('writer.continuity_review.errors.coverage_failed'))
        )
      } finally {
        if (requestId === mutationRequestIdRef.current) {
          activeActionRef.current = undefined
          setActiveAction(undefined)
        }
      }
    },
    [commitView, rootPath, t, targetChapterId]
  )

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
  }, [])
  const handleSeverityChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setSeverityFilter(event.target.value as SeverityFilter)
  }, [])
  const handleStateChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setStateFilter(event.target.value as StateFilter)
  }, [])
  const handleRetryRead = useCallback(() => {
    void loadReview()
  }, [loadReview])
  const handleRunReview = useCallback(() => {
    void runReview()
  }, [runReview])

  const filteredFindings = useMemo(() => {
    const query = deferredSearchQuery.trim().toLocaleLowerCase()
    return (view?.findings ?? []).filter((finding) => {
      if (severityFilter !== 'all' && finding.severity !== severityFilter) return false
      if (stateFilter !== 'all' && finding.state !== stateFilter) return false
      if (!query) return true
      const searchable = [
        finding.rule,
        finding.suggestion,
        ...finding.chapterIds,
        ...finding.entityIds,
        ...finding.evidence.flatMap((evidence) => [evidence.label, evidence.detail]),
        finding.waiver?.reason ?? ''
      ]
      return searchable.some((value) => value.toLocaleLowerCase().includes(query))
    })
  }, [deferredSearchQuery, severityFilter, stateFilter, view?.findings])

  const checkedCoverageCount = useMemo(
    () => view?.coverage.filter((item) => item.status === 'checked').length ?? 0,
    [view?.coverage]
  )
  const mutationBusy = Boolean(activeAction)

  const closeDialog = useCallback(() => {
    readRequestIdRef.current += 1
    mutationRequestIdRef.current += 1
    activeActionRef.current = undefined
    onClose()
  }, [onClose])
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeDialog()
    },
    [closeDialog]
  )

  return (
    <Dialog open onOpenChange={handleDialogOpenChange}>
      <DialogContent
        data-ui="writer.continuity-review.dialog"
        size="xl"
        closeOnOverlayClick={false}
        className="grid h-[min(820px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:max-w-6xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            {t('writer.continuity_review.title')}
          </DialogTitle>
          <DialogDescription>
            {t('writer.continuity_review.description', { chapter: targetChapterTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {loading && !view ? (
            <p role="status" className="flex h-full items-center justify-center gap-2 text-muted-foreground text-sm">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t('common.loading')}
            </p>
          ) : readError && !view ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p role="alert" className="max-w-lg text-destructive text-sm">
                {readError}
              </p>
              <Button type="button" variant="outline" onClick={handleRetryRead}>
                {t('common.retry')}
              </Button>
            </div>
          ) : view ? (
            <>
              <section className="space-y-3 rounded-lg border border-border bg-background-subtle p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={STATUS_CLASSES[view.status]}>
                      {t(CONTINUITY_REVIEW_STATUS_KEYS[view.status])}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {t('writer.continuity_review.coverage_summary', {
                        checked: checkedCoverageCount,
                        total: view.coverage.length
                      })}
                    </span>
                    {view.generatedAt ? (
                      <time dateTime={view.generatedAt} className="text-muted-foreground text-xs">
                        {t('writer.continuity_review.generated_at', {
                          date: dateTimeFormatter.format(new Date(view.generatedAt))
                        })}
                      </time>
                    ) : null}
                  </div>
                  <Button
                    data-ui="writer.continuity-review.run"
                    type="button"
                    size="sm"
                    disabled={mutationBusy}
                    loading={activeAction === 'run'}
                    onClick={handleRunReview}>
                    <RefreshCw className="size-3.5" aria-hidden />
                    {view.status === 'not_run'
                      ? t('writer.continuity_review.actions.run')
                      : t('writer.continuity_review.actions.rerun')}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <ReviewCount label={t('writer.continuity_review.counts.error')} value={view.counts.error} />
                  <ReviewCount label={t('writer.continuity_review.counts.warning')} value={view.counts.warning} />
                  <ReviewCount label={t('writer.continuity_review.counts.info')} value={view.counts.info} />
                  <ReviewCount label={t('writer.continuity_review.counts.open')} value={view.counts.open} />
                  <ReviewCount label={t('writer.continuity_review.counts.exempted')} value={view.counts.exempted} />
                  <ReviewCount
                    label={t('writer.continuity_review.counts.stale_exemption')}
                    value={view.counts.staleExemption}
                  />
                </div>
              </section>

              {view.stale ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <div>
                    <p className="font-medium text-sm">{t('writer.continuity_review.stale_title')}</p>
                    <p className="mt-1 text-muted-foreground text-xs leading-5">
                      {t('writer.continuity_review.stale_description')}
                    </p>
                  </div>
                </div>
              ) : null}

              {view.truncated ? (
                <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                  {t('writer.continuity_review.truncated')}
                </p>
              ) : null}

              {actionError ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {actionError}
                </p>
              ) : null}

              <section className="space-y-2" aria-labelledby="writer-continuity-coverage-heading">
                <h2 id="writer-continuity-coverage-heading" className="font-medium text-sm">
                  {t('writer.continuity_review.coverage')}
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {view.coverage.map((coverage) => (
                    <WriterContinuityCoverageRow
                      key={coverage.rule}
                      coverage={coverage}
                      throughChapterTitle={
                        coverage.throughChapterId
                          ? (chapterTitleById.get(coverage.throughChapterId) ?? coverage.throughChapterId)
                          : undefined
                      }
                      note={coverageNotes[coverage.rule] ?? coverage.note}
                      reportStale={view.stale}
                      reviewNotRun={view.status === 'not_run'}
                      mutationBusy={mutationBusy}
                      activeAction={activeAction}
                      onNoteChange={updateCoverageNote}
                      onUpdate={updateCoverage}
                    />
                  ))}
                </ul>
              </section>

              <section className="space-y-3" aria-labelledby="writer-continuity-findings-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="writer-continuity-findings-heading" className="font-medium text-sm">
                    {t('writer.continuity_review.findings')}
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    {t('writer.continuity_review.filtered_count', {
                      filtered: filteredFindings.length,
                      total: view.findings.length
                    })}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_11rem_11rem]">
                  <div className="space-y-1">
                    <label htmlFor={searchId} className="font-medium text-xs">
                      {t('writer.continuity_review.search')}
                    </label>
                    <div className="relative">
                      <Search
                        className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id={searchId}
                        value={searchQuery}
                        className="pl-8"
                        aria-describedby={searchHintId}
                        placeholder={t('writer.continuity_review.search_placeholder')}
                        onChange={handleSearchChange}
                      />
                    </div>
                    <p id={searchHintId} className="sr-only">
                      {t('writer.continuity_review.search_hint')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={severityId} className="font-medium text-xs">
                      {t('writer.continuity_review.severity_filter')}
                    </label>
                    <select
                      id={severityId}
                      value={severityFilter}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      onChange={handleSeverityChange}>
                      <option value="all">{t('writer.continuity_review.filters.all_severities')}</option>
                      <option value="error">{t('writer.continuity_review.severity.error')}</option>
                      <option value="warning">{t('writer.continuity_review.severity.warning')}</option>
                      <option value="info">{t('writer.continuity_review.severity.info')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={stateId} className="font-medium text-xs">
                      {t('writer.continuity_review.state_filter')}
                    </label>
                    <select
                      id={stateId}
                      value={stateFilter}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      onChange={handleStateChange}>
                      <option value="all">{t('writer.continuity_review.filters.all_states')}</option>
                      <option value="open">{t('writer.continuity_review.states.open')}</option>
                      <option value="exempted">{t('writer.continuity_review.states.exempted')}</option>
                      <option value="stale_exemption">{t('writer.continuity_review.states.stale_exemption')}</option>
                    </select>
                  </div>
                </div>

                {view.status === 'not_run' ? (
                  <div className="rounded-lg border border-border border-dashed p-8 text-center">
                    <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-muted-foreground text-sm">{t('writer.continuity_review.not_run')}</p>
                  </div>
                ) : filteredFindings.length > 0 ? (
                  <ul data-ui="writer.continuity-review.findings" className="space-y-2">
                    {filteredFindings.map((finding) => (
                      <WriterContinuityFindingRow
                        key={finding.key}
                        finding={finding}
                        reason={reasons[finding.key] ?? finding.waiver?.reason ?? ''}
                        reasonError={reasonErrors[finding.key]}
                        reportStale={view.stale}
                        mutationBusy={mutationBusy}
                        activeAction={activeAction}
                        onReasonChange={updateReason}
                        onWaive={waiveFinding}
                        onUnwaive={unwaiveFinding}
                      />
                    ))}
                  </ul>
                ) : view.findings.length > 0 ? (
                  <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                    {t('writer.continuity_review.no_filter_results')}
                  </p>
                ) : (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-8 text-center">
                    <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
                    <p className="mt-2 text-sm">{t('writer.continuity_review.no_findings')}</p>
                  </div>
                )}
              </section>

              {view.orphanedWaivers.length > 0 ? (
                <section className="space-y-2" aria-labelledby="writer-continuity-orphans-heading">
                  <div>
                    <h2 id="writer-continuity-orphans-heading" className="font-medium text-sm">
                      {t('writer.continuity_review.orphaned_waivers')}
                    </h2>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {t('writer.continuity_review.orphaned_waivers_description')}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {view.orphanedWaivers.map((waiver) => (
                      <WriterOrphanedWaiverRow
                        key={waiver.findingKey}
                        waiver={waiver}
                        mutationBusy={mutationBusy}
                        activeAction={activeAction}
                        onUnwaive={unwaiveFinding}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-2 text-center">
      <div className="font-semibold text-base tabular-nums">{value}</div>
      <div className="truncate text-[10px] text-muted-foreground" title={label}>
        {label}
      </div>
    </div>
  )
}
