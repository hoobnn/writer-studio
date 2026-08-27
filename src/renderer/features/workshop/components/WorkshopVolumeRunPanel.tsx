import { Button, Input, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { isTerminalStatus } from '@shared/data/api/schemas/jobs'
import { Loader2, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopVolumeRunPanelProps {
  rootPath: string
  volumeId: string
  onFinished?: () => Promise<void>
}

const POLL_INTERVAL_MS = 3_000

export function WorkshopVolumeRunPanel({ rootPath, volumeId, onFinished }: WorkshopVolumeRunPanelProps) {
  const { t } = useTranslation()
  const [instruction, setInstruction] = useState('')
  const [maxChapters, setMaxChapters] = useState('10')
  const [jobId, setJobId] = useState<string>()
  const [message, setMessage] = useState('')
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
          const output = snapshot.output as { completedChapterIds?: string[]; stopReason?: string } | null
          setMessage(
            t('workshop.volume.finished', {
              count: output?.completedChapterIds?.length ?? 0,
              reason: t(`workshop.volume.reason_${output?.stopReason ?? 'volume_done'}`)
            })
          )
        } else {
          setMessage(
            formatErrorMessageWithPrefix(
              new Error(snapshot.error?.message ?? snapshot.status),
              t('workshop.volume.failed')
            )
          )
        }
        await onFinished?.()
      } catch {
        // 下一轮继续。
      }
    }, POLL_INTERVAL_MS)
    return stopPolling
  }, [jobId, onFinished, stopPolling, t])

  const start = async () => {
    const normalized = instruction.trim()
    if (!normalized) return
    setMessage('')
    try {
      const snapshot = await ipcApi.request('workshop.volume.start', {
        rootPath,
        volumeId,
        instruction: normalized,
        gate: 'auto',
        maxChapters: Math.max(1, Math.min(50, Number(maxChapters) || 10))
      })
      setJobId(snapshot.id)
    } catch (error) {
      setMessage(formatErrorMessageWithPrefix(error, t('workshop.volume.failed')))
    }
  }

  const running = Boolean(jobId)
  return (
    <div className="mb-4 space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="font-medium text-sm">{t('workshop.volume.title')}</div>
      <p className="text-muted-foreground text-xs leading-5">{t('workshop.volume.description')}</p>
      <Textarea.Input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={t('workshop.volume.instruction_placeholder')}
        disabled={running}
        className="min-h-16 resize-y text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {t('workshop.volume.max_chapters')}
          <Input
            type="number"
            min={1}
            max={50}
            value={maxChapters}
            onChange={(event) => setMaxChapters(event.target.value)}
            disabled={running}
            className="h-7 w-16"
          />
        </label>
        <div className="flex-1" />
        {running ? (
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('workshop.volume.running')}
          </span>
        ) : (
          <Button type="button" size="sm" disabled={!instruction.trim()} onClick={() => void start()}>
            <Play className="size-3.5" aria-hidden />
            {t('workshop.volume.start')}
          </Button>
        )}
      </div>
      {message ? <p className="text-muted-foreground text-xs leading-5">{message}</p> : null}
    </div>
  )
}
