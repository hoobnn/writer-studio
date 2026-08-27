import type { WorkshopEntity } from '@shared/types/workshop'
import { describe, expect, it } from 'vitest'

import { chapterIdFromDiffPath, entityLabel, entitySubtitle } from '../workshopEntityPresenter'

function entity(id: string, data: unknown): WorkshopEntity {
  return {
    schemaVersion: 1,
    id,
    origin: { kind: 'human' },
    updatedAt: '2026-01-01T00:00:00.000Z',
    data
  } as WorkshopEntity
}

describe('workshopEntityPresenter', () => {
  it('entityLabel 组合 fact 的主谓,数据缺失时回退到 id', () => {
    expect(entityLabel('ledger/facts', entity('fact-1', { subject: '林远', predicate: '得到了断剑' }))).toBe(
      '林远 得到了断剑'
    )
    expect(entityLabel('ledger/facts', entity('fact-2', { subject: '  ' }))).toBe('fact-2')
    expect(entityLabel('codex/characters', entity('char-1', {}))).toBe('char-1')
  })

  it('entitySubtitle 组合 states 的章节与生死,缺一时降级不拼分隔符', () => {
    expect(entitySubtitle('ledger/states', entity('s1', { chapterId: 'ch-0003', lifeStatus: 'alive' }))).toBe(
      'ch-0003 · alive'
    )
    expect(entitySubtitle('ledger/states', entity('s2', { chapterId: 'ch-0003' }))).toBe('ch-0003')
    expect(entitySubtitle('outline/volumes', entity('vol-01', { title: '第一卷' }))).toBeUndefined()
  })

  it('chapterIdFromDiffPath 只接受 chapters 目录下的一级 md 文件', () => {
    expect(chapterIdFromDiffPath('chapters/ch-0001.md')).toBe('ch-0001')
    expect(chapterIdFromDiffPath('codex/characters/lin-yuan.json')).toBeUndefined()
    expect(chapterIdFromDiffPath('chapters/sub/ch-0001.md')).toBeUndefined()
  })
})
