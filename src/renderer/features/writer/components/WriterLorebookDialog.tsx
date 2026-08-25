import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  Textarea
} from '@cherrystudio/ui'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { type WriterLoreEntry, type WriterProject, WriterStoryBibleSchema } from '@shared/types/writer'
import { BookOpenText, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WriterProjectDocumentSaveRequest } from '../projectDocuments'
import { isWriterRevisionConflict } from '../utils'

interface WriterLorebookDialogProps {
  project: WriterProject
  onClose: () => void
  onProjectUpdated: (project: WriterProject) => void
  onSaveDocument: (request: WriterProjectDocumentSaveRequest) => Promise<WriterProject>
}

export function WriterLorebookDialog({
  project,
  onClose,
  onProjectUpdated,
  onSaveDocument
}: WriterLorebookDialogProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<WriterLoreEntry[]>(project.storyBible.loreEntries)
  const [selectedId, setSelectedId] = useState<string | undefined>(project.storyBible.loreEntries[0]?.id)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const entriesRef = useRef(entries)
  const projectRef = useRef(project)
  const titleFieldId = useId()
  const keysFieldId = useId()
  const keysHintId = useId()
  const contentFieldId = useId()
  const orderFieldId = useId()
  const orderHintId = useId()
  const selectedEntry = useMemo(() => entries.find((entry) => entry.id === selectedId), [entries, selectedId])
  const orderedEntries = useMemo(
    () => entries.toSorted((left, right) => right.order - left.order || left.id.localeCompare(right.id)),
    [entries]
  )

  const replaceEntries = useCallback((updater: (current: WriterLoreEntry[]) => WriterLoreEntry[]) => {
    setEntries((current) => {
      const next = updater(current)
      entriesRef.current = next
      return next
    })
    setDirty(true)
    setErrorMessage('')
  }, [])

  const updateSelectedEntry = useCallback(
    (patch: Partial<WriterLoreEntry>) => {
      if (!selectedId) return
      replaceEntries((current) => current.map((entry) => (entry.id === selectedId ? { ...entry, ...patch } : entry)))
    },
    [replaceEntries, selectedId]
  )

  const addEntry = useCallback(() => {
    if (saving) return
    const id = crypto.randomUUID()
    const entry: WriterLoreEntry = {
      id,
      title: '',
      content: '',
      keys: [],
      enabled: true,
      alwaysActive: false,
      caseSensitive: false,
      matchWholeWords: false,
      order: 100
    }
    replaceEntries((current) => [...current, entry])
    setSelectedId(id)
  }, [replaceEntries, saving])

  const removeSelectedEntry = useCallback(() => {
    if (!selectedId || saving) return
    const nextEntries = entriesRef.current.filter((entry) => entry.id !== selectedId)
    entriesRef.current = nextEntries
    setEntries(nextEntries)
    setSelectedId(nextEntries[0]?.id)
    setDirty(true)
    setErrorMessage('')
  }, [saving, selectedId])

  const saveLorebook = useCallback(async () => {
    if (saving || !dirty) return
    if (
      entriesRef.current.some(
        (entry) => !entry.title.trim() || !entry.content.trim() || (!entry.alwaysActive && entry.keys.length === 0)
      )
    ) {
      setErrorMessage(t('writer.lorebook.errors.invalid'))
      return
    }
    const storyBible = WriterStoryBibleSchema.safeParse({
      ...projectRef.current.storyBible,
      loreEntries: entriesRef.current
    })
    if (!storyBible.success) {
      setErrorMessage(t('writer.lorebook.errors.invalid'))
      return
    }

    const requestEntries = entriesRef.current
    setSaving(true)
    setErrorMessage('')
    try {
      const savedProject = await onSaveDocument({
        kind: 'storyBible',
        document: storyBible.data,
        expectedRevision: projectRef.current.documentRevisions.storyBible
      })
      projectRef.current = savedProject
      if (entriesRef.current === requestEntries) {
        entriesRef.current = savedProject.storyBible.loreEntries
        setEntries(savedProject.storyBible.loreEntries)
        setSelectedId((current) =>
          savedProject.storyBible.loreEntries.some((entry) => entry.id === current)
            ? current
            : savedProject.storyBible.loreEntries[0]?.id
        )
        setDirty(false)
      } else {
        setDirty(true)
      }
      onProjectUpdated(savedProject)
    } catch (error) {
      setErrorMessage(
        isWriterRevisionConflict(error)
          ? t('writer.lorebook.errors.conflict')
          : formatErrorMessageWithPrefix(error, t('writer.lorebook.errors.save_failed'))
      )
    } finally {
      setSaving(false)
    }
  }, [dirty, onProjectUpdated, onSaveDocument, saving, t])

  const requestClose = useCallback(() => {
    if (saving) return
    if (dirty) {
      setCloseConfirmOpen(true)
      return
    }
    onClose()
  }, [dirty, onClose, saving])

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) requestClose()
    },
    [requestClose]
  )

  return (
    <>
      <Dialog open onOpenChange={handleDialogOpenChange}>
        <DialogContent
          data-ui="writer.lorebook.dialog"
          size="xl"
          closeOnOverlayClick={false}
          className="grid h-[min(780px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:max-w-5xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <BookOpenText className="size-5 text-primary" aria-hidden />
              {t('writer.lorebook.title')}
            </DialogTitle>
            <DialogDescription>{t('writer.lorebook.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-[16rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-border">
            <aside className="flex min-h-0 flex-col border-border border-r bg-background-subtle">
              <div className="flex items-center justify-between gap-2 border-border border-b p-2">
                <span className="font-medium text-xs">{t('writer.memory.lorebook')}</span>
                <Button
                  data-ui="writer.lorebook.add"
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('writer.lorebook.add_entry')}
                  disabled={saving}
                  onClick={addEntry}>
                  <Plus className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {orderedEntries.length ? (
                  <ul className="space-y-1" aria-label={t('writer.memory.lorebook')}>
                    {orderedEntries.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          aria-pressed={entry.id === selectedId}
                          disabled={saving}
                          onClick={() => setSelectedId(entry.id)}
                          className="w-full rounded-md border border-transparent px-2 py-2 text-left hover:bg-accent aria-pressed:border-border aria-pressed:bg-accent">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-xs">
                              {entry.title || t('writer.lorebook.title_placeholder')}
                            </span>
                            <Badge variant="outline">{entry.order}</Badge>
                          </span>
                          <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                            {entry.alwaysActive ? t('writer.lorebook.always_active') : entry.keys.join(', ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                    <p className="text-muted-foreground text-xs">{t('writer.lorebook.empty')}</p>
                    <Button type="button" size="sm" disabled={saving} onClick={addEntry}>
                      <Plus className="size-3.5" aria-hidden />
                      {t('writer.lorebook.add_entry')}
                    </Button>
                  </div>
                )}
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto p-4">
              {selectedEntry ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor={titleFieldId} className="block font-medium text-sm">
                      {t('writer.lorebook.title_field')}
                    </label>
                    <Input
                      id={titleFieldId}
                      value={selectedEntry.title}
                      maxLength={200}
                      disabled={saving}
                      placeholder={t('writer.lorebook.title_placeholder')}
                      onChange={(event) => updateSelectedEntry({ title: event.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor={keysFieldId} className="block font-medium text-sm">
                      {t('writer.lorebook.keys')}
                    </label>
                    <Textarea.Input
                      id={keysFieldId}
                      aria-describedby={keysHintId}
                      value={selectedEntry.keys.join('\n')}
                      disabled={saving || selectedEntry.alwaysActive}
                      placeholder={t('writer.lorebook.keys_placeholder')}
                      className="min-h-24 resize-y"
                      onChange={(event) => updateSelectedEntry({ keys: parseLoreKeys(event.target.value) })}
                    />
                    <span id={keysHintId} className="block text-muted-foreground text-xs">
                      {t('writer.lorebook.keys_hint')}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor={contentFieldId} className="block font-medium text-sm">
                      {t('writer.lorebook.content')}
                    </label>
                    <Textarea.Input
                      id={contentFieldId}
                      value={selectedEntry.content}
                      maxLength={20_000}
                      disabled={saving}
                      placeholder={t('writer.lorebook.content_placeholder')}
                      className="min-h-44 resize-y"
                      onChange={(event) => updateSelectedEntry({ content: event.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor={orderFieldId} className="block font-medium text-sm">
                      {t('writer.lorebook.order')}
                    </label>
                    <Input
                      id={orderFieldId}
                      aria-describedby={orderHintId}
                      type="number"
                      min={0}
                      max={10_000}
                      value={selectedEntry.order}
                      disabled={saving}
                      onChange={(event) =>
                        updateSelectedEntry({ order: Math.max(0, Math.min(10_000, Number(event.target.value) || 0)) })
                      }
                    />
                    <span id={orderHintId} className="block text-muted-foreground text-xs">
                      {t('writer.lorebook.order_hint')}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <LoreSwitch
                      label={t('writer.lorebook.enabled')}
                      checked={selectedEntry.enabled}
                      disabled={saving}
                      onCheckedChange={(checked) => updateSelectedEntry({ enabled: checked })}
                    />
                    <LoreSwitch
                      label={t('writer.lorebook.always_active')}
                      checked={selectedEntry.alwaysActive}
                      disabled={saving}
                      onCheckedChange={(checked) => updateSelectedEntry({ alwaysActive: checked })}
                    />
                    <LoreSwitch
                      label={t('writer.lorebook.case_sensitive')}
                      checked={selectedEntry.caseSensitive}
                      disabled={saving || selectedEntry.alwaysActive}
                      onCheckedChange={(checked) => updateSelectedEntry({ caseSensitive: checked })}
                    />
                    <LoreSwitch
                      label={t('writer.lorebook.match_whole_words')}
                      checked={selectedEntry.matchWholeWords}
                      disabled={saving || selectedEntry.alwaysActive}
                      onCheckedChange={(checked) => updateSelectedEntry({ matchWholeWords: checked })}
                    />
                  </div>

                  <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={removeSelectedEntry}>
                    <Trash2 className="size-3.5" aria-hidden />
                    {t('writer.lorebook.remove_entry')}
                  </Button>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  {t('writer.lorebook.select_entry')}
                </div>
              )}

              {errorMessage ? (
                <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {errorMessage}
                </p>
              ) : null}
            </section>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
              {t('common.close')}
            </Button>
            <Button
              data-ui="writer.lorebook.save"
              type="button"
              loading={saving}
              disabled={!dirty || saving}
              onClick={() => void saveLorebook()}>
              <Save className="size-4" aria-hidden />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title={t('writer.lorebook.close_confirm.title')}
        description={t('writer.lorebook.close_confirm.description')}
        confirmText={t('writer.lorebook.close_confirm.confirm')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={onClose}
      />
    </>
  )
}

function LoreSwitch({
  label,
  checked,
  disabled,
  onCheckedChange
}: {
  label: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background-subtle px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  )
}

export function parseLoreKeys(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((key) => key.trim())
        .filter(Boolean)
    )
  ].slice(0, 20)
}
