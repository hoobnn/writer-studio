import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { ModelSelector } from '@renderer/components/ModelSelector'
import { useJob, useJobProgress } from '@renderer/hooks/useJob'
import { useDefaultModel } from '@renderer/hooks/useModel'
import { useTemporaryValue } from '@renderer/hooks/useTemporaryValue'
import { ipcApi } from '@renderer/ipc'
import type { Model } from '@shared/data/types/model'
import {
  type WriterContextPacket,
  WriterGenerationOutputSchema,
  type WriterOperation,
  type WriterProject,
  type WriterProjectDocumentRevisions,
  type WriterProposal,
  type WriterProposalMode
} from '@shared/types/writer'
import { isNonChatModel } from '@shared/utils/model'
import {
  buildWriterLoreScanText,
  formatWriterChapterPlanContext,
  selectActiveWriterLoreEntries
} from '@shared/utils/writerLore'
import { Bot, Check, Copy, Eye, Sparkles, Square, WandSparkles } from 'lucide-react'
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getProposalApplyModes } from '../utils'
import { WriterContextInspector } from './WriterContextInspector'
import { WriterProposalDiff } from './WriterProposalDiff'
import { WriterProposalLibrary } from './WriterProposalLibrary'

const CodeEditor = lazy(() => import('@cherrystudio/ui/components/composites/code-editor'))

const WRITER_OPERATIONS: readonly WriterOperation[] = [
  'brainstorm',
  'chapter_plan',
  'draft',
  'continue',
  'rewrite',
  'review',
  'summarize'
]

const WRITER_OPERATION_LABEL_KEYS: Record<WriterOperation, string> = {
  brainstorm: 'writer.copilot.operations.brainstorm',
  chapter_plan: 'writer.copilot.operations.chapter_plan',
  draft: 'writer.copilot.operations.draft',
  continue: 'writer.copilot.operations.continue',
  rewrite: 'writer.copilot.operations.rewrite',
  review: 'writer.copilot.operations.review',
  summarize: 'writer.copilot.operations.summarize'
}

const WRITER_JOB_STATUS_LABEL_KEYS = {
  loading: 'writer.copilot.job_status.loading',
  pending: 'writer.copilot.job_status.pending',
  delayed: 'writer.copilot.job_status.delayed',
  running: 'writer.copilot.job_status.running',
  completed: 'writer.copilot.job_status.completed',
  failed: 'writer.copilot.job_status.failed',
  cancelled: 'writer.copilot.job_status.cancelled'
} as const

const writerModelFilter = (model: Model) => !isNonChatModel(model)

interface WriterCopilotProps {
  project: WriterProject
  chapterId?: string
  currentContent: string
  initialActiveJobId?: string
  onBeforeGeneration: () => Promise<boolean>
  onApplyProposal: (proposalId: string, mode: WriterProposalMode) => Promise<void>
  onApplyingChange: (applying: boolean) => void
  onActiveJobIdChange: (jobId: string | undefined) => void
}

interface ContextPreviewState {
  packet: WriterContextPacket
  currentContent: string
  documentRevisions: WriterProjectDocumentRevisions
  instruction: string
  operation: WriterOperation
  uniqueModelId?: string
}

