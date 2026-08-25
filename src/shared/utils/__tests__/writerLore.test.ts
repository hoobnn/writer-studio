import { type WriterLoreEntry, WriterLoreEntrySchema, WriterStoryBibleSchema } from '@shared/types/writer'
import { describe, expect, it } from 'vitest'

import {
  buildWriterLoreScanText,
  formatWriterChapterPlanContext,
  selectActiveWriterLoreEntries,
  writerLoreKeyMatches
} from '../writerLore'

function loreEntry(id: string, overrides: Partial<WriterLoreEntry> = {}) {
  return WriterLoreEntrySchema.parse({
    id,
    title: id,
    content: `${id} content`,
    keys: [id],
    ...overrides
  })
}

describe('writer lore activation', () => {
  it('matches Unicode-normalized keys without case sensitivity by default', () => {
    const entry = loreEntry('alice', { keys: ['Alice'] })

    const activated = selectActiveWriterLoreEntries([entry], 'ＡＬＩＣＥ entered the archive.')

    expect(activated).toHaveLength(1)
    expect(activated[0]).toMatchObject({ activation: 'keyword', matchedKeys: ['Alice'] })
  })

  it('supports optional whole-word and case-sensitive matching', () => {
    expect(writerLoreKeyMatches('the king arrived', 'king', { caseSensitive: false, matchWholeWords: true })).toBe(true)
    expect(writerLoreKeyMatches('liking', 'king', { caseSensitive: false, matchWholeWords: true })).toBe(false)
    expect(writerLoreKeyMatches('King', 'king', { caseSensitive: true, matchWholeWords: false })).toBe(false)
    expect(writerLoreKeyMatches('黄铜钥匙藏在门后', '黄铜钥匙', { caseSensitive: false, matchWholeWords: true })).toBe(
      true
    )
  })

  it('keeps always-active entries, excludes disabled entries, and sorts by order', () => {
    const low = loreEntry('low', { alwaysActive: true, keys: [], order: 10 })
    const high = loreEntry('high', { alwaysActive: true, keys: [], order: 500 })
    const disabled = loreEntry('disabled', { alwaysActive: true, enabled: false, order: 1_000 })

    expect(selectActiveWriterLoreEntries([low, disabled, high], '')).toEqual([
      expect.objectContaining({ entry: high, activation: 'always' }),
      expect.objectContaining({ entry: low, activation: 'always' })
    ])
  })

  it('uses the current ending for continuation scans and includes plan and instruction', () => {
    const scanText = buildWriterLoreScanText({
      currentContent: `opening-${'x'.repeat(30_000)}-ending`,
      chapterPlan: 'visit the observatory',
      instruction: 'mention the brass key',
      operation: 'continue'
    })

    expect(scanText).not.toContain('opening-')
    expect(scanText).toContain('-ending')
    expect(scanText).toContain('visit the observatory')
    expect(scanText).toContain('mention the brass key')
  })

  it('formats chapter plans identically for main context and renderer activation previews', () => {
    expect(formatWriterChapterPlanContext({ goal: 'Open the gate', beats: ['Find the key', 'Pay the price'] })).toBe(
      'Open the gate\n1. Find the key\n2. Pay the price'
    )
  })
})

describe('WriterStoryBibleSchema aggregate invariants', () => {
  const baseStoryBible = {
    schemaVersion: 1 as const,
    genre: '',
    premise: '',
    authorGoal: '',
    hardRules: [],
    themes: [],
    characters: [],
    worldRules: [],
    styleGuide: []
  }

  it('rejects duplicate lore ids and entries without an activation rule', () => {
    const duplicate = loreEntry('duplicate')
    expect(WriterStoryBibleSchema.safeParse({ ...baseStoryBible, loreEntries: [duplicate, duplicate] }).success).toBe(
      false
    )
    expect(
      WriterStoryBibleSchema.safeParse({
        ...baseStoryBible,
        loreEntries: [loreEntry('inactive', { keys: [], alwaysActive: false })]
      }).success
    ).toBe(false)
  })

  it('accepts key-driven and always-active lore entries', () => {
    expect(
      WriterStoryBibleSchema.safeParse({
        ...baseStoryBible,
        loreEntries: [loreEntry('keyed'), loreEntry('always', { keys: [], alwaysActive: true })]
      }).success
    ).toBe(true)
  })

  it('rejects duplicate character ids', () => {
    expect(
      WriterStoryBibleSchema.safeParse({
        ...baseStoryBible,
        characters: [
          { id: 'alice', name: 'Alice' },
          { id: 'alice', name: 'Another Alice' }
        ],
        loreEntries: []
      }).success
    ).toBe(false)
  })
})
