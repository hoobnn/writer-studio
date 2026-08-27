import { Badge, Button, ConfirmDialog, Scrollbar, SegmentedControl, Textarea } from '@cherrystudio/ui'
import { useCommandHandler } from '@renderer/hooks/command'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WorkshopCollection, WorkshopEntity } from '@shared/types/workshop'
import { WORKSHOP_COLLECTION_DATA_SCHEMAS, WorkshopIdSchema } from '@shared/types/workshop'
import { Play, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkshopBusyApi } from '../hooks/useWorkshopBusy'
import { isEntityIdTaken, suggestEntityId } from './entityForms/entityIds'
import type { ReferenceOption } from './entityForms/fields'
import { ReferenceField, TextField } from './entityForms/fields'
import { COLLECTION_FORMS } from './entityForms/registry'
import { emptyDataFor } from './entityForms/seeds'
import type { WorkshopReferenceOptions } from './entityForms/types'
import { useEntityDraft } from './entityForms/useEntityDraft'

interface WorkshopEntityEditorProps {
  rootPath: string
  collection: WorkshopCollection
  /** 编辑态的实体;创建态为 undefined。 */
  entity?: WorkshopEntity
  busy: WorkshopBusyApi['busy']
  run: WorkshopBusyApi['run']
  refs: WorkshopReferenceOptions
  /** 集合内既有 id,用于创建态的唯一性校验与建议。 */
  existingIds: string[]
  /** summaries 创建态的候选章节(id 即 chapterId,只列尚无摘要的章节)。 */
  summaryChapterOptions?: ReferenceOption[]
  registerDirtyCheck: (check: () => boolean) => () => void
  onOpenVolumeRun: (volumeId: string) => void
  onCreated: (id: string) => void
  onDeleted: () => void
  onMutated: () => Promise<void>
}