export function WriterCopilot({
  project,
  chapterId,
  currentContent,
  initialActiveJobId,
  onBeforeGeneration,
  onApplyProposal,
  onApplyingChange,
  onActiveJobIdChange
}: WriterCopilotProps) {
  const { t } = useTranslation()
  const modelLabelId = useId()
  const modelValueId = useId()
  const operationLabelId = useId()
  const { quickModel } = useDefaultModel()
  const [selectedModel, setSelectedModel] = useState<Model>()
  const [operation, setOperation] = useState<WriterOperation>('continue')
  const [instruction, setInstruction] = useState('')
  const [activeJobId, setActiveJobId] = useState<string | undefined>(initialActiveJobId)
  const [jobTerminal, setJobTerminal] = useState(!initialActiveJobId)
  const [proposal, setProposal] = useState<WriterProposal>()
  const [contextPreviewState, setContextPreviewState] = useState<ContextPreviewState>()
  const [errorMessage, setErrorMessage] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [applyingMode, setApplyingMode] = useState<WriterProposalMode>()
  const [proposalCopied, setProposalCopied] = useTemporaryValue(false)
  const [proposalRefreshToken, setProposalRefreshToken] = useState(0)
  const deferredCurrentContent = useDeferredValue(currentContent)
  const deferredInstruction = useDeferredValue(instruction)
  const effectiveModel = selectedModel ?? quickModel
  const proposalApplyModes = proposal ? getProposalApplyModes(proposal.operation) : []
  const proposalCanReplace = proposalApplyModes.includes('replace')
  const proposalCanAppend = proposalApplyModes.includes('append')
  const contextPreview =
    contextPreviewState &&
    contextPreviewState.currentContent === currentContent &&
    contextPreviewState.instruction === instruction &&
    contextPreviewState.operation === operation &&
    contextPreviewState.uniqueModelId === effectiveModel?.id &&
    contextPreviewState.documentRevisions.storyBible === project.documentRevisions.storyBible &&
    contextPreviewState.documentRevisions.outline === project.documentRevisions.outline &&
    contextPreviewState.documentRevisions.continuity === project.documentRevisions.continuity
      ? contextPreviewState.packet
      : undefined

  const startGeneration = async () => {
    setStarting(true)
    setErrorMessage('')

    try {
      if (!(await onBeforeGeneration())) {
        setErrorMessage(t('writer.errors.save_chapter'))
        return
      }

      const normalizedInstruction = instruction.trim()
      const snapshot = await ipcApi.request('writer.generation.start', {
        rootPath: project.rootPath,
        ...(chapterId ? { chapterId } : {}),
        operation,
        ...(normalizedInstruction ? { instruction: normalizedInstruction } : {}),
        ...(effectiveModel ? { uniqueModelId: effectiveModel.id } : {})
      })
      setProposal(undefined)
      setActiveJobId(snapshot.id)
      onActiveJobIdChange(snapshot.id)
      setJobTerminal(false)
    } catch {
      setErrorMessage(t('writer.errors.start_generation'))
      setJobTerminal(true)
    } finally {
      setStarting(false)
    }
  }

  const previewContext = async () => {
    setPreviewing(true)
    setErrorMessage('')
    try {
      if (!(await onBeforeGeneration())) {
        setErrorMessage(t('writer.errors.save_chapter'))
        return
      }
      const normalizedInstruction = instruction.trim()
      const preview = await ipcApi.request('writer.context.preview', {
        rootPath: project.rootPath,
        ...(chapterId ? { chapterId } : {}),
        operation,
        ...(normalizedInstruction ? { instruction: normalizedInstruction } : {}),
        ...(effectiveModel ? { uniqueModelId: effectiveModel.id } : {})
      })
      setContextPreviewState({
        packet: preview.packet,
        currentContent,
        documentRevisions: project.documentRevisions,
        instruction,
        operation,
        uniqueModelId: effectiveModel?.id
      })
    } catch {
      setErrorMessage(t('writer.errors.preview_context'))
    } finally {
      setPreviewing(false)
    }
  }

  const cancelGeneration = async () => {
    if (!activeJobId) return
    setCancelling(true)
    setErrorMessage('')
    try {
      await ipcApi.request('writer.generation.cancel', { jobId: activeJobId })
    } catch {
      setErrorMessage(t('writer.errors.cancel_generation'))
    } finally {
      setCancelling(false)
    }
  }

  const applyProposal = async (mode: WriterProposalMode) => {
    if (!proposal || proposal.status === 'applied') return
    setApplyingMode(mode)
    onApplyingChange(true)
    setErrorMessage('')
    try {
      await onApplyProposal(proposal.id, mode)
      setProposal((current) => (current ? { ...current, status: 'applied', appliedMode: mode } : current))
      setProposalRefreshToken((current) => current + 1)
      setActiveJobId(undefined)
      onActiveJobIdChange(undefined)
    } catch {
      setErrorMessage(t('writer.errors.apply_proposal'))
    } finally {
      setApplyingMode(undefined)
      onApplyingChange(false)
    }
  }

  const copyProposal = async () => {
    if (!proposal) return
    try {
      await navigator.clipboard.writeText(proposal.content)
      setProposalCopied(true)
    } catch {
      setErrorMessage(t('writer.errors.copy_proposal'))
    }
  }

  const handleLibraryProposal = useCallback((nextProposal: WriterProposal) => {
    setProposal(nextProposal)
  }, [])
  const handleJobProposal = useCallback((nextProposal: WriterProposal) => {
    setProposal(nextProposal)
    setProposalRefreshToken((current) => current + 1)
  }, [])
  const handleJobTerminal = useCallback(
    (status?: 'completed' | 'failed' | 'cancelled', hasProposal = false) => {
      setJobTerminal(true)
      if (status === 'failed' || status === 'cancelled' || (status === 'completed' && !hasProposal)) {
        setActiveJobId(undefined)
        onActiveJobIdChange(undefined)
      }
    },
    [onActiveJobIdChange]
  )
  const handleJobError = useCallback((message: string) => setErrorMessage(message), [])

  const openForeshadowingCount = project.continuity.foreshadowing.filter((item) => item.status === 'open').length
  const activeChapterPlan = useMemo(
    () => project.outline.chapterPlans.find((item) => item.chapterId === chapterId),
    [chapterId, project.outline.chapterPlans]
  )
  const chapterPlanText = formatWriterChapterPlanContext(activeChapterPlan)
  const activeLoreEntries = useMemo(() => {
    const scanText = buildWriterLoreScanText({
      currentContent: deferredCurrentContent,
      chapterPlan: chapterPlanText,
      instruction: deferredInstruction,
      operation
    })
    return selectActiveWriterLoreEntries(project.storyBible.loreEntries, scanText)
  }, [chapterPlanText, deferredCurrentContent, deferredInstruction, operation, project.storyBible.loreEntries])

  return (
    <aside className="flex h-full min-h-0 flex-col bg-background" aria-labelledby="writer-copilot-heading">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-border border-b px-3">
        <Bot className="size-4 text-primary" aria-hidden />
        <h2 id="writer-copilot-heading" className="font-medium text-sm">
          {t('writer.copilot.title')}
        </h2>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="space-y-1.5">
          <span id={modelLabelId} className="font-medium text-xs">
            {t('writer.copilot.model')}
          </span>
          <ModelSelector
            multiple={false}
            value={effectiveModel}
            onSelect={(model) => {
              if (model) {
                setSelectedModel(model)
                setContextPreviewState(undefined)
              }
            }}
            filter={writerModelFilter}
            trigger={
              <Button
                type="button"
                variant="outline"
                className="w-full min-w-0 justify-between"
                aria-labelledby={`${modelLabelId} ${modelValueId}`}>
                <span id={modelValueId} className="truncate">
                  {effectiveModel?.name ?? t('writer.copilot.model_managed_default')}
                </span>
                <WandSparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Button>
            }
          />
        </div>

        <div className="space-y-1.5">
          <span id={operationLabelId} className="font-medium text-xs">
            {t('writer.copilot.operation')}
          </span>
          <Select
            value={operation}
            onValueChange={(value) => {
              setOperation(value as WriterOperation)
              setContextPreviewState(undefined)
            }}>
            <SelectTrigger className="w-full" aria-labelledby={operationLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WRITER_OPERATIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(WRITER_OPERATION_LABEL_KEYS[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="block space-y-1.5">
          <span className="font-medium text-xs">{t('writer.copilot.instruction')}</span>
          <Textarea.Input
            value={instruction}
            onChange={(event) => {
              setInstruction(event.target.value)
              setContextPreviewState(undefined)
            }}
            placeholder={t('writer.copilot.instruction_placeholder')}
            className="min-h-20 resize-y"
          />
        </label>

        <section className="space-y-2.5 rounded-lg border border-border bg-background-subtle p-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-xs">{t('writer.copilot.context_sources')}</h3>
            <Badge variant="outline">{t('writer.memory.active')}</Badge>
          </div>
          {contextPreview ? (
            <WriterContextInspector packet={contextPreview} title={t('writer.context.preview_result')} />
          ) : (
            <>
              <p className="text-muted-foreground text-xs leading-5">{t('writer.context.preview_hint')}</p>
              <div className="flex flex-wrap gap-1">
                <ContextSourceBadge
                  label={t('writer.copilot.source_hard_rules')}
                  count={project.storyBible.hardRules.length}
                />
                <ContextSourceBadge label={t('writer.copilot.source_chapter_plan')} count={activeChapterPlan ? 1 : 0} />
                <ContextSourceBadge label={t('writer.copilot.source_story_arcs')} count={project.outline.arcs.length} />
                <ContextSourceBadge
                  label={t('writer.copilot.source_characters')}
                  count={project.storyBible.characters.length}
                />
                <ContextSourceBadge label={t('writer.copilot.source_lorebook')} count={activeLoreEntries.length} />
                <ContextSourceBadge label={t('writer.copilot.source_foreshadowing')} count={openForeshadowingCount} />
              </div>
            </>
          )}
          <Button
            data-ui="writer.context.preview"
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            loading={previewing}
            disabled={!jobTerminal}
            onClick={() => void previewContext()}>
            <Eye className="size-3.5" aria-hidden />
            {contextPreview ? t('writer.context.refresh_preview') : t('writer.context.preview')}
          </Button>
        </section>

        <p className="rounded-md border border-border bg-background-subtle px-2.5 py-2 text-muted-foreground text-xs leading-5">
          {t('writer.copilot.data_notice')}
        </p>

        <div className="flex gap-2">
          <Button type="button" className="flex-1" loading={starting} disabled={!jobTerminal} onClick={startGeneration}>
            <Sparkles className="size-4" aria-hidden />
            {t('writer.copilot.start')}
          </Button>
          {!jobTerminal && activeJobId ? (
            <Button
              type="button"
              variant="outline"
              loading={cancelling}
              aria-label={t('writer.copilot.cancel')}
              onClick={cancelGeneration}>
              <Square className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>

        {activeJobId ? (
          <GenerationJobPanel
            key={activeJobId}
            jobId={activeJobId}
            rootPath={project.rootPath}
            onProposal={handleJobProposal}
            onTerminal={handleJobTerminal}
            onError={handleJobError}
          />
        ) : null}

        <WriterProposalLibrary
          rootPath={project.rootPath}
          chapterId={chapterId}
          refreshToken={proposalRefreshToken}
          selectedProposalId={proposal?.id}
          onSelectProposal={handleLibraryProposal}
        />

        {errorMessage ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {errorMessage}
          </p>
        ) : null}

        {proposal ? (
          <section
            className="space-y-3 rounded-lg border border-border p-2.5"
            aria-labelledby="writer-proposal-heading">
            <div className="flex items-center justify-between gap-2">
              <h3 id="writer-proposal-heading" className="font-medium text-xs">
                {t('writer.copilot.proposal')}
              </h3>
              {proposal.status === 'applied' ? (
                <Badge variant="outline">
                  <Check className="size-3" aria-hidden />
                  {t('writer.copilot.applied')}
                </Badge>
              ) : null}
            </div>
            <p className="rounded bg-warning/10 px-2 py-1.5 text-warning-foreground text-xs leading-5">
              {t('writer.copilot.proposal_safety')}
            </p>

            <WriterProposalDiff
              currentContent={currentContent}
              operation={proposal.operation}
              proposalContent={proposal.content}
            />

            <div className="max-h-72 overflow-hidden rounded-md border border-border [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
              <Suspense
                fallback={
                  <div role="status" className="flex h-72 items-center justify-center text-muted-foreground text-sm">
                    {t('common.loading')}
                  </div>
                }>
                <CodeEditor
                  value={proposal.content}
                  language="markdown"
                  editable={false}
                  readOnly
                  expanded={false}
                  height="18rem"
                  theme="none"
                />
              </Suspense>
            </div>

            {proposal.rationale ? (
              <div className="space-y-1">
                <h4 className="font-medium text-muted-foreground text-xs">{t('writer.copilot.rationale')}</h4>
                <p className="text-xs leading-5">{proposal.rationale}</p>
              </div>
            ) : null}

            <WriterContextInspector packet={proposal.contextPacket} title={t('writer.copilot.actual_context')} />

            {proposalApplyModes.length === 0 ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => void copyProposal()}>
                {proposalCopied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {proposalCopied ? t('common.copied') : t('writer.copilot.copy_proposal')}
              </Button>
            ) : null}
            {proposal.status === 'pending' && (proposalCanReplace || proposalCanAppend) ? (
              <div className={`grid gap-2 ${proposalCanReplace && proposalCanAppend ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {proposalCanReplace ? (
                  <Button
                    type="button"
                    variant="outline"
                    loading={applyingMode === 'replace'}
                    disabled={Boolean(applyingMode)}
                    onClick={() => void applyProposal('replace')}>
                    {t('writer.copilot.replace')}
                  </Button>
                ) : null}
                {proposalCanAppend ? (
                  <Button
                    type="button"
                    loading={applyingMode === 'append'}
                    disabled={Boolean(applyingMode)}
                    onClick={() => void applyProposal('append')}>
                    {t('writer.copilot.append')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  )
}

function ContextSourceBadge({ label, count }: { label: string; count: number }) {
  return (
    <Badge variant="outline" className="gap-1 bg-background">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </Badge>
  )
}

function GenerationJobPanel({
  jobId,
  rootPath,
  onProposal,
  onTerminal,
  onError
}: {
  jobId: string
  rootPath: string
  onProposal: (proposal: WriterProposal) => void
  onTerminal: (status?: 'completed' | 'failed' | 'cancelled', hasProposal?: boolean) => void
  onError: (message: string) => void
}) {
  const { t } = useTranslation()
  const { data: snapshot, isTerminal, isLoading, error } = useJob(jobId)
  const { progress, detail } = useJobProgress(jobId)
  const handledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const cleanup = () => {
      cancelled = true
    }

    if (handledRef.current) return cleanup
    if (error) {
      handledRef.current = true
      onError(t('writer.errors.start_generation'))
      onTerminal()
      return cleanup
    }
    if (!isTerminal || !snapshot) return cleanup

    handledRef.current = true
    if (snapshot.status === 'completed') {
      const parsedOutput = WriterGenerationOutputSchema.safeParse(snapshot.output)
      if (!parsedOutput.success) {
        onError(t('writer.errors.start_generation'))
        onTerminal('completed', false)
        return cleanup
      }
      void ipcApi
        .request('writer.proposal.read', { rootPath, proposalId: parsedOutput.data.proposalId })
        .then((completedProposal) => {
          if (cancelled) return
          onProposal(completedProposal)
          onTerminal('completed', true)
        })
        .catch(() => {
          if (cancelled) return
          onError(t('writer.errors.load_proposal'))
          onTerminal('completed', true)
        })
    } else if (snapshot.status === 'failed') {
      onError(snapshot.error?.message || t('writer.errors.start_generation'))
      onTerminal('failed')
    } else if (snapshot.status === 'cancelled') {
      onTerminal('cancelled')
    }
    return cleanup
  }, [error, isTerminal, onError, onProposal, onTerminal, rootPath, snapshot, t])

  const status = isLoading || !snapshot ? 'loading' : snapshot.status
  const progressDetail = typeof detail === 'string' ? detail : ''

  return (
    <section className="space-y-2 rounded-lg border border-border p-2.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>{t(WRITER_JOB_STATUS_LABEL_KEYS[status])}</span>
        <span className="font-medium tabular-nums">{Math.round(progress)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('writer.copilot.job_progress', { progress: Math.round(progress) })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-1.5 overflow-hidden rounded-full bg-background-subtle">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      {progressDetail ? <p className="text-muted-foreground text-xs">{progressDetail}</p> : null}
    </section>
  )
}
