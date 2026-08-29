import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from '@cherrystudio/ui'
import { ModelSelector } from '@renderer/components/ModelSelector'
import { usePreference } from '@renderer/data/hooks/usePreference'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import type { Model, UniqueModelId } from '@shared/data/types/model'
import type { WorkshopPromptEntry, WorkshopPromptRole } from '@shared/types/workshop'
import { WORKSHOP_PROMPT_ROLES } from '@shared/types/workshop'
import { isNonChatModel } from '@shared/utils/model'
import { ChevronDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WORKSHOP_ROLE_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopSettingsDialogProps {
  rootPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 角色指令保存会产生一次正史提交;通知工作区刷新时间线等。 */
  onCommitted?: () => void
}

const ROLE_KEYS = ['planner', 'writer', 'reviewer', 'guardian', 'discussion'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

const chatModelFilter = (model: Model) => !isNonChatModel(model)

function modelDisplayName(uniqueModelId: string | undefined | null, fallback: string): string {
  if (!uniqueModelId) return fallback
  const separator = uniqueModelId.indexOf('::')
  return separator >= 0 ? uniqueModelId.slice(separator + 2) : uniqueModelId
}

function ModelRow({
  label,
  value,
  placeholder,
  onSelect,
  onClear,
  clearLabel
}: {
  label: string
  value: string | undefined | null
  placeholder: string
  onSelect: (modelId: UniqueModelId) => void
  onClear: () => void
  clearLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-sm">{label}</span>
      <ModelSelector
        multiple={false}
        selectionType="id"
        value={value ? (value as UniqueModelId) : undefined}
        onSelect={(modelId) => {
          if (modelId) onSelect(modelId)
        }}
        filter={chatModelFilter}
        trigger={
          <Button type="button" variant="outline" className="min-w-0 flex-1 justify-between">
            <span className={`truncate ${value ? '' : 'text-muted-foreground'}`}>
              {modelDisplayName(value, placeholder)}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        }
      />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={clearLabel} disabled={!value} onClick={onClear}>
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}

export function WorkshopSettingsDialog({ rootPath, open, onOpenChange, onCommitted }: WorkshopSettingsDialogProps) {
  const { t } = useTranslation()
  const [defaultModelId, setDefaultModelId] = usePreference('feature.workshop.default_model_id')
  const [roleModelIds, setRoleModelIds] = usePreference('feature.workshop.role_model_ids')
  const [entries, setEntries] = useState<WorkshopPromptEntry[]>([])
  const [drafts, setDrafts] = useState<Partial<Record<WorkshopPromptRole, string>>>({})
  const [promptRole, setPromptRole] = useState<WorkshopPromptRole>('planner')
  const [saving, setSaving] = useState(false)

  const roleLabel = (role: RoleKey) =>
    role === 'discussion' ? t('workshop.discussion.title') : t(WORKSHOP_ROLE_LABEL_KEYS[role])

  useEffect(() => {
    if (!open) return
    ipcApi
      .request('workshop.prompt.list', { rootPath })
      .then(({ prompts }) => {
        setEntries(prompts)
        setDrafts(Object.fromEntries(prompts.map((entry) => [entry.role, entry.custom ?? ''])))
      })
      .catch((error) => toast.error({ title: t('workshop.prompts.load_failed'), description: getErrorMessage(error) }))
  }, [open, rootPath, t])

  const entry = entries.find((candidate) => candidate.role === promptRole)
  const draft = drafts[promptRole] ?? ''
  const promptDirty = entry ? draft !== (entry.custom ?? '') : false

  const savePrompt = async () => {
    if (!entry) return
    const trimmed = draft.trim()
    if (!trimmed && entry.custom === null) return
    setSaving(true)
    try {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.save_prompt', { role: roleLabel(promptRole) }),
        changes: [
          trimmed
            ? { op: 'write_prompt', role: promptRole, content: trimmed }
            : { op: 'delete_prompt', role: promptRole }
        ]
      })
      setEntries((current) =>
        current.map((candidate) =>
          candidate.role === promptRole ? { ...candidate, custom: trimmed || null } : candidate
        )
      )
      setDrafts((current) => ({ ...current, [promptRole]: trimmed }))
      toast.success(t('common.saved'))
      onCommitted?.()
    } catch (error) {
      toast.error({ title: t('workshop.prompts.save_failed'), description: getErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('workshop.settings.title')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="models" variant="line">
          <TabsList aria-label={t('workshop.settings.title')}>
            <TabsTrigger value="models">{t('workshop.settings.tab_models')}</TabsTrigger>
            <TabsTrigger value="prompts">{t('workshop.settings.tab_prompts')}</TabsTrigger>
          </TabsList>
          <TabsContent value="models" className="space-y-3 pt-3">
            <p className="text-muted-foreground text-sm">{t('workshop.models.description')}</p>
            <ModelRow
              label={t('workshop.models.default_label')}
              value={defaultModelId}
              placeholder={t('workshop.models.follow_app_default')}
              onSelect={(modelId) => void setDefaultModelId(modelId)}
              onClear={() => void setDefaultModelId(null)}
              clearLabel={t('workshop.models.clear')}
            />
            <div className="border-border border-t pt-3" />
            {ROLE_KEYS.map((role) => (
              <ModelRow
                key={role}
                label={roleLabel(role)}
                value={roleModelIds?.[role]}
                placeholder={t('workshop.models.follow_workshop_default')}
                onSelect={(modelId) => void setRoleModelIds({ ...roleModelIds, [role]: modelId })}
                onClear={() => {
                  const rest = { ...roleModelIds }
                  delete rest[role]
                  void setRoleModelIds(rest)
                }}
                clearLabel={t('workshop.models.clear')}
              />
            ))}
          </TabsContent>
          <TabsContent value="prompts" className="space-y-3 pt-3">
            <p className="text-muted-foreground text-sm">{t('workshop.prompts.description')}</p>
            <SegmentedControl<WorkshopPromptRole>
              size="sm"
              aria-label={t('workshop.settings.tab_prompts')}
              value={promptRole}
              onValueChange={setPromptRole}
              options={WORKSHOP_PROMPT_ROLES.map((role) => ({ value: role, label: roleLabel(role) }))}
            />
            <Textarea.Input
              value={draft}
              onChange={(event) => setDrafts((current) => ({ ...current, [promptRole]: event.target.value }))}
              placeholder={entry?.builtin ?? ''}
              className="min-h-40 resize-y text-sm leading-6"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">{t('workshop.prompts.hint')}</span>
              <Button
                type="button"
                size="sm"
                disabled={!promptDirty}
                loading={saving}
                onClick={() => void savePrompt()}>
                {t('workshop.editor.save')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
