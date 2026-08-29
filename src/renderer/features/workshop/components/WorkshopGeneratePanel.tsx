import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import { Loader2, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkshopJob } from '../hooks/useWorkshopJob'
import { WORKSHOP_ROLE_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopGeneratePanelProps {
  rootPath: string
  selectedChapterId?: string
  /** 生成完成:携带新提案 id(若产出)供上层切换与高亮。 */
  onProposalArrived: (proposalId?: string) => Promise<void> | void
}

const ROLES = ['planner', 'writer', 'guardian', 'cycle'] as const
type GenerateRole = (typeof ROLES)[number]

export function WorkshopGeneratePanel({ rootPath, selectedChapterId, onProposalArrived }: WorkshopGeneratePanelProps) {
  const { t } = useTranslation()
  const [role, setRole] = useState<GenerateRole>('planner')
  const [instruction, setInstruction] = useState('')

  const job = useWorkshopJob({
    rootPath,
    domain: 'generation',
    onCompleted: async (snapshot) => {
      setInstruction('')
      const output = snapshot.output as { proposalId?: string } | null
      await onProposalArrived(output?.proposalId)
    },
    onFailed: (snapshot) => {
      toast.error({ title: t('workshop.generate.failed'), description: snapshot.error?.message ?? snapshot.status })
    }
  })
  const running = job.running

  const start = useCallback(async () => {
    const normalized = instruction.trim()
    if (!normalized) return
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
      job.start(snapshot.id)
    } catch (error) {
      toast.error({ title: t('workshop.generate.failed'), description: getErrorMessage(error) })
    }
  }, [instruction, job, role, rootPath, selectedChapterId, t])

  const cancel = useCallback(async () => {
    if (!job.jobId) return
    await ipcApi.request('workshop.generation.cancel', { jobId: job.jobId }).catch(() => {})
  }, [job.jobId])

  return (
    <div className="space-y-2 border-border border-b-[0.5px] p-3">
      <Select value={role} onValueChange={(value) => setRole(value as GenerateRole)} disabled={running}>
        <SelectTrigger className="w-full" aria-label={t('workshop.generate.role_label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((candidate) => (
            <SelectItem key={candidate} value={candidate} disabled={candidate === 'cycle' && !selectedChapterId}>
              {t(WORKSHOP_ROLE_LABEL_KEYS[candidate])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea.Input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            if (!running) void start()
          }
        }}
        placeholder={t('workshop.generate.instruction_placeholder')}
        disabled={running}
        className="min-h-20 resize-y text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        {running ? (
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('workshop.generate.running')}
          </span>
        ) : !selectedChapterId ? (
          <span className="text-muted-foreground text-xs">{t('workshop.generate.cycle_needs_chapter')}</span>
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
