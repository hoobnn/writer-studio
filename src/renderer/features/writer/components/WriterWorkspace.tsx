import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, Spinner } from '@cherrystudio/ui'
import type { WriterRecoveryDraft } from '@shared/data/cache/cacheValueTypes'
import type { WriterChapterDocument, WriterProject, WriterProposalMode } from '@shared/types/writer'
import { FilePlus2, FolderOpen, Plus, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WriterProjectDocumentSaveRequest } from '../projectDocuments'
import type { WriterEditorController } from '../types'
import { WriterCopilot } from './WriterCopilot'
import { WriterEditorPane } from './WriterEditorPane'
import { WriterMemorySummary } from './WriterMemorySummary'

const WriterProjectDocumentsDialog = lazy(() =>
  import('./WriterProjectDocumentsDialog').then((module) => ({ default: module.WriterProjectDocumentsDialog }))
)
const WriterHistoryDialog = lazy(() =>
  import('./WriterHistoryDialog').then((module) => ({ default: module.WriterHistoryDialog }))
)
const WriterLorebookDialog = lazy(() =>
  import('./WriterLorebookDialog').then((module) => ({ default: module.WriterLorebookDialog }))
)
const WriterContinuityReviewDialog = lazy(() =>
  import('./WriterContinuityReviewDialog').then((module) => ({ default: module.WriterContinuityReviewDialog }))
)

interface WriterWorkspaceProps {
  project: WriterProject
  chapterDocument?: WriterChapterDocument
  chapterLoading: boolean
  chapterError?: string
  onSelectChapter: (chapterId: string) => Promise<void>
  onCreateChapter: () => Promise<void>
  onReloadChapter: () => Promise<WriterChapterDocument | null>
  onCloseProject: () => Promise<void>
  onDocumentSaved: (document: WriterChapterDocument) => void
  onProjectUpdated: (project: WriterProject) => void
  onSaveProjectDocument: (request: WriterProjectDocumentSaveRequest) => Promise<WriterProject>
  onApplyProposal: (proposalId: string, mode: WriterProposalMode, expectedRevision: string) => Promise<void>
  recoveryDraft?: WriterRecoveryDraft
  activeJobId?: string
  onRecoveryDraftChange: (rootPath: string, chapterId: string, draft: WriterRecoveryDraft | undefined) => void
  onActiveJobIdChange: (rootPath: string, chapterId: string, jobId: string | undefined) => void
}

