import { Badge, Button, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { isTerminalStatus } from '@shared/data/api/schemas/jobs'
import type { WorkshopDiscussionMessage } from '@shared/types/workshop'
import { Loader2, SendHorizonal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WorkshopDiscussionPanelProps {
  rootPath: string
  /** 助手回合结束后刷新工作区(可能有新提案与正史变化)。 */
  onTurnFinished: () => Promise<void>
}

const POLL_INTERVAL_MS = 2_000

export function WorkshopDiscussionPanel({ rootPath, onTurnFinished }: WorkshopDiscussionPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<WorkshopDiscussionMessage[]>([])
  const [draft, setDraft] = useState('')
  const [jobId, setJobId] = useState<string>()
  const [errorMessage, setErrorMessage] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const reload = useCallback(async () => {
    const { messages: next } = await ipcApi.request('workshop.discussion.list', { rootPath })
    setMessages(next)
  }, [rootPath])

  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, jobId])

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
        if (snapshot.status !== 'completed') {
          setErrorMessage(
            formatErrorMessageWithPrefix(
              new Error(snapshot.error?.message ?? snapshot.status),
              t('workshop.discussion.failed')
            )
          )
        }
        await reload()
        await onTurnFinished()
      } catch {
        // 单次轮询失败不终止。
      }
    }, POLL_INTERVAL_MS)
    return stopPolling
  }, [jobId, onTurnFinished, reload, stopPolling, t])

  const send = useCallback(async () => {
    const content = draft.trim()
    if (!content) return
    setErrorMessage('')
    try {
      const snapshot = await ipcApi.request('workshop.discussion.send', { rootPath, content })
      setDraft('')
      await reload()
      setJobId(snapshot.id)
    } catch (error) {
      setErrorMessage(formatErrorMessageWithPrefix(error, t('workshop.discussion.failed')))
    }
  }, [draft, reload, rootPath, t])

  const thinking = Boolean(jobId)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && !thinking ? (
          <p className="pt-8 text-center text-muted-foreground text-sm">{t('workshop.discussion.empty')}</p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6 ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'
              }`}>
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              {message.proposalId ? (
                <Badge variant="secondary" className="mt-1.5">
                  {t('workshop.discussion.proposal_attached')}
                </Badge>
              ) : null}
            </div>
          </div>
        ))}
        {thinking ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('workshop.discussion.thinking')}
          </div>
        ) : null}
      </div>
      {errorMessage ? (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-md bg-error-subtle px-2 py-1.5 text-error-subtle-foreground text-xs">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex items-end gap-2 border-border border-t p-3">
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
        <Button
          type="button"
          size="icon-sm"
          aria-label={t('workshop.discussion.send')}
          disabled={thinking || !draft.trim()}
          onClick={() => void send()}>
          <SendHorizonal className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
