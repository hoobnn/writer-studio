import { Button, EmptyState, Scrollbar, Textarea, Tooltip } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import type { WorkshopDiscussionMessage } from '@shared/types/workshop'
import { Loader2, SendHorizonal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkshopJob } from '../hooks/useWorkshopJob'

interface WorkshopDiscussionPanelProps {
  rootPath: string
  /** 助手回合结束后刷新工作区(可能有新提案与正史变化)。 */
  onTurnFinished: () => Promise<void>
  /** 打开消息附带的提案(中栏审阅视图)。 */
  onOpenProposal: (proposalId: string) => void
}

export function WorkshopDiscussionPanel({ rootPath, onTurnFinished, onOpenProposal }: WorkshopDiscussionPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<WorkshopDiscussionMessage[]>([])
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    const { messages: next } = await ipcApi.request('workshop.discussion.list', { rootPath })
    setMessages(next)
  }, [rootPath])

  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  const job = useWorkshopJob({
    rootPath,
    domain: 'discussion',
    onCompleted: async () => {
      await reload()
      await onTurnFinished()
    },
    onFailed: (snapshot) => {
      toast.error({ title: t('workshop.discussion.failed'), description: snapshot.error?.message ?? snapshot.status })
      void reload()
    }
  })
  const thinking = job.running

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, thinking])

  const send = useCallback(async () => {
    const content = draft.trim()
    if (!content) return
    try {
      const snapshot = await ipcApi.request('workshop.discussion.send', { rootPath, content })
      setDraft('')
      await reload()
      job.start(snapshot.id)
    } catch (error) {
      toast.error({ title: t('workshop.discussion.failed'), description: getErrorMessage(error) })
    }
  }, [draft, job, reload, rootPath, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Scrollbar ref={listRef} className="min-h-0 flex-1 space-y-2 p-3">
        {messages.length === 0 && !thinking ? (
          <EmptyState compact description={t('workshop.discussion.empty')} />
        ) : null}
        {messages.map((message) => {
          const proposalId = message.proposalId
          return (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6 ${
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'
                }`}>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                {proposalId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-1.5"
                    onClick={() => onOpenProposal(proposalId)}>
                    {t('workshop.discussion.view_proposal')}
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}
        {thinking ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('workshop.discussion.thinking')}
          </div>
        ) : null}
      </Scrollbar>
      <div className="flex items-end gap-2 border-border border-t-[0.5px] p-3">
        <Textarea.Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder={t('workshop.discussion.input_placeholder')}
          disabled={thinking}
          className="min-h-16 flex-1 resize-y text-sm"
        />
        <Tooltip content={t('workshop.discussion.send')}>
          <Button
            type="button"
            size="icon-sm"
            aria-label={t('workshop.discussion.send')}
            disabled={thinking || !draft.trim()}
            onClick={() => void send()}>
            <SendHorizonal className="size-4" aria-hidden />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}
