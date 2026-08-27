import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'

export interface EntityDraftApi<T> {
  draft: T
  baseline: T
  setDraft: (next: T) => void
  update: (patch: Partial<T>) => void
  dirty: boolean
  /** 字段路径(如 relationships.0.characterId)→ 本地化错误;保存尝试之后才点亮。 */
  errors: Record<string, string>
  /** 无法归位到已知字段的错误,渲染为表单顶部横幅。 */
  formErrors: string[]
  /** 校验并返回归一化数据(default/trim 已应用);失败返回 undefined 并点亮内联错误。 */
  validate: () => T | undefined
  /** 保存成功后以提交的数据为新基线。 */
  markPristine: (data: T) => void
}

type Translate = (key: string, options?: Record<string, unknown>) => string

interface DraftIssue {
  code?: string
  message: string
  path: PropertyKey[]
  origin?: string
  maximum?: number | bigint
}

/** 常见 zod issue 的本地化;未覆盖的保留原始消息兜底。 */
export function translateIssue(issue: DraftIssue, t: Translate): string {
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') return t('workshop.entity_form.error_required')
      return issue.message
    case 'too_big':
      return t('workshop.entity_form.error_too_long', { max: String(issue.maximum ?? '') })
    case 'invalid_format':
      return t('workshop.entity_form.error_invalid_id')
    case 'invalid_type':
      return t('workshop.entity_form.error_required')
    default:
      return issue.message
  }
}

/**
 * 结构化实体草稿:baseline 经 schema 归一化(补 default),dirty 用序列化比较,
 * 校验时机为"保存后才点亮"(reward early, punish late)。
 */
export function useEntityDraft<T>(schema: z.ZodType<T>, initialData: unknown): EntityDraftApi<T> {
  const { t } = useTranslation()
  const normalize = useCallback(
    (value: unknown): T => {
      const result = schema.safeParse(value)
      // 创建态种子含空必填项,解析不过时按原样使用(种子已带全量键)。
      return result.success ? result.data : (value as T)
    },
    [schema]
  )
  const [baseline, setBaseline] = useState<T>(() => normalize(initialData))
  const [draft, setDraft] = useState<T>(baseline)
  const [submitted, setSubmitted] = useState(false)

  const issues = useMemo(
    () => (submitted ? (schema.safeParse(draft).error?.issues ?? []) : []),
    [draft, schema, submitted]
  )
  const { errors, formErrors } = useMemo(() => {
    const fieldErrors: Record<string, string> = {}
    const looseErrors: string[] = []
    for (const issue of issues) {
      const path = issue.path.join('.')
      const message = translateIssue(issue, t)
      if (path) fieldErrors[path] = fieldErrors[path] ?? message
      else looseErrors.push(message)
    }
    return { errors: fieldErrors, formErrors: looseErrors }
  }, [issues, t])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [baseline, draft])

  const update = useCallback((patch: Partial<T>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const validate = useCallback((): T | undefined => {
    setSubmitted(true)
    const result = schema.safeParse(draft)
    return result.success ? result.data : undefined
  }, [draft, schema])

  const markPristine = useCallback((data: T) => {
    setBaseline(data)
    setDraft(data)
    setSubmitted(false)
  }, [])

  return { draft, baseline, setDraft, update, dirty, errors, formErrors, validate, markPristine }
}
