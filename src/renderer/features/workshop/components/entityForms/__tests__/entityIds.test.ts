import { describe, expect, it } from 'vitest'

import { isEntityIdTaken, slugify, suggestEntityId } from '../entityIds'

describe('entityIds', () => {
  it('slugify 提取拉丁连段,丢弃中文与符号', () => {
    expect(slugify('Lin Yuan')).toBe('lin-yuan')
    expect(slugify('  Lin_Yuan!!42 ')).toBe('lin-yuan-42')
    expect(slugify('林远')).toBe('')
  })

  it('suggestEntityId 优先 slug,冲突或无 slug 时回退到带位宽的前缀序号', () => {
    expect(suggestEntityId('codex/characters', 'Lin Yuan', [])).toBe('lin-yuan')
    // slug 已占用(大小写不敏感)→ 序号回退
    expect(suggestEntityId('codex/characters', 'Lin Yuan', ['Lin-Yuan'])).toBe('char-1')
    // 中文主字段无 slug → 按既有最大序号 +1,章节位宽 4、分卷位宽 2
    expect(suggestEntityId('outline/chapters', '第一章', ['ch-0003', 'ch-0001'])).toBe('ch-0004')
    expect(suggestEntityId('outline/volumes', '', [])).toBe('vol-01')
  })

  it('isEntityIdTaken 大小写不敏感(防大小写不敏感文件系统冲突)', () => {
    expect(isEntityIdTaken('lin-yuan', ['Lin-Yuan'])).toBe(true)
    expect(isEntityIdTaken('lin-yuan', ['lin-yuan-2'])).toBe(false)
  })
})
