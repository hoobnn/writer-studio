import { Badge, Button, ConfirmDialog } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessage } from '@renderer/utils/error'
import type { WriterRecoveryDraft } from '@shared/data/cache/cacheValueTypes'
import type { WriterChapterDocument } from '@shared/types/writer'
import { AlertTriangle, Check, Copy, History, RefreshCw, Save } from 'lucide-react'
import {
  lazy,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'

import { WRITER_MAX_RECOVERY_DRAFT_CHARS } from '../recovery'
import type { WriterEditorController, WriterEditorStatus } from '../types'
import { countManuscriptCharacters, isWriterRevisionConflict } from '../utils'

const AUTOSAVE_DELAY_MS = 800
const CodeEditor = lazy(() => import('@cherrystudio/ui/components/composites/code-editor'))

const WRITER_EDITOR_STATUS_LABEL_KEYS: Record<WriterEditorStatus, string> = {
  dirty: 'writer.editor.status.dirty',
  saving: 'writer.editor.status.saving',
  saved: 'writer.editor.status.saved',
  conflict: 'writer.editor.status.conflict',
  error: 'writer.editor.status.error'
}

interface WriterEditorPaneProps {
  controllerRef: RefObject<WriterEditorController | null>
  document: WriterChapterDocument
  rootPath: string
  recoveryDraft?: WriterRecoveryDraft
  locked: boolean
  onDocumentSaved: (document: WriterChapterDocument) => void
  onDraftChange: (content: string) => void
  onOpenHistory: () => void
  onRecoveryDraftChange: (draft: WriterRecoveryDraft | undefined) => void
  onDiscardDraftAndReload: () => Promise<WriterChapterDocument | null>
}

export function WriterEditorPane({
  controllerRef,
  document,
  rootPath,
  recoveryDraft,
  locked,
  onDocumentSaved,
  onDraftChange,
  onOpenHistory,
  onRecoveryDraftChange,
  onDiscardDraftAndReload
}: WriterEditorPaneProps) {
  const { t } = useTranslation()
  const matchingRecoveryDraft =
    recoveryDraft?.rootPath === rootPath && recoveryDraft.chapterId === document.chapter.id ? recoveryDraft : undefined
  const hasRecoveredContent = matchingRecoveryDraft !== undefined && matchingRecoveryDraft.content !== document.content
  const initialStatus: WriterEditorStatus =
    matchingRecoveryDraft && hasRecoveredContent
      ? matchingRecoveryDraft.baseRevision === document.chapter.revision
        ? 'dirty'
        : 'conflict'
      : 'saved'
  const initialContent = matchingRecoveryDraft && hasRecoveredContent ? matchingRecoveryDraft.content : document.content

  const [content, setContent] = useState(initialContent)
  const [status, setStatus] = useState<WriterEditorStatus>(initialStatus)
  const [lastError, setLastError] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const documentRef = useRef(document)
  const contentRef = useRef(initialContent)
  const persistedContentRef = useRef(document.content)
  const draftBaseRevisionRef = useRef(matchingRecoveryDraft?.baseRevision ?? document.chapter.revision)
  const statusRef = useRef<WriterEditorStatus>(initialStatus)
  const savePromiseRef = useRef<Promise<WriterChapterDocument | null> | null>(null)
  const lockedRef = useRef(locked)
  const callbacksRef = useRef({ onDocumentSaved, onDraftChange, onRecoveryDraftChange, onDiscardDraftAndReload })
  const initialRecoveryRef = useRef({
    content: initialContent,
    clearStaleRecovery: Boolean(matchingRecoveryDraft && !hasRecoveredContent)
  })

  useEffect(() => {
    lockedRef.current = locked
    callbacksRef.current = { onDocumentSaved, onDraftChange, onRecoveryDraftChange, onDiscardDraftAndReload }
  }, [locked, onDiscardDraftAndReload, onDocumentSaved, onDraftChange, onRecoveryDraftChange])

  useEffect(() => {
    callbacksRef.current.onDraftChange(initialRecoveryRef.current.content)
    if (initialRecoveryRef.current.clearStaleRecovery) {
      callbacksRef.current.onRecoveryDraftChange(undefined)
    }
  }, [])

  const updateStatus = useCallback((nextStatus: WriterEditorStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const persistRecoveryDraft = useCallback(
    (nextContent: string, baseRevision: string, force = false) => {
      if (!force && statusRef.current !== 'conflict' && nextContent === persistedContentRef.current) {
        callbacksRef.current.onRecoveryDraftChange(undefined)
        setRecoveryError('')
        return
      }
      if (nextContent.length > WRITER_MAX_RECOVERY_DRAFT_CHARS) {
        setRecoveryError(t('writer.editor.recovery_too_large'))
        return
      }
      callbacksRef.current.onRecoveryDraftChange({
        rootPath,
        chapterId: documentRef.current.chapter.id,
        baseRevision,
        content: nextContent,
        updatedAt: new Date().toISOString()
      })
      setRecoveryError('')
    },
    [rootPath, t]
  )

  useLayoutEffect(() => {
    const previousDocument = documentRef.current
    const localContentIsPersisted = contentRef.current === persistedContentRef.current
    const hasExternalContentChange =
      document.chapter.revision !== previousDocument.chapter.revision ||
      document.content !== persistedContentRef.current

    if (localContentIsPersisted && hasExternalContentChange) {
      documentRef.current = document
      contentRef.current = document.content
      persistedContentRef.current = document.content
      draftBaseRevisionRef.current = document.chapter.revision
      setContent(document.content)
      setLastError('')
      setRecoveryError('')
      updateStatus('saved')
      callbacksRef.current.onDraftChange(document.content)
      callbacksRef.current.onRecoveryDraftChange(undefined)
    } else if (!localContentIsPersisted && hasExternalContentChange) {
      // Keep both the old base revision and the local draft. Adopting the new
      // revision here would let a later autosave overwrite the external write.
      updateStatus('conflict')
    } else {
      documentRef.current = document
    }
  }, [document, updateStatus])

  const saveCurrentContent = useCallback(async (): Promise<WriterChapterDocument | null> => {
    if (savePromiseRef.current) return savePromiseRef.current
    if (statusRef.current === 'conflict') return null
    if (contentRef.current === persistedContentRef.current) return documentRef.current

    const contentToSave = contentRef.current
    const documentToSave = documentRef.current
    updateStatus('saving')
    setLastError('')

    const pendingSave = ipcApi
      .request('writer.chapter.save', {
        rootPath,
        chapterId: documentToSave.chapter.id,
        content: contentToSave,
        expectedRevision: documentToSave.chapter.revision
      })
      .then((savedDocument) => {
        documentRef.current = savedDocument
        persistedContentRef.current = savedDocument.content
        draftBaseRevisionRef.current = savedDocument.chapter.revision
        callbacksRef.current.onDocumentSaved(savedDocument)

        if (contentRef.current === contentToSave) {
          contentRef.current = savedDocument.content
          setContent(savedDocument.content)
          callbacksRef.current.onDraftChange(savedDocument.content)
          callbacksRef.current.onRecoveryDraftChange(undefined)
          setRecoveryError('')
          updateStatus('saved')
        } else {
          persistRecoveryDraft(contentRef.current, savedDocument.chapter.revision)
          updateStatus('dirty')
        }
        return savedDocument
      })
      .catch((error: unknown) => {
        setLastError(formatErrorMessage(error))
        updateStatus(isWriterRevisionConflict(error) ? 'conflict' : 'error')
        return null
      })
      .finally(() => {
        savePromiseRef.current = null
      })

    savePromiseRef.current = pendingSave
    return pendingSave
  }, [persistRecoveryDraft, rootPath, updateStatus])

  const flush = useCallback(async (): Promise<WriterChapterDocument | null> => {
    let savedDocument: WriterChapterDocument | null = documentRef.current

    for (let attempt = 0; attempt < 3 && contentRef.current !== persistedContentRef.current; attempt += 1) {
      savedDocument = await saveCurrentContent()
      if (!savedDocument) return null
    }

    return contentRef.current === persistedContentRef.current ? savedDocument : null
  }, [saveCurrentContent])

  useImperativeHandle(
    controllerRef,
    () => ({
      flush,
      getDocument: () => documentRef.current
    }),
    [flush]
  )

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])
  useEffect(
    () => () => {
      void flushRef.current()
    },
    []
  )

  useEffect(() => {
    if (status !== 'dirty') return
    const timer = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [flush, status])

  const handleChange = useCallback(
    (nextContent: string) => {
      if (lockedRef.current) return
      contentRef.current = nextContent
      setContent(nextContent)
      setLastError('')
      callbacksRef.current.onDraftChange(nextContent)

      if (nextContent === persistedContentRef.current && statusRef.current !== 'conflict') {
        callbacksRef.current.onRecoveryDraftChange(undefined)
        setRecoveryError('')
        updateStatus('saved')
      } else if (statusRef.current !== 'conflict') {
        persistRecoveryDraft(nextContent, draftBaseRevisionRef.current)
        updateStatus('dirty')
      } else {
        persistRecoveryDraft(nextContent, draftBaseRevisionRef.current, true)
      }
    },
    [persistRecoveryDraft, updateStatus]
  )

  const copyDraft = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contentRef.current)
    } catch {
      setLastError(t('writer.editor.copy_failed'))
    }
  }, [t])

  const discardDraftAndReload = useCallback(async () => {
    setDiscarding(true)
    try {
      const latest = await callbacksRef.current.onDiscardDraftAndReload()
      if (!latest) return
      documentRef.current = latest
      contentRef.current = latest.content
      persistedContentRef.current = latest.content
      draftBaseRevisionRef.current = latest.chapter.revision
      setContent(latest.content)
      callbacksRef.current.onDraftChange(latest.content)
      callbacksRef.current.onRecoveryDraftChange(undefined)
      setLastError('')
      setRecoveryError('')
      updateStatus('saved')
      setDiscardDialogOpen(false)
    } finally {
      setDiscarding(false)
    }
  }, [updateStatus])

  const characterCount = countManuscriptCharacters(content)
  const statusLabel = t(WRITER_EDITOR_STATUS_LABEL_KEYS[status])
  const statusVariant = status === 'error' || status === 'conflict' ? 'destructive' : 'outline'

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-labelledby="writer-editor-heading">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
        <div className="min-w-0">
          <h2 id="writer-editor-heading" className="truncate font-medium text-sm">
            {document.chapter.title}
          </h2>
          <p className="text-muted-foreground text-xs">{t('writer.editor.characters', { count: characterCount })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusVariant} aria-label={statusLabel}>
            {status === 'saved' ? <Check className="size-3" aria-hidden /> : null}
            {status === 'conflict' ? <AlertTriangle className="size-3" aria-hidden /> : null}
            {statusLabel}
          </Badge>
          <Button
            data-ui="writer.history.open"
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('writer.history.open')}
            disabled={locked || status === 'conflict' || status === 'saving'}
            onClick={onOpenHistory}>
            <History className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.save')}
            disabled={locked || status === 'saved' || status === 'saving' || status === 'conflict'}
            onClick={() => void flush()}>
            <Save className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      {status === 'conflict' || lastError || recoveryError ? (
        <div
          role="alert"
          className="space-y-2 border-destructive/30 border-b bg-destructive/10 px-4 py-2 text-destructive text-xs">
          <p>{status === 'conflict' ? t('writer.editor.conflict_help') : lastError || recoveryError}</p>
          {status === 'conflict' && lastError ? <p>{lastError}</p> : null}
          {recoveryError && (status === 'conflict' || lastError) ? <p>{recoveryError}</p> : null}
          {status === 'conflict' || recoveryError ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void copyDraft()}>
                <Copy className="size-3.5" aria-hidden />
                {t('writer.editor.copy_draft')}
              </Button>
              {status === 'conflict' ? (
                <Button type="button" size="sm" variant="destructive" onClick={() => setDiscardDialogOpen(true)}>
                  <RefreshCw className="size-3.5" aria-hidden />
                  {t('writer.editor.discard_and_reload')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden [&_.cm-content]:px-5 [&_.cm-content]:py-4 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
        <Suspense
          fallback={
            <div role="status" className="flex h-full items-center justify-center text-muted-foreground text-sm">
              {t('common.loading')}
            </div>
          }>
          <CodeEditor
            value={content}
            language="markdown"
            editable={!locked}
            readOnly={locked}
            placeholder={t('writer.editor.placeholder')}
            onChange={handleChange}
            onSave={() => void flush()}
            onBlur={() => {
              if (statusRef.current !== 'conflict') void flush()
            }}
            expanded={false}
            height="100%"
            className="h-full"
            theme="none"
            options={{ keymap: true }}
          />
        </Suspense>
      </div>

      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        title={t('writer.editor.discard_title')}
        description={t('writer.editor.discard_description')}
        confirmText={t('writer.editor.discard_and_reload')}
        cancelText={t('common.cancel')}
        destructive
        confirmLoading={discarding}
        onConfirm={discardDraftAndReload}
      />
    </section>
  )
}
