// 实体列表展示与 diff 路径解析的纯函数,与组件解耦便于单测。
import type { WorkshopCollection, WorkshopEntity } from '@shared/types/workshop'

function pickString(data: Record<string, unknown> | null | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

/** 从实体 data 中挑出适合列表展示的名称;数据缺失时回退到实体 id。 */
export function entityLabel(collection: WorkshopCollection, entity: WorkshopEntity): string {
  const data = entity.data as Record<string, unknown> | null | undefined
  switch (collection) {
    case 'codex/characters':
      return pickString(data, 'name') ?? entity.id
    case 'codex/rules':
      return pickString(data, 'text') ?? entity.id
    case 'ledger/facts': {
      const subject = pickString(data, 'subject')
      const predicate = pickString(data, 'predicate')
      return subject && predicate ? `${subject} ${predicate}` : (subject ?? entity.id)
    }
    case 'ledger/foreshadowing':
      return pickString(data, 'description') ?? entity.id
    case 'ledger/summaries':
      return pickString(data, 'summary') ?? entity.id
    case 'ledger/events':
      return pickString(data, 'label') ?? entity.id
    case 'ledger/states':
      return pickString(data, 'characterId') ?? entity.id
    default:
      return pickString(data, 'title') ?? entity.id
  }
}

/** 列表项二级信息;无有意义的次级字段时返回 undefined(组件回退到 entity.id)。 */
export function entitySubtitle(collection: WorkshopCollection, entity: WorkshopEntity): string | undefined {
  const data = entity.data as Record<string, unknown> | null | undefined
  switch (collection) {
    case 'codex/characters':
      return pickString(data, 'role')
    case 'codex/rules':
      return pickString(data, 'kind')
    case 'codex/lore': {
      const keys = data?.keys
      return Array.isArray(keys) && keys.length > 0 ? keys.filter((k) => typeof k === 'string').join(' · ') : undefined
    }
    case 'outline/chapters':
      return pickString(data, 'status')
    case 'ledger/facts':
      return pickString(data, 'sourceChapterId')
    case 'ledger/foreshadowing':
      return pickString(data, 'status')
    case 'ledger/states': {
      const chapter = pickString(data, 'chapterId')
      const life = pickString(data, 'lifeStatus')
      return chapter && life ? `${chapter} · ${life}` : (chapter ?? life)
    }
    case 'ledger/events':
      return pickString(data, 'chapterId')
    default:
      return undefined
  }
}

/** 从提案 diff 的文件路径推导章节 id(如 chapters/ch-0001.md → ch-0001)。 */
export function chapterIdFromDiffPath(filepath: string): string | undefined {
  return /^chapters\/([^/]+)\.md$/.exec(filepath)?.[1]
}
