import { describe, expect, it } from 'vitest'

import {
  buildWorkshopDiscussionPrompt,
  buildWorkshopGenerationPrompt,
  WORKSHOP_DEFAULT_ROLE_GUIDANCE,
  type WorkshopContextData
} from '../workshopPrompts'

function contextWith(promptOverrides?: WorkshopContextData['promptOverrides']): WorkshopContextData {
  return {
    card: {
      schemaVersion: 1,
      id: 'p1',
      title: '测试',
      genre: '',
      premise: '',
      authorGoal: '',
      volumeOrder: [],
      looseChapterIds: [],
      createdAt: new Date().toISOString()
    },
    entities: [],
    chapterIds: [],
    promptOverrides
  }
}

describe('workshopPrompts 角色指令覆盖', () => {
  it('生成 prompt 采用项目覆盖的人设，未覆盖角色仍用内置默认', () => {
    const context = contextWith({ writer: '你是冷硬派写手。' })
    const custom = buildWorkshopGenerationPrompt({ role: 'writer', instruction: '写', context })
    expect(custom.prompt).toContain('你是冷硬派写手。')
    expect(custom.prompt).not.toContain(WORKSHOP_DEFAULT_ROLE_GUIDANCE.writer)

    const fallback = buildWorkshopGenerationPrompt({ role: 'planner', instruction: '规划', context })
    expect(fallback.prompt).toContain(WORKSHOP_DEFAULT_ROLE_GUIDANCE.planner)
  })

  it('讨论 prompt 同样支持覆盖，且共用 system 不受覆盖影响', () => {
    const custom = buildWorkshopDiscussionPrompt({
      history: [{ role: 'user', content: '聊聊' }],
      context: contextWith({ discussion: '毒舌编辑。' })
    })
    expect(custom.prompt).toContain('毒舌编辑。')
    expect(custom.prompt).not.toContain(WORKSHOP_DEFAULT_ROLE_GUIDANCE.discussion)
    expect(custom.system).toContain('只输出一个符合输出契约的 JSON 对象')
    expect(custom.prompt).toContain('必须把问题放进 questions')

    const fallback = buildWorkshopDiscussionPrompt({ history: [], context: contextWith() })
    expect(fallback.prompt).toContain(WORKSHOP_DEFAULT_ROLE_GUIDANCE.discussion)
  })

  it('讨论历史保留待裁决的问题与选项，供作者回答后的下一回合使用', () => {
    const prompt = buildWorkshopDiscussionPrompt({
      history: [
        {
          role: 'assistant',
          content: '需要你裁决。',
          questions: [
            {
              question: '主角保住什么？',
              options: [{ label: '身份', description: '失去盟友' }, { label: '盟友' }]
            }
          ]
        },
        { role: 'user', content: '身份' }
      ],
      context: contextWith()
    })

    expect(prompt.prompt).toContain('[待作者选择] 主角保住什么？ | 身份 (失去盟友); 盟友')
    expect(prompt.prompt).toContain('[作者] 身份')
  })
})
