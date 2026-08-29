import {
  Button,
  CircularProgress,
  EmptyState,
  Input,
  Scrollbar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import type { JobSnapshot } from '@shared/data/api/schemas/jobs'
import type { WorkshopEntity } from '@shared/types/workshop'
import { ArrowLeft, FileText, Play, Square } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkshopJobApi } from '../hooks/useWorkshopJob'
import { entityLabel } from '../workshopEntityPresenter'
import { WORKSHOP_VOLUME_STOP_REASON_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopVolumeRunViewProps {
  rootPath: string
  volumes: WorkshopEntity[]
  initialVolumeId?: string
  chapterTitle: (chapterId: string) => string | undefined
  /** 由工作区持有的整卷 job(视图卸载后 header chip 仍能观察进度)。 */
  job: WorkshopJobApi
  /** 最近一次终态快照;由工作区在 onCompleted/onFailed 里记录。 */
  lastResult?: JobSnapshot
  onClearResult: () => void
  onClose: () => void
  onOpenChapter: (chapterId: string) => void
  onOpenProposal: (proposalId: string) => void
}

interface VolumeRunOutput {
  completedChapterIds?: string[]
  pendingProposalId?: string
  stopReason?: string
}

export function volumeRunTotal(snapshot: JobSnapshot | null, volumes: WorkshopEntity[]): number | undefined {
  const input = snapshot?.input as { volumeId?: string; maxChapters?: number } | null | undefined
  if (!input?.maxChapters) return undefined
  const volume = volumes.find((candidate) => candidate.id === input.volumeId)
  const planned = (volume?.data as { chapterIds?: string[] } | undefined)?.chapterIds?.length
  return planned ? Math.min(input.maxChapters, planned) : input.maxChapters
}

export function WorkshopVolumeRunView({
  rootPath,
  volumes,
  initialVolumeId,
  chapterTitle,
  job,
  lastResult,
  onClearResult,
  onClose,
  onOpenChapter,
  onOpenProposal
}: WorkshopVolumeRunViewProps) {
  const { t } = useTranslation()
  const [volumeId, setVolumeId] = useState(initialVolumeId ?? volumes[0]?.id ?? '')
  const [instruction, setInstruction] = useState('')
  const [maxChapters, setMaxChapters] = useState('10')
  const [gate, setGate] = useState<'auto' | 'review'>('auto')

  const start = async () => {
    const normalized = instruction.trim()
    if (!normalized || !volumeId) return
    onClearResult()
    try {
      const snapshot = await ipcApi.request('workshop.volume.start', {
        rootPath,
        volumeId,
        instruction: normalized,
        gate,
        maxChapters: Math.max(1, Math.min(50, Number(maxChapters) || 10))
      })
      job.start(snapshot.id)
    } catch (error) {
      toast.error({ title: t('workshop.volume.failed'), description: getErrorMessage(error) })
    }
  }

  const cancel = async () => {
    if (!job.jobId) return
    await ipcApi.request('workshop.generation.cancel', { jobId: job.jobId }).catch(() => {})
  }

  const detail = job.progress.detail as { chapterId?: string; completed?: number } | undefined
  const total = volumeRunTotal(job.snapshot, volumes)
  const current = (detail?.completed ?? 0) + 1

  const output = lastResult?.status === 'completed' ? (lastResult.output as VolumeRunOutput | null) : null

  return (
    <div data-ui="workshop.volume-run" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-border border-b-[0.5px] px-4 py-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('workshop.proposals.review_back')}
          onClick={onClose}>
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h2 className="min-w-0 flex-1 truncate font-medium text-base">{t('workshop.volume.title')}</h2>
      </div>
      <Scrollbar className="min-h-0 flex-1 p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-muted-foreground text-sm leading-6">{t('workshop.volume.description')}</p>
          {volumes.length === 0 ? (
            <EmptyState description={t('workshop.volume.no_volumes')} />
          ) : job.running ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6">
              <CircularProgress value={job.progress.progress} size={72} showLabel />
              <p className="font-medium text-sm">
                {total
                  ? t('workshop.volume.progress', { current: Math.min(current, total), total })
                  : t('workshop.volume.running')}
              </p>
              {detail?.chapterId ? (
                <p className="text-muted-foreground text-xs">
                  {t('workshop.volume.writing_chapter', {
                    label: chapterTitle(detail.chapterId) ?? detail.chapterId
                  })}
                </p>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={() => void cancel()}>
                <Square className="size-3.5" aria-hidden />
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-xs">{t('workshop.volume.select_volume')}</span>
                <Select value={volumeId} onValueChange={setVolumeId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('workshop.volume.select_volume')} />
                  </SelectTrigger>
                  <SelectContent>
                    {volumes.map((volume) => (
                      <SelectItem key={volume.id} value={volume.id}>
                        {entityLabel('outline/volumes', volume)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Textarea.Input
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t('workshop.volume.instruction_placeholder')}
                className="min-h-20 resize-y text-sm"
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  {t('workshop.volume.max_chapters')}
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={maxChapters}
                    onChange={(event) => setMaxChapters(event.target.value)}
                    className="h-7 w-16"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  {t('workshop.volume.gate_label')}
                  <Select value={gate} onValueChange={(value) => setGate(value as 'auto' | 'review')}>
                    <SelectTrigger className="h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('workshop.volume.gate_auto')}</SelectItem>
                      <SelectItem value="review">{t('workshop.volume.gate_review')}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  disabled={!instruction.trim() || !volumeId}
                  onClick={() => void start()}>
                  <Play className="size-3.5" aria-hidden />
                  {t('workshop.volume.start')}
                </Button>
              </div>
            </div>
          )}

          {lastResult && !job.running ? (
            <div className="space-y-2 rounded-lg border border-border bg-card p-4">
              {output ? (
                <>
                  <p className="text-sm">
                    {t('workshop.volume.finished', {
                      count: output.completedChapterIds?.length ?? 0,
                      reason: t(WORKSHOP_VOLUME_STOP_REASON_LABEL_KEYS[output.stopReason ?? 'volume_done'])
                    })}
                  </p>
                  <div className="space-y-0.5">
                    {(output.completedChapterIds ?? []).map((chapterId) => (
                      <Button
                        key={chapterId}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => onOpenChapter(chapterId)}>
                        <FileText className="size-3.5" aria-hidden />
                        {chapterTitle(chapterId) ?? chapterId}
                      </Button>
                    ))}
                  </div>
                  {output.pendingProposalId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenProposal(output.pendingProposalId ?? '')}>
                      {t('workshop.volume.review_proposal')}
                    </Button>
                  ) : null}
                </>
              ) : (
                <p
                  role="alert"
                  className="rounded-md border border-error-border bg-error-subtle px-3 py-2 text-error-subtle-foreground text-sm">
                  {lastResult.status === 'cancelled'
                    ? t('workshop.volume.cancelled')
                    : `${t('workshop.volume.failed')}: ${lastResult.error?.message ?? lastResult.status}`}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </Scrollbar>
    </div>
  )
}
