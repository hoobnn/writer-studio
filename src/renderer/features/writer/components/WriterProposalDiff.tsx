import type { WriterOperation } from '@shared/types/writer'
import { type Change, diffLines } from 'diff'
import { useDeferredValue, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getProposalApplyModes } from '../utils'

interface WriterProposalDiffProps {
  currentContent: string
  operation: WriterOperation
  proposalContent: string
}

export const WRITER_DIFF_MAX_TOTAL_CHARS = 200_000
const WRITER_DIFF_PER_SIDE_CHARS = WRITER_DIFF_MAX_TOTAL_CHARS / 2
const WRITER_DIFF_OMISSION_MARKER = '\n\n...\n\n'

function cropDiffInput(content: string): string {
  if (content.length <= WRITER_DIFF_PER_SIDE_CHARS) return content
  const edgeLength = Math.floor((WRITER_DIFF_PER_SIDE_CHARS - WRITER_DIFF_OMISSION_MARKER.length) / 2)
  return `${content.slice(0, edgeLength)}${WRITER_DIFF_OMISSION_MARKER}${content.slice(-edgeLength)}`
}

export function WriterProposalDiff({ currentContent, operation, proposalContent }: WriterProposalDiffProps) {
  const { t } = useTranslation()
  const canApply = getProposalApplyModes(operation).length > 0
  const targetContent = useMemo(
    () => buildProposalTargetContent(currentContent, proposalContent, operation),
    [currentContent, operation, proposalContent]
  )

  if (!canApply) return null

  return (
    <WriterLineDiff
      beforeContent={currentContent}
      afterContent={targetContent}
      title={t('writer.copilot.diff')}
      truncatedLabel={t('writer.copilot.diff_truncated')}
      headingId="writer-proposal-diff-heading"
    />
  )
}

interface WriterLineDiffProps {
  afterContent: string
  beforeContent: string
  headingId: string
  title: string
  truncatedLabel: string
}

export function WriterLineDiff({ afterContent, beforeContent, headingId, title, truncatedLabel }: WriterLineDiffProps) {
  const deferredBeforeContent = useDeferredValue(beforeContent)
  const deferredAfterContent = useDeferredValue(afterContent)
  const diffTruncated = deferredBeforeContent.length + deferredAfterContent.length > WRITER_DIFF_MAX_TOTAL_CHARS
  const displayedBeforeContent = diffTruncated ? cropDiffInput(deferredBeforeContent) : deferredBeforeContent
  const displayedAfterContent = diffTruncated ? cropDiffInput(deferredAfterContent) : deferredAfterContent
  const changes = useMemo(
    () =>
      diffLines(displayedBeforeContent, displayedAfterContent, {
        ignoreNewlineAtEof: true,
        oneChangePerToken: true
      }),
    [displayedAfterContent, displayedBeforeContent]
  )

  return (
    <section className="space-y-1.5" aria-labelledby={headingId}>
      <h4 id={headingId} className="font-medium text-muted-foreground text-xs">
        {title}
      </h4>
      {diffTruncated ? (
        <p role="status" className="text-warning-foreground text-xs">
          {truncatedLabel}
        </p>
      ) : null}
      <div className="max-h-72 overflow-auto rounded-md border border-border bg-background font-mono text-xs leading-5">
        {changes.map((change, index) => (
          <DiffLine
            key={`${index}-${change.added ? 'added' : change.removed ? 'removed' : 'unchanged'}`}
            change={change}
          />
        ))}
      </div>
    </section>
  )
}

function DiffLine({ change }: { change: Change }) {
  const { t } = useTranslation()
  const kind = change.added ? 'added' : change.removed ? 'removed' : 'unchanged'
  const prefix = change.added ? '+' : change.removed ? '-' : ' '
  const label = change.added
    ? t('writer.copilot.diff_added')
    : change.removed
      ? t('writer.copilot.diff_removed')
      : t('writer.copilot.diff_unchanged')
  const className = change.added
    ? 'bg-success-subtle text-success-subtle-foreground'
    : change.removed
      ? 'bg-destructive/10 text-destructive'
      : 'text-muted-foreground'

  return (
    <div
      data-diff-kind={kind}
      aria-label={`${label}: ${change.value || ' '}`}
      className={`grid min-w-max grid-cols-[1.5rem_minmax(0,1fr)] ${className}`}>
      <span aria-hidden className="select-none border-border border-r text-center">
        {prefix}
      </span>
      <span className="whitespace-pre-wrap break-words px-2">{change.value || ' '}</span>
    </div>
  )
}

export function buildProposalTargetContent(
  currentContent: string,
  proposalContent: string,
  operation: WriterOperation
): string {
  if (operation !== 'continue' || currentContent.length === 0 || proposalContent.length === 0) {
    return proposalContent
  }

  const trailingNewlines = currentContent.match(/\n+$/)?.[0].length ?? 0
  const leadingNewlines = proposalContent.match(/^\n+/)?.[0].length ?? 0
  const separator = '\n'.repeat(Math.max(0, 2 - trailingNewlines - leadingNewlines))
  return `${currentContent}${separator}${proposalContent}`
}