function primaryTextOf(draft: unknown): string {
  const data = draft as Record<string, unknown> | null | undefined
  for (const key of ['name', 'title', 'label', 'subject', 'description', 'text']) {
    const value = data?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

export function WorkshopEntityEditor({
  rootPath,
  collection,
  entity,
  busy,
  run,
  refs,
  existingIds,
  summaryChapterOptions,
  registerDirtyCheck,
  onOpenVolumeRun,
  onCreated,
  onDeleted,
  onMutated
}: WorkshopEntityEditorProps) {
  const { t } = useTranslation()
  const creating = !entity
  const schema = WORKSHOP_COLLECTION_DATA_SCHEMAS[collection]
  const draftApi = useEntityDraft<unknown>(schema, entity?.data ?? emptyDataFor(collection))
  const { draft, baseline, dirty: formDirty } = draftApi

  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [jsonDraft, setJsonDraft] = useState('')
  const [bannerError, setBannerError] = useState('')
  const [idValue, setIdValue] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [idError, setIdError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const serializedBaseline = useMemo(() => JSON.stringify(baseline, null, 2), [baseline])
  const dirty = mode === 'json' ? jsonDraft !== serializedBaseline : formDirty

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => registerDirtyCheck(() => dirtyRef.current), [registerDirtyCheck])

  // 外部刷新(提案应用/回滚)带来新数据:草稿未动则采纳,已动则保留(保存时覆盖)。
  const externalSerialized = entity ? JSON.stringify(entity.data) : undefined
  const adoptedRef = useRef(externalSerialized)
  useEffect(() => {
    if (creating || externalSerialized === adoptedRef.current) return
    adoptedRef.current = externalSerialized
    if (dirtyRef.current) return
    const parsed = schema.safeParse(entity?.data)
    const next = parsed.success ? parsed.data : entity?.data
    draftApi.markPristine(next)
    if (mode === 'json') setJsonDraft(JSON.stringify(next, null, 2))
  }, [creating, draftApi, entity?.data, externalSerialized, mode, schema])

  // 创建态:主字段变化时联动建议 id,作者手改过则不再打扰。
  const primaryText = creating ? primaryTextOf(draft) : ''
  useEffect(() => {
    if (!creating || idTouched || collection === 'ledger/summaries') return
    setIdValue(suggestEntityId(collection, primaryText, existingIds))
  }, [collection, creating, existingIds, idTouched, primaryText])

  const switchMode = (next: 'form' | 'json') => {
    setBannerError('')
    if (next === mode) return
    if (next === 'json') {
      setJsonDraft(JSON.stringify(draft, null, 2))
      setMode('json')
      return
    }
    // JSON → 表单:解析且过 schema 才放行,失败阻止切换避免静默丢内容。
    try {
      const parsed = schema.safeParse(JSON.parse(jsonDraft))
      if (!parsed.success) {
        setBannerError(t('workshop.entity.json_invalid_switch'))
        return
      }
      draftApi.setDraft(parsed.data)
      setMode('form')
    } catch (error) {
      setBannerError(formatErrorMessageWithPrefix(error, t('workshop.entity.invalid_json')))
    }
  }

  const saving = Boolean(creating ? busy.create : busy.entitySave)

  const save = async () => {
    setBannerError('')
    setIdError(undefined)

    let data: unknown
    if (mode === 'json') {
      try {
        const parsed = schema.safeParse(JSON.parse(jsonDraft))
        if (!parsed.success) {
          setBannerError(
            `${t('workshop.entity.invalid_data')}: ${parsed.error.issues
              .slice(0, 5)
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`
          )
          return
        }
        data = parsed.data
      } catch (error) {
        setBannerError(formatErrorMessageWithPrefix(error, t('workshop.entity.invalid_json')))
        return
      }
    } else {
      data = draftApi.validate()
      if (data === undefined) return
    }

    const id = creating ? idValue : (entity?.id ?? '')
    if (creating) {
      if (!WorkshopIdSchema.safeParse(id).success) {
        setIdError(t('workshop.entity_form.error_invalid_id'))
        return
      }
      if (isEntityIdTaken(id, existingIds)) {
        setIdError(t('workshop.entity.id_taken'))
        return
      }
    }

    const ok = await run(
      creating ? 'create' : 'entitySave',
      creating ? 'workshop.errors.create_entity' : 'workshop.errors.save_entity',
      async () => {
        await ipcApi.request('workshop.canon.commit', {
          rootPath,
          title: t(creating ? 'workshop.commit.create_entity' : 'workshop.commit.save_entity', { id }),
          changes: [
            {
              op: 'write_entity',
              collection,
              id,
              entity: {
                schemaVersion: 1,
                id,
                origin: { kind: 'human' as const },
                updatedAt: new Date().toISOString(),
                data
              }
            }
          ]
        })
        draftApi.markPristine(data)
        if (mode === 'json') setJsonDraft(JSON.stringify(data, null, 2))
        await onMutated()
      }
    )
    if (!ok) return
    if (creating) onCreated(id)
    else toast.success(t('common.saved'))
  }

  const remove = async () => {
    if (!entity) return
    const ok = await run('entitySave', 'workshop.errors.delete_entity', async () => {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.delete_entity', { id: entity.id }),
        changes: [{ op: 'delete_entity', collection, id: entity.id }]
      })
      // 视图即将关闭,基线归位避免脏守卫误拦。
      draftApi.markPristine(baseline)
      await onMutated()
    })
    if (ok) onDeleted()
  }

  const discard = () => {
    setBannerError('')
    draftApi.setDraft(baseline)
    if (mode === 'json') setJsonDraft(serializedBaseline)
  }

  useCommandHandler('workshop.save', () => void save(), { enabled: dirty && !saving })

  const FormComponent = COLLECTION_FORMS[collection]

  return (
    <Scrollbar className="min-h-0 flex-1 p-4" data-ui="workshop.entity-editor">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 truncate font-medium text-base">
          {creating
            ? t('workshop.entity.create_title', {
                collection: t(`workshop.collections.${collection.replace('/', '_')}`)
              })
            : entity.id}
        </h2>
        {entity ? (
          <Badge variant="outline">
            {entity.origin.kind === 'human' ? t('workshop.entity.origin_human') : t('workshop.entity.origin_ai')}
          </Badge>
        ) : null}
        <div className="flex-1" />
        <SegmentedControl<'form' | 'json'>
          size="sm"
          aria-label={t('workshop.entity.mode_form')}
          value={mode}
          onValueChange={switchMode}
          options={[
            { value: 'form', label: t('workshop.entity.mode_form') },
            { value: 'json', label: t('workshop.entity.mode_json') }
          ]}
        />
        {collection === 'outline/volumes' && entity ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenVolumeRun(entity.id)}>
            <Play className="size-3.5" aria-hidden />
            {t('workshop.volume.title')}
          </Button>
        ) : null}
        {entity ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('workshop.entity.delete')}
            disabled={saving}
            onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
        {dirty ? (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={discard}>
            {t('workshop.entity.discard_changes')}
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={!dirty && !creating} loading={saving} onClick={() => void save()}>
          {t('workshop.editor.save')}
        </Button>
      </div>

      {creating ? (
        <div className="mb-4">
          {collection === 'ledger/summaries' ? (
            <ReferenceField
              label={t('workshop.entity.summary_chapter_label')}
              value={idValue || undefined}
              options={summaryChapterOptions ?? []}
              error={idError}
              disabled={saving}
              onChange={(next) => {
                setIdTouched(true)
                setIdValue(next ?? '')
              }}
            />
          ) : (
            <TextField
              label={t('workshop.entity.id_label')}
              value={idValue}
              hint={t('workshop.entity.id_hint')}
              error={idError}
              disabled={saving}
              onChange={(next) => {
                setIdTouched(true)
                setIdValue(next)
              }}
            />
          )}
        </div>
      ) : null}

      {bannerError || draftApi.formErrors.length > 0 ? (
        <p role="alert" className="mb-3 rounded-md bg-error-subtle px-3 py-2 text-error-subtle-foreground text-sm">
          {[bannerError, ...draftApi.formErrors].filter(Boolean).join('; ')}
        </p>
      ) : null}

      {mode === 'form' ? (
        <FormComponent
          data={draft}
          errors={draftApi.errors}
          disabled={saving}
          refs={refs}
          entityId={entity?.id ?? (collection === 'ledger/summaries' ? idValue || undefined : undefined)}
          onChange={draftApi.setDraft}
        />
      ) : (
        <Textarea.Input
          value={jsonDraft}
          onChange={(event) => setJsonDraft(event.target.value)}
          className="min-h-96 w-full resize-y font-mono text-sm leading-6"
          spellCheck={false}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('workshop.entity.delete_confirm_title')}
        description={t('workshop.entity.delete_confirm_description')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={() => void remove()}
      />
    </Scrollbar>
  )
}
