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
import type { WriterProject } from '@shared/types/writer'
import { Braces, Save } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatWriterProjectDocument,
  validateWriterProjectDocument,
  WRITER_PROJECT_DOCUMENT_KINDS,
  type WriterProjectDocumentKind,
  type WriterProjectDocumentSaveRequest
} from '../projectDocuments'
import { isWriterRevisionConflict } from '../utils'

const CodeEditor = lazy(() => import('@cherrystudio/ui/components/composites/code-editor'))

type DraftStatus = 'saved' | 'dirty' | 'saving' | 'error'

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

  return (
    <>
      <Dialog open onOpenChange={handleDialogOpenChange}>
        <DialogContent
          data-ui="writer.documents.dialog"
          size="xl"
          closeOnOverlayClick={false}
          className="grid h-[min(760px,calc(100vh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Braces className="size-5 text-primary" aria-hidden />
              {t('writer.documents.title')}
            </DialogTitle>
            <DialogDescription>{t('writer.documents.description')}</DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-background-subtle px-3 py-2 text-muted-foreground text-xs leading-5">
            {t('writer.documents.schema_hint')}
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <Tabs value={activeKind} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-3">
                {WRITER_PROJECT_DOCUMENT_KINDS.map((kind) => (
                  <TabsTrigger key={kind} value={kind} className="min-w-0 gap-1.5">
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

            <div
              role="tabpanel"
              aria-label={t(DOCUMENT_TAB_LABEL_KEYS[activeKind])}
              className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
              <Suspense
                fallback={
                  <div role="status" className="flex h-full items-center justify-center text-muted-foreground text-sm">
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
            </div>

            {activeDraft.error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                {activeDraft.error}
              </p>
            ) : null}
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
