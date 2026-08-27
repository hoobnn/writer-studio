import { Button, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { isTerminalStatus } from '@shared/data/api/schemas/jobs'
import { Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopGeneratePanelProps {
  rootPath: string
  selectedChapterId?: string
  onProposalArrived: () => Promise<void>
}

const POLL_INTERVAL_MS = 2_000

export function WorkshopGeneratePanel({ rootPath, selectedChapterId, onProposalArrived }: WorkshopGeneratePanelProps) {
  const { t } = useTranslation()
  const [role, setRole] = useState<'planner' | 'writer' | 'guardian' | 'cycle'>('planner')
  const [instruction, setInstruction] = useState('')
  const [jobId, setJobId] = useState<string>()
  const [errorMessage, setErrorMessage] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = undefined
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  useEffect(() => {
    if (!jobId) return
    pollRef.current = setInterval(async () => {
      try {
        const snapshot = await ipcApi.request('workshop.generation.status', { jobId })
        if (!snapshot || !isTerminalStatus(snapshot.status)) return
        stopPolling()
        setJobId(undefined)
        if (snapshot.status === 'completed') {
          setInstruction('')
          await onProposalArrived()
        } else {
          setErrorMessage(
            formatErrorMessageWithPrefix(
              new Error(snapshot.error?.message ?? snapshot.status),
              t('workshop.generate.failed')
            )
          )
        }
      } catch {
        // 单次轮询失败不终止;下一轮继续。
      }
    }, POLL_INTERVAL_MS)
    return stopPolling
  }, [jobId, onProposalArrived, stopPolling, t])

  const start = useCallback(async () => {
    const normalized = instruction.trim()
    if (!normalized) return
    setErrorMessage('')
    try {
      const snapshot =
        role === 'cycle'
          ? await ipcApi.request('workshop.cycle.start', {
              rootPath,
              chapterId: selectedChapterId ?? '',
              instruction: normalized
            })
          : await ipcApi.request('workshop.generation.start', {
              rootPath,
              role,
              instruction: normalized,
              ...(role !== 'planner' && selectedChapterId ? { chapterId: selectedChapterId } : {})
            })
      setJobId(snapshot.id)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('workshop.generate.failed')))
    }
  }, [instruction, role, rootPath, t])

  const cancel = useCallback(async () => {
    if (!jobId) return
    await ipcApi.request('workshop.generation.cancel', { jobId }).catch(() => {})
  }, [jobId])

  const running = Boolean(jobId)
  return (
    <div className="space-y-2 border-border border-b p-3">
      <div className="flex items-center gap-1">
        {(['planner', 'writer', 'guardian', 'cycle'] as const).map((candidate) => (
          <Button
            key={candidate}
            type="button"
            size="sm"
            variant={role === candidate ? 'secondary' : 'ghost'}
            disabled={running || (candidate === 'cycle' && !selectedChapterId)}
            title={candidate === 'cycle' && !selectedChapterId ? t('workshop.generate.cycle_needs_chapter') : undefined}
            onClick={() => setRole(candidate)}>
            {t(`workshop.generate.role_${candidate}`)}
          </Button>
        ))}
      </div>
      <Textarea.Input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={t('workshop.generate.instruction_placeholder')}
        disabled={running}
        className="min-h-20 resize-y text-sm"
      />
      {errorMessage ? (
        <p role="alert" className="rounded-md bg-error-subtle px-2 py-1.5 text-error-subtle-foreground text-xs">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {running ? (
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('workshop.generate.running')}
          </span>
        ) : (
          <span />
        )}
        {running ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void cancel()}>
            {t('workshop.generate.cancel')}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!instruction.trim() || (role === 'cycle' && !selectedChapterId)}
            onClick={() => void start()}>
            <Sparkles className="size-3.5" aria-hidden />
            {t('workshop.generate.start')}
          </Button>
        )}
      </div>
    </div>
  )
}
