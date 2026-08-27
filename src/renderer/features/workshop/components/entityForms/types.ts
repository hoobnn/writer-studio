import type { ReferenceOption } from './fields'

/** 由工作区从实体索引构造并下传的引用选项集。 */
export interface WorkshopReferenceOptions {
  chapters: ReferenceOption[]
  characters: ReferenceOption[]
  /** 章计划里声明的 requirements(供章节摘要的评估项引用)。 */
  requirementsForChapter: (chapterId: string) => ReferenceOption[]
}

export interface EntityFormProps<T> {
  data: T
  /** 字段路径(如 relationships.0.characterId)→ 本地化错误。 */
  errors: Record<string, string>
  disabled: boolean
  refs: WorkshopReferenceOptions
  /** 编辑态的实体 id;创建态为 undefined。summaries 表单依赖它(id 即 chapterId)。 */
  entityId?: string
  onChange: (data: T) => void
}
