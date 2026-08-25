import { Badge, Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { WriterOperation, WriterProposal, WriterProposalSummary } from '@shared/types/writer'
import { Database, LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const OPERATION_LABEL_KEYS: Record<WriterOperation, string> = {
  brainstorm: 'writer.copilot.operations.brainstorm',
  chapter_plan: 'writer.copilot.operations.chapter_plan',
  draft: 'writer.copilot.operations.draft',
  continue: 'writer.copilot.operations.continue',
  rewrite: 'writer.copilot.operations.rewrite',
  review: 'writer.copilot.operations.review',
  summarize: 'writer.copilot.operations.summarize'
}

const PROPOSAL_STATUS_LABEL_KEYS: Record<WriterProposalSummary['status'], string> = {
  pending: 'writer.proposals.status.pending',
  applying: 'writer.proposals.status.applying',
  applied: 'writer.proposals.status.applied'
}

interface WriterProposalLibraryProps {
  chapterId?: string
  onSelectProposal: (proposal: WriterProposal) => void
  refreshToken: number
  rootPath: string
  selectedProposalId?: string
}

export function WriterProposalLibrary({
  chapterId,
  onSelectProposal,
  refreshToken,
  rootPath,
  selectedProposalId
}: WriterProposalLibraryProps) {
  const { t } = useTranslation()
  const [proposals, setProposals] = useState<WriterProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingProposalId, setLoadingProposalId] = useState<string>()
  const listRequestIdRef = useRef(0)
  const proposalRequestIdRef = useRef(0)

  const loadProposals = useCallback(async () => {
    const requestId = ++listRequestIdRef.current
    setLoading(true)
    setLoadError(false)
    try {
      const result = await ipcApi.request('writer.proposal.list', {
        rootPath,
        ...(chapterId ? { chapterId } : {}),
        limit: 20
      })
      if (requestId !== listRequestIdRef.current) return
      setProposals(result.proposals)
    } catch {
      if (requestId !== listRequestIdRef.current) return
      setLoadError(true)
    } finally {
      if (requestId === listRequestIdRef.current) setLoading(false)
    }
  }, [chapterId, rootPath])

  useEffect(() => {
    void loadProposals()
    return () => {
      listRequestIdRef.current += 1
    }
  }, [loadProposals, refreshToken])

  useEffect(
    () => () => {
      proposalRequestIdRef.current += 1
    },
    []
  )

  const loadProposal = useCallback(
    async (proposalId: string) => {
      const requestId = ++proposalRequestIdRef.current
      setLoadingProposalId(proposalId)
      try {
        const proposal = await ipcApi.request('writer.proposal.read', { rootPath, proposalId })
        if (requestId !== proposalRequestIdRef.current) return
        onSelectProposal(proposal)
      } catch {
        if (requestId !== proposalRequestIdRef.current) return
        setLoadError(true)
      } finally {
        if (requestId === proposalRequestIdRef.current) setLoadingProposalId(undefined)
      }
    },
    [onSelectProposal, rootPath]
  )

  return (
    <section data-ui="writer.proposals.list" className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-medium text-xs">
          <Database className="size-3.5 text-muted-foreground" aria-hidden />
          {t('writer.proposals.title')}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('writer.proposals.retry')}
          disabled={loading}
          onClick={() => void loadProposals()}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </Button>
      </div>

      {loadError ? (
        <p role="status" className="text-destructive text-xs">
          {t('writer.proposals.load_failed')}
        </p>
      ) : null}

      {loading && proposals.length === 0 ? (
        <p role="status" className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      ) : proposals.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('writer.proposals.empty')}</p>
      ) : (
        <ul className="max-h-52 space-y-1 overflow-y-auto">
          {proposals.map((summary) => (
            <li key={summary.id}>
              <button
                data-ui="writer.proposals.load"
                type="button"
                aria-pressed={selectedProposalId === summary.id}
                onClick={() => void loadProposal(summary.id)}
                className="w-full rounded-md border border-transparent px-2 py-1.5 text-left hover:bg-accent aria-pressed:border-border aria-pressed:bg-accent">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-xs">{t(OPERATION_LABEL_KEYS[summary.operation])}</span>
                  <Badge variant={summary.status === 'pending' ? 'outline' : 'secondary'}>
                    {t(PROPOSAL_STATUS_LABEL_KEYS[summary.status])}
                  </Badge>
                </span>
                <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <time dateTime={summary.createdAt}>{new Date(summary.createdAt).toLocaleString()}</time>
                  <span className="truncate">{summary.uniqueModelId}</span>
                </span>
                {loadingProposalId === summary.id ? (
                  <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <LoaderCircle className="size-3 animate-spin" aria-hidden />
                    {t('writer.proposals.loading')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
