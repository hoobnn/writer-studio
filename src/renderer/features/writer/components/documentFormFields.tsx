import { Button, Input, Textarea } from '@cherrystudio/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export function StringListField({
  label,
  values,
  disabled,
  placeholder,
  hint,
  onChange
}: {
  label: string
  values: string[]
  disabled: boolean
  placeholder: string
  hint?: string
  onChange: (values: string[]) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const hintId = useId()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span id={id} className="font-medium text-xs">
          {label}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`${t('common.add')} ${label}`}
          disabled={disabled}
          onClick={() => onChange([...values, ''])}>
          <Plus className="size-3.5" aria-hidden />
        </Button>
      </div>
      {hint ? (
        <span id={hintId} className="block text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
      {values.length ? (
        <div className="space-y-1.5" aria-labelledby={id} aria-describedby={hint ? hintId : undefined}>
          {values.map((value, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                value={value}
                disabled={disabled}
                aria-label={`${label} ${index + 1}`}
                placeholder={placeholder}
                onChange={(event) => {
                  const nextValues = [...values]
                  nextValues[index] = event.target.value
                  onChange(nextValues)
                }}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`${t('common.delete')} ${label} ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 py-1.5 text-muted-foreground text-xs">{t('writer.story_studio.empty_list')}</p>
      )}
    </div>
  )
}

export function TextField({
  label,
  value,
  disabled,
  hint,
  onChange
}: {
  label: string
  value: string
  disabled: boolean
  hint?: string
  onChange: (value: string) => void
}) {
  const hintId = useId()

  return (
    <label className="block space-y-1.5">
      <span className="font-medium text-xs">{label}</span>
      <Input
        value={value}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <span id={hintId} className="block text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export function TextAreaField({
  label,
  value,
  disabled,
  minHeight,
  hint,
  onChange
}: {
  label: string
  value: string
  disabled: boolean
  minHeight: string
  hint?: string
  onChange: (value: string) => void
}) {
  const hintId = useId()

  return (
    <label className="block space-y-1.5">
      <span className="font-medium text-xs">{label}</span>
      <Textarea.Input
        value={value}
        disabled={disabled}
        className={`${minHeight} resize-y`}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <span id={hintId} className="block text-muted-foreground text-xs">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="min-w-0">
      <h2 id={id} className="font-semibold text-sm">
        {title}
      </h2>
      <p className="mt-1 text-muted-foreground text-xs leading-5">{description}</p>
    </div>
  )
}

export function createEntityId(prefix: string, existingIds: string[]): string {
  const existing = new Set(existingIds)
  let suffix = existingIds.length + 1
  while (existing.has(`${prefix}-${suffix}`)) suffix += 1
  return `${prefix}-${suffix}`
}
