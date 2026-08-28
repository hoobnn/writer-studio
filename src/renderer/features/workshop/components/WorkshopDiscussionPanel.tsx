import { Button, EmptyState } from '@cherrystudio/ui'
import { ChatLayoutModeProvider } from '@renderer/components/chat/layout/ChatLayoutModeContext'
import { useMessageListRenderConfig } from '@renderer/components/chat/messages/hooks/useMessageListRenderConfig'
import { useMessagePlatformActions } from '@renderer/components/chat/messages/hooks/useMessagePlatformActions'
import MessageList from '@renderer/components/chat/messages/MessageList'
import { MessageListProvider } from '@renderer/components/chat/messages/MessageListProvider'
import {
  DEFAULT_MESSAGE_LIST_CONFIG,
  type MessageListItem,
  type MessageListProviderValue
} from '@renderer/components/chat/messages/types'
import ComposerSurface from '@renderer/components/composer/ComposerSurface'
import ConversationComposerSlot from '@renderer/components/composer/ConversationComposerSlot'
import { QuestionComposer } from '@renderer/components/composer/variants/AskUserQuestionComposer'
import { QuickPanelProvider } from '@renderer/components/QuickPanel'
import { usePreference } from '@renderer/data/hooks/usePreference'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import type { Topic } from '@renderer/types/topic'
import { getErrorMessage } from '@renderer/utils/error'
import type { ComposerAttachment } from '@renderer/utils/message/composerAttachment'
import type { CherryMessagePart } from '@shared/data/types/message'
import type { WorkshopDiscussionMessage, WorkshopDiscussionQuestion } from '@shared/types/workshop'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkshopJob } from '../hooks/useWorkshopJob'

interface WorkshopDiscussionPanelProps {
  rootPath: string
  /** 助手回合结束后刷新工作区(可能有新提案与正史变化)。 */
  onTurnFinished: () => Promise<void>
  /** 打开消息附带的提案(中栏审阅视图)。 */
  onOpenProposal: (proposalId: string) => void
}

interface WorkshopDiscussionMessagesProps {
  rootPath: string
  messages: WorkshopDiscussionMessage[]
  onOpenProposal: (proposalId: string) => void
}

interface WorkshopDiscussionQuestionComposerProps {
  questions: WorkshopDiscussionQuestion[]
  onAnswer: (content: string) => void | Promise<void>
  onDismiss: () => void
}

export function formatWorkshopDiscussionAnswers(
  questions: WorkshopDiscussionQuestion[],
  answers: Record<string, string>
): string {
  return questions
    .map((question) => answers[question.question])
    .filter((answer): answer is string => Boolean(answer))
    .join('\n')
}

export function WorkshopDiscussionQuestionComposer({
  questions,
  onAnswer,
  onDismiss
}: WorkshopDiscussionQuestionComposerProps) {
  return (
    <QuestionComposer
      questions={questions}
      onSubmit={(answers) => onAnswer(formatWorkshopDiscussionAnswers(questions, answers))}
      onDismiss={onDismiss}
    />
  )
}

export function WorkshopDiscussionMessages({ rootPath, messages, onOpenProposal }: WorkshopDiscussionMessagesProps) {
  const { t } = useTranslation()
  const { renderConfig } = useMessageListRenderConfig()
  const platformActions = useMessagePlatformActions()
  const topicId = `workshop:${rootPath}`
  const topic = useMemo<Topic>(() => {
    const first = messages[0]?.createdAt ?? ''
    const last = messages.at(-1)?.createdAt ?? first
    return {
      id: topicId,
      assistantId: undefined,
      name: t('workshop.discussion.title'),
      lastActivityAt: last,
      createdAt: first,
      updatedAt: last,
      messages: []
    }
  }, [messages, t, topicId])
  const messageItems = useMemo<MessageListItem[]>(() => {
    let precedingUserMessageId: string | undefined
    return messages.map((message) => {
      if (message.role === 'user') precedingUserMessageId = message.id
      return {
        id: message.id,
        role: message.role,
        topicId,
        parentId: message.role === 'assistant' ? precedingUserMessageId : undefined,
        createdAt: message.createdAt,
        status: 'success'
      }
    })
  }, [messages, topicId])
  const partsByMessageId = useMemo<Record<string, CherryMessagePart[]>>(
    () => Object.fromEntries(messages.map((message) => [message.id, [{ type: 'text', text: message.content }]])),
    [messages]
  )
  const messageTails = useMemo(
    () =>
      messages.flatMap((message) =>
        message.proposalId
          ? [
              {
                messageId: message.id,
                content: (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenProposal(message.proposalId!)}>
                    {t('workshop.discussion.view_proposal')}
                  </Button>
                )
              }
            ]
          : []
      ),
    [messages, onOpenProposal, t]
  )
  const value = useMemo<MessageListProviderValue>(
    () => ({
      state: {
        topic,
        messages: messageItems,
        partsByMessageId,
        beforeList:
          messages.length === 0 ? <EmptyState compact description={t('workshop.discussion.empty')} /> : undefined,
        messageTails,
        hasOlder: false,
        messageNavigation: 'none',
        ...DEFAULT_MESSAGE_LIST_CONFIG,
        listKey: topicId,
        renderConfig,
        selection: { enabled: false, isMultiSelectMode: false, selectedMessageIds: [] }
      },
      actions: platformActions,
      meta: { selectionLayer: false }
    }),
    [messageItems, messageTails, messages.length, partsByMessageId, platformActions, renderConfig, t, topic, topicId]
  )

  return (
    <MessageListProvider value={value}>
      <MessageList />
    </MessageListProvider>
  )
}

