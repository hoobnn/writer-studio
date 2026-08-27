import type { WorkshopCollection } from '@shared/types/workshop'
import type { ComponentType } from 'react'

import { CharacterForm, LoreForm, RuleForm } from './CodexForms'
import { CharacterStateForm, FactForm, ForeshadowingForm, SummaryForm, TimelineEventForm } from './LedgerForms'
import { ChapterPlanForm, OutlineGroupForm } from './OutlineForms'
import type { EntityFormProps } from './types'

type AnyEntityForm = ComponentType<EntityFormProps<unknown>>

// 每集合一个手写薄表单;异构点(嵌套数组/引用/联动)在各表单内部就地处理,
// 不做 schema 驱动引擎(11 个冻结集合撑不起一层解释器抽象)。
// 数据类型与集合的对应由编辑器外壳(经 schema 校验)保证,故此处放宽到 unknown。
export const COLLECTION_FORMS: Record<WorkshopCollection, AnyEntityForm> = {
  'codex/characters': CharacterForm as AnyEntityForm,
  'codex/lore': LoreForm as AnyEntityForm,
  'codex/rules': RuleForm as AnyEntityForm,
  'outline/volumes': OutlineGroupForm as AnyEntityForm,
  'outline/arcs': OutlineGroupForm as AnyEntityForm,
  'outline/chapters': ChapterPlanForm as AnyEntityForm,
  'ledger/facts': FactForm as AnyEntityForm,
  'ledger/foreshadowing': ForeshadowingForm as AnyEntityForm,
  'ledger/summaries': SummaryForm as AnyEntityForm,
  'ledger/states': CharacterStateForm as AnyEntityForm,
  'ledger/events': TimelineEventForm as AnyEntityForm
}
