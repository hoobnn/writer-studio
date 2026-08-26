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
  Tabs,
  TabsList,
  TabsTrigger
} from '@cherrystudio/ui'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WriterContinuityLedger, WriterOutline, WriterProject, WriterStoryBible } from '@shared/types/writer'
import { Braces, PanelsTopLeft, Save } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatWriterProjectDocument,
  parseContinuityDraft,
  parseOutlineDraft,
  parseStoryBibleDraft,
  validateWriterProjectDocument,
  WRITER_PROJECT_DOCUMENT_KINDS,
  type WriterProjectDocumentKind,
  type WriterProjectDocumentSaveRequest
} from '../projectDocuments'
import { isWriterRevisionConflict } from '../utils'
import { WriterContinuityForm } from './WriterContinuityForm'
import { WriterOutlineForm } from './WriterOutlineForm'
import { WriterStoryBibleForm } from './WriterStoryBibleForm'

const CodeEditor = lazy(() => import('@cherrystudio/ui/components/composites/code-editor'))

type DraftStatus = 'saved' | 'dirty' | 'saving' | 'error'
type EditorMode = 'studio' | 'json'

interface DocumentDraft {
  baseline: string
  error: string
  status: DraftStatus
  text: string
}

type DocumentDrafts = Record<WriterProjectDocumentKind, DocumentDraft>

const DOCUMENT_TAB_LABEL_KEYS: Record<WriterProjectDocumentKind, string> = {
  storyBible: 'writer.documents.tabs.story_bible',
  outline: 'writer.documents.tabs.outline',
  continuity: 'writer.documents.tabs.continuity'
}

const DOCUMENT_STATUS_LABEL_KEYS: Record<DraftStatus, string> = {
  saved: 'writer.editor.status.saved',
  dirty: 'writer.editor.status.dirty',
  saving: 'writer.editor.status.saving',
  error: 'writer.editor.status.error'
}

interface WriterProjectDocumentsDialogProps {
  project: WriterProject
  onClose: () => void
  onProjectUpdated: (project: WriterProject) => void
  onSaveDocument: (request: WriterProjectDocumentSaveRequest) => Promise<WriterProject>
}