interface WorkshopDiscussionComposerProps {
  draft: string
  thinking: boolean
  onDraftChange: (draft: string) => void
  onSend: (content: string) => void | Promise<void>
}

export function WorkshopDiscussionComposer({
  draft,
  thinking,
  onDraftChange,
  onSend
}: WorkshopDiscussionComposerProps) {
  const { t } = useTranslation()
  const [enableSpellCheck] = usePreference('app.spell_check.enabled')
  const [fontSize] = usePreference('chat.message.font_size')
  const [, setFiles] = useState<ComposerAttachment[]>([])
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <ComposerSurface
      text={draft}
      onTextChange={onDraftChange}
      tokens={[]}
      managedTokenKinds={[]}
      onTokensChange={() => {}}
      placeholder={t('workshop.discussion.input_placeholder')}
      sendDisabled={thinking || !draft.trim()}
      isLoading={thinking}
      onSendDraft={(nextDraft) => onSend(nextDraft.text)}
      onPause={() => {}}
      supportedExts={[]}
      setFiles={setFiles}
      filesCount={0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      quickPanelEnabled={false}
      enableDragDrop={false}
      enableSpellCheck={enableSpellCheck}
      fontSize={fontSize}
      narrowMode
    />
  )
}

export function WorkshopDiscussionPanel({ rootPath, onTurnFinished, onOpenProposal }: WorkshopDiscussionPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<WorkshopDiscussionMessage[]>([])
  const [draft, setDraft] = useState('')
  const [dismissedQuestionMessageId, setDismissedQuestionMessageId] = useState<string>()

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

  const sendContent = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim()
      if (!content) return
      try {
        const snapshot = await ipcApi.request('workshop.discussion.send', { rootPath, content })
        setDraft('')
        await reload()
        job.start(snapshot.id)
      } catch (error) {
        toast.error({ title: t('workshop.discussion.failed'), description: getErrorMessage(error) })
      }
    },
    [job, reload, rootPath, t]
  )

  const latestMessage = messages.at(-1)
  const composerOverride = useMemo(() => {
    if (
      latestMessage?.role !== 'assistant' ||
      latestMessage.id === dismissedQuestionMessageId ||
      !latestMessage.questions?.length
    ) {
      return undefined
    }
    const questions = latestMessage.questions

    return {
      id: `workshop-question:${latestMessage.id}`,
      priority: 100,
      render: () => (
        <WorkshopDiscussionQuestionComposer
          questions={questions}
          onAnswer={sendContent}
          onDismiss={() => setDismissedQuestionMessageId(latestMessage.id)}
        />
      )
    }
  }, [dismissedQuestionMessageId, latestMessage, sendContent])

  return (
    <QuickPanelProvider>
      <ChatLayoutModeProvider>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <WorkshopDiscussionMessages rootPath={rootPath} messages={messages} onOpenProposal={onOpenProposal} />
          </div>
          {thinking ? (
            <div className="flex items-center gap-1.5 px-6 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t('workshop.discussion.thinking')}
            </div>
          ) : null}
          <ConversationComposerSlot
            composerContext={{ overrides: composerOverride ? [composerOverride] : [] }}
            fallback={
              <WorkshopDiscussionComposer
                draft={draft}
                thinking={thinking}
                onDraftChange={setDraft}
                onSend={sendContent}
              />
            }
          />
        </div>
      </ChatLayoutModeProvider>
    </QuickPanelProvider>
  )
}