export function WriterWorkspace({
  project,
  chapterDocument,
  chapterLoading,
  chapterError,
  onSelectChapter,
  onCreateChapter,
  onReloadChapter,
  onCloseProject,
  onDocumentSaved,
  onProjectUpdated,
  onSaveProjectDocument,
  onApplyProposal,
  recoveryDraft,
  activeJobId,
  onRecoveryDraftChange,
  onActiveJobIdChange
}: WriterWorkspaceProps) {
  const { t } = useTranslation()
  const editorControllerRef = useRef<WriterEditorController | null>(null)
  const [draftContent, setDraftContent] = useState(chapterDocument?.content ?? '')
  const [editorLocked, setEditorLocked] = useState(false)
  const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false)
  const [lorebookDialogOpen, setLorebookDialogOpen] = useState(false)
  const [continuityReviewDialogOpen, setContinuityReviewDialogOpen] = useState(false)
  const [historyDocument, setHistoryDocument] = useState<WriterChapterDocument>()
  const draftChapterIdRef = useRef(chapterDocument?.chapter.id)
  const historyOpenRequestIdRef = useRef(0)
  const orderedChapters = [...project.manifest.chapters].sort((a, b) => a.order - b.order)

  useEffect(() => {
    if (draftChapterIdRef.current === chapterDocument?.chapter.id) return
    draftChapterIdRef.current = chapterDocument?.chapter.id
    historyOpenRequestIdRef.current += 1
    setHistoryDocument(undefined)
    setDraftContent(chapterDocument?.content ?? '')
  }, [chapterDocument?.chapter.id, chapterDocument?.content])

  const flushEditor = useCallback(async () => {
    if (!chapterDocument) return null
    return editorControllerRef.current?.flush() ?? chapterDocument
  }, [chapterDocument])

  const selectChapter = async (chapterId: string) => {
    if (chapterId === chapterDocument?.chapter.id || chapterLoading || editorLocked) return
    if (chapterDocument && !(await flushEditor())) return
    await onSelectChapter(chapterId)
  }

  const createChapter = async () => {
    if (editorLocked) return
    if (chapterDocument && !(await flushEditor())) return
    await onCreateChapter()
  }

  const closeProject = async () => {
    if (editorLocked) return
    if (chapterDocument && !(await flushEditor())) return
    await onCloseProject()
  }

  const applyProposal = async (proposalId: string, mode: WriterProposalMode) => {
    const latestDocument = await flushEditor()
    if (!latestDocument) throw new Error(t('writer.errors.save_chapter'))
    await onApplyProposal(proposalId, mode, latestDocument.chapter.revision)
  }

  const beforeGeneration = async () => {
    if (!chapterDocument) return true
    return Boolean(await flushEditor())
  }

  const openDocumentsDialog = useCallback(() => setDocumentsDialogOpen(true), [])
  const closeDocumentsDialog = useCallback(() => setDocumentsDialogOpen(false), [])
  const openLorebookDialog = useCallback(() => setLorebookDialogOpen(true), [])
  const closeLorebookDialog = useCallback(() => setLorebookDialogOpen(false), [])
  const openContinuityReviewDialog = useCallback(() => setContinuityReviewDialogOpen(true), [])
  const closeContinuityReviewDialog = useCallback(() => setContinuityReviewDialogOpen(false), [])
  const openHistory = useCallback(() => {
    if (!chapterDocument || editorLocked) return
    const requestId = ++historyOpenRequestIdRef.current
    const chapterId = chapterDocument.chapter.id
    void flushEditor().then((latestDocument) => {
      if (requestId === historyOpenRequestIdRef.current && latestDocument && latestDocument.chapter.id === chapterId) {
        setHistoryDocument(latestDocument)
      }
    })
  }, [chapterDocument, editorLocked, flushEditor])
  const closeHistory = useCallback(() => {
    historyOpenRequestIdRef.current += 1
    setHistoryDocument(undefined)
  }, [])
  const handleHistoryRestored = useCallback(
    (restoredDocument: WriterChapterDocument) => {
      onDocumentSaved(restoredDocument)
      setDraftContent(restoredDocument.content)
      onRecoveryDraftChange(project.rootPath, restoredDocument.chapter.id, undefined)
      setHistoryDocument(undefined)
    },
    [onDocumentSaved, onRecoveryDraftChange, project.rootPath]
  )

  return (
    <main data-ui="writer.view" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-border border-b px-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-sm">{project.manifest.title}</h1>
          <p className="truncate text-[11px] text-muted-foreground" title={project.rootPath}>
            {t('writer.workspace.project_path')}: {project.rootPath}
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('writer.workspace.close_project')}
          disabled={editorLocked}
          onClick={() => void closeProject()}>
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <ResizablePanelGroup direction="horizontal" className="min-h-[520px] min-w-[900px]">
          <ResizablePanel id="writer-chapters" defaultSize={22} minSize={16}>
            <aside
              className="flex h-full min-h-0 flex-col bg-background-subtle"
              aria-labelledby="writer-chapters-heading">
              <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-border border-b px-3">
                <h2 id="writer-chapters-heading" className="font-medium text-xs uppercase tracking-wide">
                  {t('writer.workspace.chapters')}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('writer.workspace.new_chapter')}
                  disabled={chapterLoading || editorLocked}
                  onClick={() => void createChapter()}>
                  <Plus className="size-4" aria-hidden />
                </Button>
              </div>

              <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label={t('writer.workspace.chapters')}>
                {orderedChapters.length ? (
                  <ul className="space-y-1">
                    {orderedChapters.map((chapter) => {
                      const active = chapter.id === chapterDocument?.chapter.id
                      return (
                        <li key={chapter.id}>
                          <button
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            disabled={chapterLoading || editorLocked}
                            onClick={() => void selectChapter(chapter.id)}
                            className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                              active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                            }`}>
                            <span className="w-6 shrink-0 text-right text-xs tabular-nums opacity-60">
                              {chapter.order + 1}
                            </span>
                            <span className="truncate">{chapter.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                    <FolderOpen className="size-8 text-muted-foreground" aria-hidden />
                    <p className="text-muted-foreground text-xs leading-5">{t('writer.workspace.no_chapters')}</p>
                    <Button type="button" size="sm" onClick={() => void createChapter()}>
                      <FilePlus2 className="size-4" aria-hidden />
                      {t('writer.workspace.new_chapter')}
                    </Button>
                  </div>
                )}
              </nav>

              <WriterMemorySummary
                project={project}
                onManageDocuments={openDocumentsDialog}
                onManageLorebook={openLorebookDialog}
                onReviewContinuity={openContinuityReviewDialog}
              />
            </aside>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="writer-manuscript" defaultSize={50} minSize={32}>
            {chapterLoading ? (
              <div className="flex h-full items-center justify-center" role="status">
                <Spinner text={t('writer.workspace.loading_chapter')} />
              </div>
            ) : chapterError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p role="alert" className="max-w-md text-destructive text-sm">
                  {chapterError}
                </p>
                <Button type="button" variant="outline" onClick={() => void onReloadChapter()}>
                  {t('common.retry')}
                </Button>
              </div>
            ) : chapterDocument ? (
              <WriterEditorPane
                key={`${project.rootPath}:${chapterDocument.chapter.id}`}
                controllerRef={editorControllerRef}
                document={chapterDocument}
                rootPath={project.rootPath}
                recoveryDraft={recoveryDraft}
                locked={editorLocked}
                onDocumentSaved={onDocumentSaved}
                onDraftChange={setDraftContent}
                onOpenHistory={openHistory}
                onRecoveryDraftChange={(draft) =>
                  onRecoveryDraftChange(project.rootPath, chapterDocument.chapter.id, draft)
                }
                onDiscardDraftAndReload={onReloadChapter}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <FilePlus2 className="size-10 text-muted-foreground" aria-hidden />
                <p className="text-muted-foreground text-sm">{t('writer.workspace.no_chapters')}</p>
                <Button type="button" onClick={() => void createChapter()}>
                  {t('writer.workspace.new_chapter')}
                </Button>
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="writer-copilot" defaultSize={28} minSize={22}>
            <WriterCopilot
              key={chapterDocument?.chapter.id ?? 'writer-no-chapter'}
              project={project}
              chapterId={chapterDocument?.chapter.id}
              currentContent={draftContent}
              initialActiveJobId={activeJobId}
              onBeforeGeneration={beforeGeneration}
              onApplyProposal={applyProposal}
              onApplyingChange={setEditorLocked}
              onActiveJobIdChange={(jobId) => {
                if (!chapterDocument) return
                onActiveJobIdChange(project.rootPath, chapterDocument.chapter.id, jobId)
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {documentsDialogOpen ? (
        <Suspense fallback={<span className="sr-only">{t('common.loading')}</span>}>
          <WriterProjectDocumentsDialog
            project={project}
            onClose={closeDocumentsDialog}
            onProjectUpdated={onProjectUpdated}
            onSaveDocument={onSaveProjectDocument}
          />
        </Suspense>
      ) : null}

      {historyDocument ? (
        <Suspense fallback={<span className="sr-only">{t('common.loading')}</span>}>
          <WriterHistoryDialog
            rootPath={project.rootPath}
            document={historyDocument}
            onClose={closeHistory}
            onRestored={handleHistoryRestored}
          />
        </Suspense>
      ) : null}

      {lorebookDialogOpen ? (
        <Suspense fallback={<span className="sr-only">{t('common.loading')}</span>}>
          <WriterLorebookDialog
            project={project}
            onClose={closeLorebookDialog}
            onProjectUpdated={onProjectUpdated}
            onSaveDocument={onSaveProjectDocument}
          />
        </Suspense>
      ) : null}

      {continuityReviewDialogOpen ? (
        <Suspense fallback={<span className="sr-only">{t('common.loading')}</span>}>
          <WriterContinuityReviewDialog
            project={project}
            targetChapterId={chapterDocument?.chapter.id}
            onClose={closeContinuityReviewDialog}
          />
        </Suspense>
      ) : null}
    </main>
  )
}