export function WriterProjectDocumentsDialog({
  project,
  onClose,
  onProjectUpdated,
  onSaveDocument
}: WriterProjectDocumentsDialogProps) {
  const { t } = useTranslation()
  const [activeKind, setActiveKind] = useState<WriterProjectDocumentKind>('storyBible')
  const [editorModes, setEditorModes] = useState<Record<WriterProjectDocumentKind, EditorMode>>({
    storyBible: 'studio',
    outline: 'studio',
    continuity: 'studio'
  })
  const [drafts, setDrafts] = useState<DocumentDrafts>(() => createDocumentDrafts(project))
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const draftsRef = useRef(drafts)
  const projectRef = useRef(project)

  useEffect(() => {
    projectRef.current = project
  }, [project])

  const updateDraft = useCallback(
    (kind: WriterProjectDocumentKind, updater: (draft: DocumentDraft) => DocumentDraft) => {
      setDrafts((current) => {
        const next = { ...current, [kind]: updater(current[kind]) }
        draftsRef.current = next
        return next
      })
    },
    []
  )

  const handleEditorChange = useCallback(
    (text: string) => {
      updateDraft(activeKind, (draft) => ({
        ...draft,
        text,
        error: '',
        status: text === draft.baseline ? 'saved' : 'dirty'
      }))
    },
    [activeKind, updateDraft]
  )
  const handleDocumentChange = useCallback(
    (kind: WriterProjectDocumentKind, document: WriterStoryBible | WriterOutline | WriterContinuityLedger) => {
      updateDraft(kind, (draft) => {
        const text = JSON.stringify(document, null, 2)
        return { ...draft, text, error: '', status: text === draft.baseline ? 'saved' : 'dirty' }
      })
    },
    [updateDraft]
  )
  const handleStoryBibleChange = useCallback(
    (storyBible: WriterStoryBible) => handleDocumentChange('storyBible', storyBible),
    [handleDocumentChange]
  )
  const handleOutlineChange = useCallback(
    (outline: WriterOutline) => handleDocumentChange('outline', outline),
    [handleDocumentChange]
  )
  const handleContinuityChange = useCallback(
    (continuity: WriterContinuityLedger) => handleDocumentChange('continuity', continuity),
    [handleDocumentChange]
  )

  const saveActiveDocument = useCallback(async () => {
    const draft = draftsRef.current[activeKind]
    const validation = validateWriterProjectDocument(activeKind, draft.text)
    if (!validation.ok) {
      const messageKey =
        validation.reason === 'invalid_json'
          ? 'writer.documents.errors.invalid_json'
          : 'writer.documents.errors.invalid_schema'
      updateDraft(activeKind, (current) => ({
        ...current,
        status: 'error',
        error: validation.details ? `${t(messageKey)}: ${validation.details}` : t(messageKey)
      }))
      return
    }

    const expectedRevision = projectRef.current.documentRevisions[activeKind]
    if (!expectedRevision) {
      updateDraft(activeKind, (current) => ({
        ...current,
        status: 'error',
        error: t('writer.documents.errors.missing_revision')
      }))
      return
    }

    updateDraft(activeKind, (current) => ({ ...current, status: 'saving', error: '' }))
    const requestText = draft.text
    try {
      const savedProject = await onSaveDocument({ ...validation.value, expectedRevision })
      projectRef.current = savedProject
      onProjectUpdated(savedProject)
      const savedText = formatWriterProjectDocument(savedProject, activeKind)
      updateDraft(activeKind, (current) =>
        current.text === requestText
          ? { baseline: savedText, error: '', status: 'saved', text: savedText }
          : { ...current, baseline: savedText, error: '', status: 'dirty' }
      )
    } catch (error) {
      updateDraft(activeKind, (current) => ({
        ...current,
        status: 'error',
        error: isWriterRevisionConflict(error)
          ? t('writer.documents.errors.conflict')
          : formatErrorMessageWithPrefix(error, t('writer.documents.errors.save_failed'))
      }))
    }
  }, [activeKind, onProjectUpdated, onSaveDocument, t, updateDraft])

  const requestClose = useCallback(() => {
    if (Object.values(draftsRef.current).some((draft) => draft.status === 'saving')) return
    const hasUnsavedChanges = Object.values(draftsRef.current).some((draft) => draft.text !== draft.baseline)
    if (hasUnsavedChanges) {
      setCloseConfirmOpen(true)
      return
    }
    onClose()
  }, [onClose])

  const confirmClose = useCallback(() => {
    setCloseConfirmOpen(false)
    onClose()
  }, [onClose])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) requestClose()
    },
    [requestClose]
  )

  const handleTabChange = useCallback((value: string) => {
    setActiveKind(value as WriterProjectDocumentKind)
  }, [])

  const activeDraft = drafts[activeKind]
  const activeRevision = projectRef.current.documentRevisions[activeKind]
  const anyDocumentSaving = Object.values(drafts).some((draft) => draft.status === 'saving')
  const editableStoryBible = useMemo(() => parseStoryBibleDraft(drafts.storyBible.text), [drafts.storyBible.text])
  const editableOutline = useMemo(() => parseOutlineDraft(drafts.outline.text), [drafts.outline.text])
  const editableContinuity = useMemo(() => parseContinuityDraft(drafts.continuity.text), [drafts.continuity.text])
  const editableDocuments = { continuity: editableContinuity, outline: editableOutline, storyBible: editableStoryBible }
  const canEnterStudio = useMemo(
    () => validateWriterProjectDocument(activeKind, activeDraft.text).ok,
    [activeKind, activeDraft.text]
  )
  const editorMode = editorModes[activeKind]
  const studioMode = editorMode === 'studio' && editableDocuments[activeKind] !== undefined
  const chapters = useMemo(() => [...project.manifest.chapters].sort((a, b) => a.order - b.order), [project])
  // Characters come from the (possibly unsaved) story bible draft so entries
  // added in this dialog are immediately selectable in the continuity form.
  const characters = useMemo(() => {
    const source = editableStoryBible?.characters ?? project.storyBible.characters
    return source.filter((character) => typeof character?.id === 'string' && character.id.length > 0)
  }, [editableStoryBible, project])
  const chapterPlans = editableOutline?.chapterPlans ?? project.outline.chapterPlans

  return (
    <>
      <Dialog open onOpenChange={handleDialogOpenChange}>
        <DialogContent
          data-ui="writer.documents.dialog"
          size="xl"
          closeOnOverlayClick={false}
          className="grid h-[min(780px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:max-w-5xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Braces className="size-5 text-primary" aria-hidden />
              {t('writer.story_studio.title')}
            </DialogTitle>
            <DialogDescription>{t('writer.story_studio.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-[14rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-border">
            <aside className="flex min-h-0 flex-col border-border border-r bg-background-subtle">
              <div className="border-border border-b px-3 py-2 font-medium text-xs">{t('writer.documents.title')}</div>
              <Tabs value={activeKind} onValueChange={handleTabChange} className="min-h-0 flex-1 overflow-y-auto">
                <TabsList className="flex h-auto w-full flex-col gap-1 bg-transparent p-2">
                  {WRITER_PROJECT_DOCUMENT_KINDS.map((kind) => (
                    <TabsTrigger
                      key={kind}
                      value={kind}
                      className="w-full min-w-0 justify-between gap-1.5 border border-transparent bg-transparent px-2.5 shadow-none hover:bg-accent data-[state=active]:border-border data-[state=active]:bg-accent data-[state=active]:shadow-none">
                      <span className="truncate">{t(DOCUMENT_TAB_LABEL_KEYS[kind])}</span>
                      {drafts[kind].status !== 'saved' ? (
                        <Badge variant={drafts[kind].status === 'error' ? 'destructive' : 'outline'}>
                          {t(DOCUMENT_STATUS_LABEL_KEYS[drafts[kind].status])}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="border-border border-t p-2">
                <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-0.5">
                  <Button
                    data-ui="writer.story-studio.mode"
                    type="button"
                    size="sm"
                    variant={editorMode === 'studio' ? 'secondary' : 'ghost'}
                    aria-pressed={editorMode === 'studio'}
                    disabled={!canEnterStudio && editorMode !== 'studio'}
                    onClick={() => setEditorModes((current) => ({ ...current, [activeKind]: 'studio' }))}>
                    <PanelsTopLeft className="size-3.5" aria-hidden />
                    {t('writer.story_studio.visual_mode')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editorMode === 'json' ? 'secondary' : 'ghost'}
                    aria-pressed={editorMode === 'json'}
                    onClick={() => setEditorModes((current) => ({ ...current, [activeKind]: 'json' }))}>
                    <Braces className="size-3.5" aria-hidden />
                    {t('writer.story_studio.json_mode')}
                  </Button>
                </div>
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-4 py-2">
                <span className="text-muted-foreground text-xs leading-5">
                  {t(studioMode ? 'writer.story_studio.studio_hint' : 'writer.documents.schema_hint')}
                </span>
                <Badge variant={activeDraft.status === 'error' ? 'destructive' : 'outline'} className="shrink-0">
                  {t(DOCUMENT_STATUS_LABEL_KEYS[activeDraft.status])}
                </Badge>
              </div>
              <div
                role="tabpanel"
                aria-label={t(DOCUMENT_TAB_LABEL_KEYS[activeKind])}
                className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
                {studioMode && activeKind === 'storyBible' && editableStoryBible ? (
                  <WriterStoryBibleForm
                    storyBible={editableStoryBible}
                    disabled={activeDraft.status === 'saving'}
                    onChange={handleStoryBibleChange}
                  />
                ) : studioMode && activeKind === 'outline' && editableOutline ? (
                  <WriterOutlineForm
                    outline={editableOutline}
                    chapters={chapters}
                    disabled={activeDraft.status === 'saving'}
                    onChange={handleOutlineChange}
                  />
                ) : studioMode && activeKind === 'continuity' && editableContinuity ? (
                  <WriterContinuityForm
                    continuity={editableContinuity}
                    chapters={chapters}
                    characters={characters}
                    chapterPlans={chapterPlans}
                    disabled={activeDraft.status === 'saving'}
                    onChange={handleContinuityChange}
                  />
                ) : (
                  <Suspense
                    fallback={
                      <div
                        role="status"
                        className="flex h-full items-center justify-center text-muted-foreground text-sm">
                        {t('common.loading')}
                      </div>
                    }>
                    <CodeEditor
                      value={activeDraft.text}
                      language="json"
                      editable={activeDraft.status !== 'saving'}
                      readOnly={activeDraft.status === 'saving'}
                      onChange={handleEditorChange}
                      onSave={() => void saveActiveDocument()}
                      expanded={false}
                      height="100%"
                      className="h-full"
                      theme="none"
                      options={{ keymap: true, lint: true }}
                    />
                  </Suspense>
                )}
              </div>

              {activeDraft.error ? (
                <p role="alert" className="m-3 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {activeDraft.error}
                </p>
              ) : null}
            </section>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <div className="mr-auto min-w-0 text-muted-foreground text-xs">
              {t('writer.documents.revision')}: <span className="font-mono">{activeRevision.slice(0, 12)}</span>
            </div>
            <Button type="button" variant="outline" disabled={anyDocumentSaving} onClick={requestClose}>
              {t('common.close')}
            </Button>
            <Button
              data-ui="writer.documents.save"
              type="button"
              loading={activeDraft.status === 'saving'}
              disabled={activeDraft.text === activeDraft.baseline || activeDraft.status === 'saving'}
              onClick={() => void saveActiveDocument()}>
              <Save className="size-4" aria-hidden />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title={t('writer.documents.close_confirm.title')}
        description={t('writer.documents.close_confirm.description')}
        confirmText={t('writer.documents.close_confirm.confirm')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={confirmClose}
      />
    </>
  )
}

function createDocumentDrafts(project: WriterProject): DocumentDrafts {
  return {
    storyBible: createDocumentDraft(project, 'storyBible'),
    outline: createDocumentDraft(project, 'outline'),
    continuity: createDocumentDraft(project, 'continuity')
  }
}

function createDocumentDraft(project: WriterProject, kind: WriterProjectDocumentKind): DocumentDraft {
  const text = formatWriterProjectDocument(project, kind)
  return { baseline: text, error: '', status: 'saved', text }
}
