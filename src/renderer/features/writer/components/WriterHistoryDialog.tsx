import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WriterChapterDocument, WriterHistorySnapshot, WriterHistorySummary } from '@shared/types/writer'
import { Clock3, History, LoaderCircle, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isWriterRevisionConflict } from '../utils'
import { WriterLineDiff } from './WriterProposalDiff'

const CodeEditor = lazy(() => import('@cherrystudio/ui/components/composites/code-editor'))

interface WriterHistoryDialogProps {
  document: WriterChapterDocument
  onClose: () => void
  onRestored: (document: WriterChapterDocument) => void
  rootPath: string
}

export function WriterHistoryDialog({ document, onClose, onRestored, rootPath }: WriterHistoryDialogProps) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<WriterHistorySummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selectedSnapshot, setSelectedSnapshot] = useState<WriterHistorySnapshot>()
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState('')
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const listRequestIdRef = useRef(0)
  const readRequestIdRef = useRef(0)
  const restoreRequestIdRef = useRef(0)
  const documentRef = useRef(document)

  useEffect(() => {
    documentRef.current = document
  }, [document])

  const loadHistory = useCallback(async () => {
    const requestId = ++listRequestIdRef.current
    setListLoading(true)
    setListError('')
    try {
      const result = await ipcApi.request('writer.history.list', {
        rootPath,
        chapterId: document.chapter.id,
        limit: 50
      })
      if (requestId !== listRequestIdRef.current) return
      setHistory(result.history)
    } catch (error) {
      if (requestId !== listRequestIdRef.current) return
      setListError(formatErrorMessageWithPrefix(error, t('writer.history.errors.list_failed')))
    } finally {
      if (requestId === listRequestIdRef.current) setListLoading(false)
    }
  }, [document.chapter.id, rootPath, t])

  useEffect(() => {
    void loadHistory()
    return () => {
      listRequestIdRef.current += 1
      readRequestIdRef.current += 1
      restoreRequestIdRef.current += 1
    }
  }, [loadHistory])

  const readSnapshot = useCallback(
    async (summary: WriterHistorySummary) => {
      const requestId = ++readRequestIdRef.current
      setSnapshotLoading(true)
      setSnapshotError('')
      setRestoreError('')
      try {
        const snapshot = await ipcApi.request('writer.history.read', {
          rootPath,
          chapterId: document.chapter.id,
          fileName: summary.fileName
        })
        if (requestId !== readRequestIdRef.current) return
        setSelectedSnapshot(snapshot)
      } catch (error) {
        if (requestId !== readRequestIdRef.current) return
        setSnapshotError(formatErrorMessageWithPrefix(error, t('writer.history.errors.read_failed')))
      } finally {
        if (requestId === readRequestIdRef.current) setSnapshotLoading(false)
      }
    },
    [document.chapter.id, rootPath, t]
  )

  const restoreSnapshot = useCallback(async () => {
    if (!selectedSnapshot) return
    const requestId = ++restoreRequestIdRef.current
    setRestoring(true)
    setRestoreError('')
    try {
      const restored = await ipcApi.request('writer.history.restore', {
        rootPath,
        chapterId: documentRef.current.chapter.id,
        fileName: selectedSnapshot.fileName,
        expectedRevision: documentRef.current.chapter.revision
      })
      if (requestId !== restoreRequestIdRef.current) return
      onRestored(restored)
      onClose()
    } catch (error) {
      if (requestId !== restoreRequestIdRef.current) return
      setRestoreError(
        isWriterRevisionConflict(error)
          ? t('writer.history.errors.conflict')
          : formatErrorMessageWithPrefix(error, t('writer.history.errors.restore_failed'))
      )
    } finally {
      if (requestId === restoreRequestIdRef.current) setRestoring(false)
    }
  }, [onClose, onRestored, rootPath, selectedSnapshot, t])

  const closeDialog = useCallback(() => {
    if (restoring) return
    listRequestIdRef.current += 1
    readRequestIdRef.current += 1
    restoreRequestIdRef.current += 1
    onClose()
  }, [onClose, restoring])

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeDialog()
    },
    [closeDialog]
  )

  return (
    <>
      <Dialog open onOpenChange={handleDialogOpenChange}>
        <DialogContent
          data-ui="writer.history.dialog"
          size="xl"
          closeOnOverlayClick={false}
          className="grid h-[min(760px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary" aria-hidden />
              {t('writer.history.title')}
            </DialogTitle>
            <DialogDescription>
              {t('writer.history.description', { chapter: document.chapter.title })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-[14rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-border">
            <aside className="min-h-0 overflow-y-auto border-border border-r bg-background-subtle p-2">
              {listLoading ? (
                <p role="status" className="flex items-center gap-1.5 p-2 text-muted-foreground text-xs">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  {t('common.loading')}
                </p>
              ) : listError ? (
                <div className="space-y-2 p-2">
                  <p role="alert" className="text-destructive text-xs">
                    {listError}
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadHistory()}>
                    {t('common.retry')}
                  </Button>
                </div>
              ) : history.length === 0 ? (
                <p className="p-2 text-muted-foreground text-xs">{t('writer.history.empty')}</p>
              ) : (
                <ul className="space-y-1">
                  {history.map((summary) => (
                    <li key={summary.fileName}>
                      <button
                        data-ui="writer.history.read"
                        type="button"
                        aria-pressed={selectedSnapshot?.fileName === summary.fileName}
                        disabled={restoring}
                        onClick={() => void readSnapshot(summary)}
                        className="w-full rounded-md border border-transparent px-2 py-2 text-left hover:bg-accent aria-pressed:border-border aria-pressed:bg-accent">
                        <time dateTime={summary.createdAt} className="block text-xs">
                          {new Date(summary.createdAt).toLocaleString()}
                        </time>
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                          {t('writer.history.characters', { count: summary.characterCount })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <section className="min-h-0 overflow-y-auto p-3">
              {snapshotLoading ? (
                <p
                  role="status"
                  className="flex h-full items-center justify-center gap-1.5 text-muted-foreground text-sm">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  {t('common.loading')}
                </p>
              ) : snapshotError ? (
                <p role="alert" className="text-destructive text-sm">
                  {snapshotError}
                </p>
              ) : selectedSnapshot ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                    <Badge variant="outline">
                      <Clock3 className="size-3" aria-hidden />
                      {new Date(selectedSnapshot.createdAt).toLocaleString()}
                    </Badge>
                    <span>{t('writer.history.characters', { count: selectedSnapshot.characterCount })}</span>
                  </div>

                  <WriterLineDiff
                    beforeContent={document.content}
                    afterContent={selectedSnapshot.content}
                    headingId="writer-history-diff-heading"
                    title={t('writer.history.diff')}
                    truncatedLabel={t('writer.copilot.diff_truncated')}
                  />

                  <div className="overflow-hidden rounded-md border border-border [&_.cm-scroller]:overflow-auto">
                    <Suspense
                      fallback={
                        <p role="status" className="p-4 text-muted-foreground text-sm">
                          {t('common.loading')}
                        </p>
                      }>
                      <CodeEditor
                        value={selectedSnapshot.content}
                        language="markdown"
                        editable={false}
                        readOnly
                        expanded={false}
                        height="18rem"
                        theme="none"
                      />
                    </Suspense>
                  </div>
                </div>
              ) : (
                <p className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  {t('writer.history.select_snapshot')}
                </p>
              )}

              {restoreError ? (
                <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {restoreError}
                </p>
              ) : null}
            </section>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={restoring} onClick={closeDialog}>
              {t('common.close')}
            </Button>
            <Button
              data-ui="writer.history.restore"
              type="button"
              disabled={!selectedSnapshot || restoring}
              loading={restoring}
              onClick={() => setRestoreConfirmOpen(true)}>
              <RotateCcw className="size-4" aria-hidden />
              {t('writer.history.restore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={restoreConfirmOpen}
        onOpenChange={setRestoreConfirmOpen}
        title={t('writer.history.restore_confirm.title')}
        description={t('writer.history.restore_confirm.description')}
        confirmText={t('writer.history.restore_confirm.confirm')}
        cancelText={t('common.cancel')}
        destructive
        confirmLoading={restoring}
        onConfirm={restoreSnapshot}
      />
    </>
  )
}
