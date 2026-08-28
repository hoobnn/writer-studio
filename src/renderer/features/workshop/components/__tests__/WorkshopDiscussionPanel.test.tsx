import type { MessageListItem } from '@renderer/components/chat/messages/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  WorkshopDiscussionComposer,
  WorkshopDiscussionMessages,
  WorkshopDiscussionQuestionComposer
} from '../WorkshopDiscussionPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'zh-CN' } })
}))

vi.mock('@renderer/components/chat/messages/list/MessageVirtualList', () => ({
  MESSAGE_VIRTUAL_LIST_DEFAULT_BOTTOM_PADDING_PX: 6,
  MESSAGE_VIRTUAL_LIST_DEFAULT_TOP_PADDING_PX: 6,
  MessageVirtualList: ({
    items,
    renderItem
  }: {
    items: [string, MessageListItem[]][]
    renderItem: (item: [string, MessageListItem[]], index: number) => ReactNode
  }) => (
    <div>
      {items.map((item, index) => (
        <div key={item[0]}>{renderItem(item, index)}</div>
      ))}
    </div>
  )
}))

describe('WorkshopDiscussionMessages', () => {
  it('把助手给出的 Markdown 选项交给原聊天消息渲染器', async () => {
    const view = render(
      <WorkshopDiscussionMessages
        rootPath="/project"
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: ['可以沿两条路推进：', '', '1. 保住身份，但失去盟友', '2. 公开真相，同时暴露弱点'].join('\n'),
            createdAt: '2026-08-27T00:00:00.000Z'
          }
        ]}
        onOpenProposal={() => {}}
      />
    )

    expect(await screen.findByText(/保住身份，但失去盟友/)).toHaveTextContent('2. 公开真相，同时暴露弱点')
    expect(view.container.querySelector('[data-ui~="chat.animated-block"]')).toBeInTheDocument()
  })

  it('在共享消息列表中保留每条提案的打开入口', async () => {
    const user = userEvent.setup()
    const onOpenProposal = vi.fn()
    render(
      <WorkshopDiscussionMessages
        rootPath="/project"
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '第一份方案',
            createdAt: '2026-08-27T00:00:00.000Z',
            proposalId: 'proposal-1'
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '第二份方案',
            createdAt: '2026-08-27T00:01:00.000Z',
            proposalId: 'proposal-2'
          }
        ]}
        onOpenProposal={onOpenProposal}
      />
    )

    const buttons = await screen.findAllByRole('button', { name: 'workshop.discussion.view_proposal' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[0])
    await user.click(buttons[1])
    expect(onOpenProposal.mock.calls).toEqual([['proposal-1'], ['proposal-2']])
  })

  it('复用原聊天选项面板并把点击结果作为作者回答提交', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(
      <WorkshopDiscussionQuestionComposer
        questions={[
          {
            question: '主角要保住哪一样？',
            header: '核心代价',
            options: [
              { label: '身份', description: '失去盟友' },
              { label: '盟友', description: '暴露身份' }
            ],
            multiSelect: false
          }
        ]}
        onAnswer={onAnswer}
        onDismiss={() => {}}
      />
    )

    await user.click(screen.getByRole('button', { name: /^1\s*身份\s*失去盟友$/ }))
    expect(onAnswer).toHaveBeenCalledWith('身份')
  })

  it('使用共享 Composer 提交当前草稿', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(undefined)
    const onDraftChange = vi.fn()
    render(
      <WorkshopDiscussionComposer draft="继续这一章" thinking={false} onDraftChange={onDraftChange} onSend={onSend} />
    )

    await user.click(screen.getByRole('button', { name: 'chat.input.send' }))
    expect(onSend).toHaveBeenCalledWith('继续这一章')
  })
})
