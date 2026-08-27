// 工坊实体表单的共享字段原语,承自 writer 的 documentFormFields 受控模式,
// 增加字段级 error 呈现(Field/FieldError)与引用选择器。
import {
  Button,
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea
} from '@cherrystudio/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export interface ReferenceOption {
  value: string
  label: string
}

function Hint({ id, text }: { id: string; text?: string }) {
  if (!text) return null
  return (
    <span id={id} className="block text-muted-foreground text-xs">
      {text}
    </span>
  )
}

function fieldErrors(error: string | undefined) {
  return error ? [{ message: error }] : undefined
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  disabled
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  placeholder?: string
  disabled?: boolean
}) {
  const hintId = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>
        {label}
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </FieldLabel>
      <Hint id={hintId} text={hint} />
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  minHeight = 'min-h-24',
  error,
  hint,
  disabled
}: {
  label: string
  value: string
  onChange: (value: string) => void
  minHeight?: string
  error?: string
  hint?: string
  disabled?: boolean
}) {
  const hintId = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>
        {label}
        <Textarea.Input
          value={value}
          disabled={disabled}
          className={`${minHeight} resize-y`}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </FieldLabel>
      <Hint id={hintId} text={hint} />
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  integer,
  optional,
  error,
  hint,
  disabled
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number | 'any'
  integer?: boolean
  /** 允许清空(序列化为字段缺席)。 */
  optional?: boolean
  error?: string
  hint?: string
  disabled?: boolean
}) {
  const hintId = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>
        {label}
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? ''}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => {
            if (event.target.value === '' && optional) {
              onChange(undefined)
              return
            }
            const raw = Number(event.target.value)
            let next = Number.isFinite(raw) ? raw : (min ?? 0)
            if (integer) next = Math.trunc(next)
            if (min !== undefined) next = Math.max(min, next)
            if (max !== undefined) next = Math.min(max, next)
            onChange(next)
          }}
        />
      </FieldLabel>
      <Hint id={hintId} text={hint} />
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

export function SwitchField({
  label,
  checked,
  onChange,
  hint,
  disabled
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
}) {
  const hintId = useId()
  return (
    <Field orientation="horizontal">
      <FieldLabel className="flex-1">{label}</FieldLabel>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onCheckedChange={onChange}
      />
      <Hint id={hintId} text={hint} />
    </Field>
  )
}

