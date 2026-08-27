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

    const fallback = buildWorkshopDiscussionPrompt({ history: [], context: contextWith() })
    expect(fallback.prompt).toContain(WORKSHOP_DEFAULT_ROLE_GUIDANCE.discussion)
  })
})
