import { Badge, Button, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WorkshopCollection, WorkshopEntity } from '@shared/types/workshop'
import { workshopEntitySchemaFor } from '@shared/types/workshop'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WorkshopVolumeRunPanel } from './WorkshopVolumeRunPanel'

interface WorkshopEntityEditorProps {
  rootPath: string
  collection: WorkshopCollection
  entity: WorkshopEntity
  busy: boolean
  onMutate: (errorKey: string, action: () => Promise<void>) => Promise<void>
  onRefresh: () => Promise<void>
}

export function WorkshopEntityEditor({
  rootPath,
  collection,
  entity,
  busy,
  onMutate,
  onRefresh
}: WorkshopEntityEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    setDraft(JSON.stringify(entity.data, null, 2))
    setValidationError('')
  }, [entity])

  const save = () => {
    setValidationError('')
    let data: unknown
    try {
      data = JSON.parse(draft)
    } catch (error) {
      setValidationError(formatErrorMessageWithPrefix(error, t('workshop.entity.invalid_json')))
      return
    }
    const candidate = {
      schemaVersion: 1,
      id: entity.id,
      origin: { kind: 'human' as const },
      updatedAt: new Date().toISOString(),
      data
    }
    const parsed = workshopEntitySchemaFor(collection).safeParse(candidate)
    if (!parsed.success) {
      setValidationError(
        `${t('workshop.entity.invalid_data')}: ${parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`
      )
      return
    }
    void onMutate('workshop.errors.save_entity', async () => {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.save_entity', { id: entity.id }),
        changes: [{ op: 'write_entity', collection, id: entity.id, entity: parsed.data }]
      })
    })
  }

  const dirty = draft !== JSON.stringify(entity.data, null, 2)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-medium text-base">{entity.id}</h2>
        <Badge variant="outline">
          {entity.origin.kind === 'human' ? t('workshop.entity.origin_human') : t('workshop.entity.origin_ai')}
        </Badge>
        <div className="flex-1" />
        <Button type="button" size="sm" disabled={!dirty} loading={busy} onClick={save}>
          {t('workshop.editor.save')}
        </Button>
      </div>
      {collection === 'outline/volumes' ? (
        <WorkshopVolumeRunPanel rootPath={rootPath} volumeId={entity.id} onFinished={onRefresh} />
      ) : null}
      {validationError ? (
        <p role="alert" className="mb-2 rounded-md bg-error-subtle px-3 py-2 text-error-subtle-foreground text-sm">
          {validationError}
        </p>
      ) : null}
      <Textarea.Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-96 w-full resize-y font-mono text-sm leading-6"
        spellCheck={false}
      />
    </div>
  )
}
