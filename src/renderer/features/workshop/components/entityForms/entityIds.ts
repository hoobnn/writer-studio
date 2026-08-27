import type { WorkshopCollection } from '@shared/types/workshop'

/** 集合的 id 前缀与序号位宽(与主进程既有约定一致:ch-0001、vol-01)。 */
const ID_RULES: Record<WorkshopCollection, { prefix: string; pad: number }> = {
  'codex/characters': { prefix: 'char', pad: 0 },
  'codex/lore': { prefix: 'lore', pad: 0 },
  'codex/rules': { prefix: 'rule', pad: 0 },
  'outline/volumes': { prefix: 'vol', pad: 2 },
  'outline/arcs': { prefix: 'arc', pad: 2 },
  'outline/chapters': { prefix: 'ch', pad: 4 },
  'ledger/facts': { prefix: 'fact', pad: 0 },
  'ledger/foreshadowing': { prefix: 'fsh', pad: 0 },
  'ledger/summaries': { prefix: 'sum', pad: 0 },
  'ledger/states': { prefix: 'state', pad: 0 },
  'ledger/events': { prefix: 'event', pad: 0 }
}

/** 拉丁字母/数字连段转短横线小写 slug;非拉丁字符(如中文)丢弃。 */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.join('-') ?? ''
  )
}

function nextSequentialId(collection: WorkshopCollection, existingIds: string[]): string {
  const { prefix, pad } = ID_RULES[collection]
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  const numbers = existingIds
    .map((id) => pattern.exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `${prefix}-${String(next).padStart(pad, '0')}`
}

/** 依据主字段文本建议实体 id:slug 合法且未占用则用 slug,否则回退到前缀+序号。 */
export function suggestEntityId(collection: WorkshopCollection, primaryText: string, existingIds: string[]): string {
  const slug = slugify(primaryText)
  const taken = new Set(existingIds.map((id) => id.toLowerCase()))
  if (slug && !taken.has(slug)) return slug
  return nextSequentialId(collection, existingIds)
}

/** 集合内唯一性检查;大小写不敏感,防 APFS 等大小写不敏感文件系统冲突。 */
export function isEntityIdTaken(candidate: string, existingIds: string[]): boolean {
  const normalized = candidate.toLowerCase()
  return existingIds.some((id) => id.toLowerCase() === normalized)
}
