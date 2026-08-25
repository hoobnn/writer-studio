import { randomUUID } from 'node:crypto'

import { WRITER_MAX_CONTEXT_BUDGET_CHARS, WriterContextPacketSchema, WriterProjectSchema } from '@shared/types/writer'
import { describe, expect, it } from 'vitest'

import {
  compileWriterContext,
  WRITER_CONTEXT_PRIORITY,
  WRITER_CONTEXT_REQUIRED_CURRENT_RESERVE_CHARS
} from '../writerContext'
import { writerRevision as hashRevision } from '../WriterProjectRepository'
import { serializeWriterPromptSources } from '../writerPromptData'
import { buildWriterGenerationPrompt } from '../writerPrompts'

function fixture() {
  const projectId = randomUUID()
  const chapterId = randomUUID()
  const priorChapterId = randomUUID()
  const now = '2026-08-24T00:00:00.000Z'
  const hugeChapter = `当前章开头${'正文'.repeat(50_000)}当前章结尾`
  const project = WriterProjectSchema.parse({
    rootPath: '/tmp/writer-context-fixture',
    manifest: {
      schemaVersion: 1,
      id: projectId,
      title: '上下文测试',
      createdAt: now,
      updatedAt: now,
      activeChapterId: chapterId,
      chapters: [
        {
          id: priorChapterId,
          title: '前一章',
          fileName: `0001-${priorChapterId}.md`,
          order: 0,
          createdAt: now,
          updatedAt: now,
          revision: hashRevision('前文')
        },
        {
          id: chapterId,
          title: '当前章',
          fileName: `0002-${chapterId}.md`,
          order: 1,
          createdAt: now,
          updatedAt: now,
          revision: hashRevision(hugeChapter)
        }
      ]
    },
    storyBible: {
      schemaVersion: 1,
      genre: '规则悬疑',
      premise: '沈拾被困密室，必须在守卫回来前找到出口。',
      authorGoal: '让因果链可以复核',
      hardRules: ['主角不能知道密室外发生的事'],
      themes: ['信息边界与选择代价'],
      characters: [
        {
          id: randomUUID(),
          name: '沈拾',
          role: '主角',
          description: '只掌握亲眼看到的信息',
          goals: [],
          constraints: []
        }
      ],
      worldRules: ['死亡角色不能无解释复活'],
      styleGuide: ['对白使用短句，叙述保持克制']
    },
    outline: {
      schemaVersion: 1,
      bookSummary: '',
      arcs: [],
      chapterPlans: [{ chapterId, title: '当前章', goal: '找到出口', beats: ['发现门锁'], status: 'planned' }]
    },
    continuity: {
      schemaVersion: 1,
      facts: [
        {
          id: randomUUID(),
          subject: '密室门',
          predicate: '保持上锁',
          detail: '钥匙仍在守卫手中',
          sourceChapterId: priorChapterId
        }
      ],
      foreshadowing: [{ id: randomUUID(), description: '墙缝里有冷风', status: 'open' }],
      chapterSummaries: [{ chapterId: priorChapterId, summary: '沈拾进入密室。', updatedAt: now }]
    },
    documentRevisions: {
      storyBible: '0'.repeat(64),
      outline: '0'.repeat(64),
      continuity: '0'.repeat(64)
    }
  })
  return {
    project,
    currentChapter: { chapter: project.manifest.chapters[1], content: hugeChapter },
    recentChapters: [{ chapter: project.manifest.chapters[0], content: '前文' }]
  }
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

describe('compileWriterContext', () => {
  it('keeps fixed priority order and prevents a huge manuscript from evicting hard rules and canon', () => {
    const input = fixture()
    const packet = compileWriterContext({
      ...input,
      operation: 'continue',
      budgetChars: 30_000,
      now: new Date('2026-08-24T01:00:00.000Z')
    })

    expect(packet.usedChars).toBeLessThanOrEqual(packet.budgetChars)
    expect(packet.truncated).toBe(true)
    expect(packet.sources.find((source) => source.kind === 'hard_rule')?.content).toContain('主角不能知道')
    expect(packet.sources.find((source) => source.kind === 'current_chapter')).toMatchObject({
      priority: WRITER_CONTEXT_PRIORITY.CURRENT_WORK,
      truncated: true
    })
    expect(packet.sources.some((source) => source.kind === 'character')).toBe(true)
    expect(packet.sources.some((source) => source.kind === 'fact')).toBe(true)
    expect(packet.sources.some((source) => source.kind === 'related_history')).toBe(false)
    expect(packet.sources.map((source) => source.priority)).toEqual(
      [...packet.sources.map((source) => source.priority)].sort((a, b) => b - a)
    )
  })

  it('truncates at the global budget without exceeding it', () => {
    const input = fixture()
    input.project.storyBible.authorGoal = '"\n\\'.repeat(100)
    const packet = compileWriterContext({ ...input, operation: 'draft', budgetChars: 300 })
    const serializedSources = serializeWriterPromptSources(packet.sources)

    expect(packet.usedChars).toBeLessThanOrEqual(300)
    expect(serializedSources.length).toBe(packet.usedChars + 2)
    expect(packet.truncated).toBe(true)
    expect(packet.sources[0]).toMatchObject({ kind: 'author_goal', priority: 100 })
  })

  it('caps direct compiler budgets at the production maximum', () => {
    const packet = compileWriterContext({ ...fixture(), operation: 'brainstorm', budgetChars: 1_000_000 })

    expect(packet.budgetChars).toBe(WRITER_MAX_CONTEXT_BUDGET_CHARS)
    expect(packet.usedChars).toBeLessThanOrEqual(WRITER_MAX_CONTEXT_BUDGET_CHARS)
  })

  it('keeps surrogate pairs intact across head, tail, and head-tail source caps', () => {
    const input = fixture()
    input.project.storyBible.premise = `${'a'.repeat(9_999)}😀tail`
    input.currentChapter.content = `😀${'b'.repeat(15_999)}`
    input.recentChapters[0].content = `${'c'.repeat(3_997)}😀${'d'.repeat(10_000)}`

    const packet = compileWriterContext({ ...input, operation: 'continue', budgetChars: 48_000 })
    const cappedSources = packet.sources.filter((source) =>
      ['story_premise', 'current_chapter', 'recent_manuscript'].includes(source.kind)
    )

    expect(cappedSources).toHaveLength(3)
    expect(cappedSources.every((source) => !hasLoneSurrogate(source.content))).toBe(true)
  })

  it('uses a conservative provider-neutral default budget', () => {
    const packet = compileWriterContext({ ...fixture(), operation: 'draft' })

    expect(packet.budgetChars).toBe(8_000)
    expect(packet.usedChars).toBeLessThanOrEqual(8_000)
  })

  it('reserves current chapter tail for continue when a long premise fills the default budget', () => {
    const input = fixture()
    input.project.storyBible.premise = `超长前提${'设定'.repeat(5_000)}`

    const packet = compileWriterContext({ ...input, operation: 'continue' })
    const premise = packet.sources.find((source) => source.kind === 'story_premise')
    const current = packet.sources.find((source) => source.kind === 'current_chapter')

    expect(packet.budgetChars).toBe(8_000)
    expect(packet.usedChars).toBeLessThanOrEqual(packet.budgetChars)
    expect(packet.truncated).toBe(true)
    expect(packet.sources.find((source) => source.kind === 'hard_rule')?.content).toContain('主角不能知道')
    expect(premise?.priority).toBe(WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
    expect(premise?.truncated).toBe(true)
    expect(current?.priority).toBe(WRITER_CONTEXT_PRIORITY.CURRENT_WORK)
    expect(current?.content).toHaveLength(WRITER_CONTEXT_REQUIRED_CURRENT_RESERVE_CHARS)
    expect(current?.content.endsWith('当前章结尾')).toBe(true)
    expect(current?.truncated).toBe(true)
    expect(packet.sources.map((source) => source.priority)).toEqual(
      [...packet.sources.map((source) => source.priority)].sort((a, b) => b - a)
    )
  })

  it('keeps a tail fragment when serialized metadata leaves only a small required-current budget', () => {
    const input = fixture()
    input.project.storyBible.authorGoal = '很长的作者约束'.repeat(100)

    const packet = compileWriterContext({ ...input, operation: 'continue', budgetChars: 300 })
    const current = packet.sources.find((source) => source.kind === 'current_chapter')

    expect(packet.usedChars).toBeLessThanOrEqual(300)
    expect(packet.truncated).toBe(true)
    expect(current?.content.endsWith('当前章结尾')).toBe(true)
    expect(current?.truncated).toBe(true)
  })

  it('charges source metadata and JSON framing against the budget for many tiny project facts', () => {
    const input = fixture()
    const tinyFacts = Array.from({ length: 1_000 }, () => 'x')
    input.project.storyBible.hardRules = tinyFacts
    input.project.storyBible.themes = tinyFacts
    input.project.storyBible.worldRules = tinyFacts
    input.project.storyBible.styleGuide = tinyFacts

    const packet = compileWriterContext({ ...input, operation: 'brainstorm', budgetChars: 8_000 })
    const serializedSources = serializeWriterPromptSources(packet.sources)
    const prompt = buildWriterGenerationPrompt(packet, 'brainstorm')

    expect(packet.usedChars).toBe(serializedSources.length - 2)
    expect(packet.usedChars).toBeLessThanOrEqual(packet.budgetChars)
    expect(serializedSources.length).toBeLessThanOrEqual(packet.budgetChars + 2)
    expect(packet.sources.length).toBeLessThan(100)
    expect(WriterContextPacketSchema.safeParse(packet).success).toBe(true)
    expect(prompt.prompt).toContain(serializedSources)
    expect(prompt.prompt.length).toBeLessThan(12_000)
  })

  it('includes world rules and style guidance as explicit auditable source kinds', () => {
    const input = fixture()
    const packet = compileWriterContext({ ...input, operation: 'review' })

    expect(packet.sources.find((source) => source.kind === 'world_rule')).toMatchObject({
      content: '死亡角色不能无解释复活',
      priority: WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS
    })
    expect(packet.sources.find((source) => source.kind === 'style_guide')).toMatchObject({
      content: '对白使用短句，叙述保持克制',
      priority: WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS
    })
    expect(packet.sources.find((source) => source.kind === 'story_premise')?.content).toContain('沈拾被困密室')
    expect(packet.sources.find((source) => source.kind === 'genre')?.content).toBe('规则悬疑')
    expect(packet.sources.find((source) => source.kind === 'theme')?.content).toBe('信息边界与选择代价')
  })

  it('activates only relevant lore entries and records the activation reason', () => {
    const input = fixture()
    input.project.storyBible.loreEntries.push(
      {
        id: 'brass-key',
        title: '黄铜钥匙',
        content: '黄铜钥匙只能打开塔顶观星室。',
        keys: ['黄铜钥匙'],
        enabled: true,
        alwaysActive: false,
        caseSensitive: false,
        matchWholeWords: false,
        order: 200
      },
      {
        id: 'moon-law',
        title: '月相法则',
        content: '满月时所有誓言都会留下可见印记。',
        keys: [],
        enabled: true,
        alwaysActive: true,
        caseSensitive: false,
        matchWholeWords: false,
        order: 100
      },
      {
        id: 'irrelevant-dragon',
        title: '远方巨龙',
        content: '巨龙正在大陆另一端沉睡。',
        keys: ['巨龙'],
        enabled: true,
        alwaysActive: false,
        caseSensitive: false,
        matchWholeWords: false,
        order: 300
      }
    )

    const packet = compileWriterContext({
      ...input,
      instruction: '本章要让沈拾发现黄铜钥匙。',
      operation: 'continue',
      budgetChars: 40_000
    })
    const loreSources = packet.sources.filter((source) => source.kind === 'lore')

    expect(loreSources).toHaveLength(2)
    expect(loreSources[0]).toMatchObject({
      label: 'Lore: 黄铜钥匙 (matched: 黄铜钥匙)',
      content: '黄铜钥匙只能打开塔顶观星室。',
      priority: WRITER_CONTEXT_PRIORITY.CANON
    })
    expect(loreSources[1].label).toBe('Lore: 月相法则 (always active)')
    expect(packet.sources.map((source) => source.content).join('\n')).not.toContain('巨龙正在')
    expect(packet.loreActivations).toEqual([
      expect.objectContaining({ entryId: 'brass-key', status: 'included', matchedKeys: ['黄铜钥匙'] }),
      expect.objectContaining({ entryId: 'moon-law', status: 'included', activation: 'always' })
    ])
  })

  it('keeps a dropped receipt when an activated lore entry does not fit the context budget', () => {
    const input = fixture()
    input.project.storyBible.loreEntries.push({
      id: 'always-too-late',
      title: '始终生效但预算不足',
      content: '这条知识会被激活，但在当前极小预算中无法入选。',
      keys: [],
      enabled: true,
      alwaysActive: true,
      caseSensitive: false,
      matchWholeWords: false,
      order: 100
    })

    const packet = compileWriterContext({ ...input, operation: 'continue', budgetChars: 10 })

    expect(packet.sources.some((source) => source.kind === 'lore')).toBe(false)
    expect(packet.loreActivations).toEqual([
      expect.objectContaining({ entryId: 'always-too-late', status: 'dropped', activation: 'always' })
    ])
  })

  it('keeps the current ending for continue and both ends for recent manuscript truncation', () => {
    const input = fixture()
    input.recentChapters[0].content = `前章开头${'经过'.repeat(10_000)}前章结尾`

    const packet = compileWriterContext({ ...input, operation: 'continue', budgetChars: 40_000 })
    const current = packet.sources.find((source) => source.kind === 'current_chapter')
    const recent = packet.sources.find((source) => source.kind === 'recent_manuscript')

    expect(current?.content).not.toContain('当前章开头')
    expect(current?.content.endsWith('当前章结尾')).toBe(true)
    expect(recent?.content.startsWith('前章开头')).toBe(true)
    expect(recent?.content.endsWith('前章结尾')).toBe(true)
    expect(current?.truncated).toBe(true)
    expect(recent?.truncated).toBe(true)
  })

  it('does not inject summaries, facts, or foreshadowing first learned in a future chapter', () => {
    const input = fixture()
    const futureChapterId = randomUUID()
    input.project.manifest.chapters.push({
      id: futureChapterId,
      title: '未来章',
      fileName: `0003-${futureChapterId}.md`,
      order: 2,
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
      revision: hashRevision('未来正文')
    })
    input.project.continuity.chapterSummaries.push({
      chapterId: futureChapterId,
      summary: '未来章才揭示幕后真凶。',
      updatedAt: '2026-08-24T00:00:00.000Z'
    })
    input.project.continuity.facts.push({
      id: randomUUID(),
      subject: '幕后真凶',
      predicate: '是守卫',
      detail: '这个身份在未来章才确认',
      sourceChapterId: futureChapterId
    })
    input.project.continuity.foreshadowing.push({
      id: randomUUID(),
      description: '未来章才种下的第二把钥匙',
      plantedChapterId: futureChapterId,
      status: 'open'
    })

    const packet = compileWriterContext({ ...input, operation: 'draft', budgetChars: 40_000 })
    const allContext = packet.sources.map((source) => source.content).join('\n')

    expect(allContext).not.toContain('未来章才揭示幕后真凶')
    expect(allContext).not.toContain('这个身份在未来章才确认')
    expect(allContext).not.toContain('未来章才种下的第二把钥匙')
    expect(allContext).toContain('钥匙仍在守卫手中')
  })
})