export function EnumSelectField<Value extends string>({
  label,
  value,
  options,
  onChange,
  error,
  hint,
  disabled
}: {
  label: string
  value: Value
  options: ReadonlyArray<{ value: Value; label: string }>
  onChange: (value: Value) => void
  error?: string
  hint?: string
  disabled?: boolean
}) {
  const labelId = useId()
  const hintId = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as Value)}>
        <SelectTrigger
          className="w-full"
          aria-labelledby={labelId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? hintId : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Hint id={hintId} text={hint} />
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

export function StringListField({
  label,
  values,
  onChange,
  placeholder,
  hint,
  error,
  errorAt,
  max,
  disabled
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
  /** 数组容器级错误(如超出上限)。 */
  error?: string
  /** 行级错误查询,如 errorAt(0) 返回第一行的错误。 */
  errorAt?: (index: number) => string | undefined
  max?: number
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const hintId = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id={id}>{label}</FieldLabel>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`${t('common.add')} ${label}`}
          disabled={disabled || (max !== undefined && values.length >= max)}
          onClick={() => onChange([...values, ''])}>
          <Plus className="size-3.5" aria-hidden />
        </Button>
      </div>
      <Hint id={hintId} text={hint} />
      {values.length ? (
        <div className="space-y-1.5" aria-labelledby={id} aria-describedby={hint ? hintId : undefined}>
          {values.map((value, index) => {
            const rowError = errorAt?.(index)
            return (
              <div key={index}>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={value}
                    disabled={disabled}
                    aria-label={`${label} ${index + 1}`}
                    aria-invalid={rowError ? true : undefined}
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
                <FieldError errors={fieldErrors(rowError)} />
              </div>
            )
          })}
        </div>
      ) : (
        <p className="px-1 py-1 text-muted-foreground text-xs">{t('workshop.entity_form.empty_list')}</p>
      )}
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

/** 单选引用:可搜索;悬空 id(被引用后删除)保留为红色可见项,不静默丢弃。 */
export function ReferenceField({
  label,
  value,
  options,
  onChange,
  allowNone,
  error,
  hint,
  disabled
}: {
  label: string
  value: string | undefined
  options: ReferenceOption[]
  onChange: (value: string | undefined) => void
  allowNone?: boolean
  error?: string
  hint?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const labelId = useId()
  const hintId = useId()
  const dangling = value !== undefined && value !== '' && !options.some((option) => option.value === value)
  const allOptions = [
    ...(allowNone ? [{ value: '', label: t('workshop.entity_form.none') }] : []),
    ...(dangling && value ? [{ value, label: `${value} · ${t('workshop.entity_form.dangling_ref')}` }] : []),
    ...options
  ]
  return (
    <Field data-invalid={error || dangling ? true : undefined}>
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <Combobox
        options={allOptions}
        value={value ?? ''}
        disabled={disabled}
        error={Boolean(error) || dangling}
        aria-labelledby={labelId}
        onChange={(next) => onChange(typeof next === 'string' && next !== '' ? next : undefined)}
      />
      <Hint id={hintId} text={hint} />
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

/** 多选引用(无序,如 fact 的 usedInChapterIds)。 */
export function MultiReferenceField({
  label,
  values,
  options,
  onChange,
  error,
  hint,
  disabled
}: {
  label: string
  values: string[]
  options: ReferenceOption[]
  onChange: (values: string[]) => void
  error?: string
  hint?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const labelId = useId()
  const hintId = useId()
  const known = new Set(options.map((option) => option.value))
  const danglingOptions = values
    .filter((value) => !known.has(value))
    .map((value) => ({ value, label: `${value} · ${t('workshop.entity_form.dangling_ref')}` }))
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <Combobox
        multiple
        options={[...danglingOptions, ...options]}
        value={values}
        disabled={disabled}
        error={Boolean(error)}
        aria-labelledby={labelId}
        onChange={(next) => onChange(Array.isArray(next) ? next : [])}
      />
      <Hint id={hintId} text={hint} />
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}

/** 有序引用列表(卷/弧的 chapterIds):行内删除 + 底部追加;顺序即语义。 */
export function OrderedReferenceListField({
  label,
  values,
  options,
  onChange,
  hint,
  error,
  disabled
}: {
  label: string
  values: string[]
  options: ReferenceOption[]
  onChange: (values: string[]) => void
  hint?: string
  error?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const labelId = useId()
  const hintId = useId()
  const labelFor = (value: string) => options.find((option) => option.value === value)?.label
  const remaining = options.filter((option) => !values.includes(option.value))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= values.length) return
    const next = [...values]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <Hint id={hintId} text={hint} />
      {values.length ? (
        <div className="space-y-1" aria-labelledby={labelId}>
          {values.map((value, index) => {
            const resolved = labelFor(value)
            return (
              <div key={value} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
                <span className={`min-w-0 flex-1 truncate text-sm ${resolved ? '' : 'text-destructive'}`}>
                  {resolved ?? `${value} · ${t('workshop.entity_form.dangling_ref')}`}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t('workshop.entity_form.move_up')} ${index + 1}`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}>
                  ↑
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t('workshop.entity_form.move_down')} ${index + 1}`}
                  disabled={disabled || index === values.length - 1}
                  onClick={() => move(index, 1)}>
                  ↓
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t('common.delete')} ${label} ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(values.filter((item) => item !== value))}>
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="px-1 py-1 text-muted-foreground text-xs">{t('workshop.entity_form.empty_list')}</p>
      )}
      {remaining.length > 0 ? (
        <Combobox
          options={remaining}
          value=""
          disabled={disabled}
          placeholder={t('workshop.entity_form.add_reference')}
          aria-label={`${t('common.add')} ${label}`}
          onChange={(next) => {
            if (typeof next === 'string' && next) onChange([...values, next])
          }}
        />
      ) : null}
      <FieldError errors={fieldErrors(error)} />
    </Field>
  )
}
