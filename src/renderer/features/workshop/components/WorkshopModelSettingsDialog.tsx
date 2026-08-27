import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@cherrystudio/ui'
import { ModelSelector } from '@renderer/components/ModelSelector'
import { usePreference } from '@renderer/data/hooks/usePreference'
import type { Model, UniqueModelId } from '@shared/data/types/model'
import { isNonChatModel } from '@shared/utils/model'
import { ChevronDown, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface WorkshopModelSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function WorkshopModelSettingsDialog({ open, onOpenChange }: WorkshopModelSettingsDialogProps) {
  const { t } = useTranslation()
  const [defaultModelId, setDefaultModelId] = usePreference('feature.workshop.default_model_id')
  const [roleModelIds, setRoleModelIds] = usePreference('feature.workshop.role_model_ids')

  const roleLabel = (role: RoleKey) =>
    role === 'discussion' ? t('workshop.discussion.title') : t(`workshop.generate.role_${role}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('workshop.models.title')}</DialogTitle>
          <DialogDescription>{t('workshop.models.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
