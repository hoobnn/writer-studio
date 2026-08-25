import { usePersistCache } from '@renderer/data/hooks/useCache'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { WriterRecoveryDraft } from '@shared/data/cache/cacheValueTypes'
import type {
  WriterChapterDocument,
  WriterProject,
  WriterProjectCreateInput,
  WriterProposalMode
} from '@shared/types/writer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WriterWelcome } from './components/WriterWelcome'
import { WriterWorkspace } from './components/WriterWorkspace'
import type { WriterProjectDocumentSaveRequest } from './projectDocuments'
import { getWriterActiveJobId, getWriterRecoveryDraft, setWriterActiveJobId, setWriterRecoveryDraft } from './recovery'
import { withChapterDocument } from './utils'

export function WriterPage() {
  const { t } = useTranslation()
  const [recentProjectRoot, setRecentProjectRoot] = usePersistCache('ui.writer.last_project_root')
  const [recoveryDrafts, setRecoveryDrafts] = usePersistCache('ui.writer.recovery_drafts')
  const [activeJobIds, setActiveJobIds] = usePersistCache('ui.writer.active_job_ids')
  const [project, setProject] = useState<WriterProject>()
  const [chapterDocument, setChapterDocument] = useState<WriterChapterDocument>()
  const [projectBusy, setProjectBusy] = useState(false)
  const [chapterLoading, setChapterLoading] = useState(false)
  const [chapterError, setChapterError] = useState('')
  const loadRequestIdRef = useRef(0)
  const autoOpenAttemptedRef = useRef(false)
  const userClosedProjectRef = useRef(false)

  const loadChapter = useCallback(
    async (rootPath: string, chapterId: string): Promise<WriterChapterDocument | null> => {
      const requestId = ++loadRequestIdRef.current
      setChapterLoading(true)
      setChapterError('')
      try {
        const document = await ipcApi.request('writer.chapter.read', { rootPath, chapterId })
        if (requestId !== loadRequestIdRef.current) return null
        setChapterDocument(document)
        setProject((current) => (current ? withChapterDocument(current, document) : current))
        return document
      } catch (error) {
        if (requestId !== loadRequestIdRef.current) return null
        setChapterDocument(undefined)
        setChapterError(formatErrorMessageWithPrefix(error, t('writer.errors.load_chapter')))
        return null
      } finally {
        if (requestId === loadRequestIdRef.current) setChapterLoading(false)
      }
    },
    [t]
  )

  const enterProject = useCallback(
    async (nextProject: WriterProject) => {
      userClosedProjectRef.current = false
      setProject(nextProject)
      setRecentProjectRoot(nextProject.rootPath)
      setChapterDocument(undefined)
      await loadChapter(nextProject.rootPath, nextProject.manifest.activeChapterId)
    },
    [loadChapter, setRecentProjectRoot]
  )

  const createProject = useCallback(
    async (values: WriterProjectCreateInput) => {
      setProjectBusy(true)
      try {
        const createdProject = await ipcApi.request('writer.project.create', {
          ...values,
          initialChapterTitle: t('writer.chapter.default_title', { number: 1 })
        })
        await enterProject(createdProject)
      } finally {
        setProjectBusy(false)
      }
    },
    [enterProject, t]
  )

  const openProject = useCallback(
    async (rootPath: string) => {
      setProjectBusy(true)
      try {
        const openedProject = await ipcApi.request('writer.project.open', { rootPath })
        await enterProject(openedProject)
      } finally {
        setProjectBusy(false)
      }
    },
    [enterProject]
  )

  useEffect(() => {
    if (autoOpenAttemptedRef.current || userClosedProjectRef.current || project || !recentProjectRoot) {
      return
    }

    autoOpenAttemptedRef.current = true
    void openProject(recentProjectRoot).catch(() => undefined)
  }, [openProject, project, recentProjectRoot])

  const selectChapter = useCallback(
    async (chapterId: string) => {
      if (!project) return
      await loadChapter(project.rootPath, chapterId)
    },
    [loadChapter, project]
  )

  const createChapter = useCallback(async () => {
    if (!project) return
    const requestId = ++loadRequestIdRef.current
    setChapterLoading(true)
    setChapterError('')
    try {
      const nextChapterNumber = Math.max(...project.manifest.chapters.map((chapter) => chapter.order)) + 2
      const document = await ipcApi.request('writer.chapter.create', {
        rootPath: project.rootPath,
        title: t('writer.chapter.default_title', { number: nextChapterNumber })
      })
      if (requestId !== loadRequestIdRef.current) return
      setChapterDocument(document)
      setProject((current) => (current ? withChapterDocument(current, document) : current))
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return
      setChapterError(formatErrorMessageWithPrefix(error, t('writer.errors.create_chapter')))
    } finally {
      if (requestId === loadRequestIdRef.current) setChapterLoading(false)
    }
  }, [project, t])

  const reloadChapter = useCallback(async (): Promise<WriterChapterDocument | null> => {
    if (!project) return null
    const chapterId = chapterDocument?.chapter.id ?? project.manifest.activeChapterId
    return await loadChapter(project.rootPath, chapterId)
  }, [chapterDocument?.chapter.id, loadChapter, project])

  const documentSaved = useCallback((savedDocument: WriterChapterDocument) => {
    setChapterDocument(savedDocument)
    setProject((current) => (current ? withChapterDocument(current, savedDocument) : current))
  }, [])

  const projectUpdated = useCallback((updatedProject: WriterProject) => {
    setProject(updatedProject)
  }, [])

  const saveProjectDocument = useCallback(
    async (request: WriterProjectDocumentSaveRequest): Promise<WriterProject> => {
      if (!project) throw new Error(t('writer.documents.errors.save_failed'))

      switch (request.kind) {
        case 'storyBible':
          return await ipcApi.request('writer.story_bible.save', {
            rootPath: project.rootPath,
            storyBible: request.document,
            expectedRevision: request.expectedRevision
          })
        case 'outline':
          return await ipcApi.request('writer.outline.save', {
            rootPath: project.rootPath,
            outline: request.document,
            expectedRevision: request.expectedRevision
          })
        case 'continuity':
          return await ipcApi.request('writer.continuity.save', {
            rootPath: project.rootPath,
            continuity: request.document,
            expectedRevision: request.expectedRevision
          })
      }
    },
    [project, t]
  )

  const applyProposal = useCallback(
    async (proposalId: string, mode: WriterProposalMode, expectedRevision: string) => {
      if (!project) return
      const appliedDocument = await ipcApi.request('writer.proposal.apply', {
        rootPath: project.rootPath,
        proposalId,
        mode,
        expectedRevision
      })
      setChapterDocument(appliedDocument)
      setProject((current) => (current ? withChapterDocument(current, appliedDocument) : current))
    },
    [project]
  )

  const closeProject = useCallback(async () => {
    userClosedProjectRef.current = true
    loadRequestIdRef.current += 1
    setProject(undefined)
    setChapterDocument(undefined)
    setChapterError('')
  }, [])

  const updateRecoveryDraft = useCallback(
    (rootPath: string, chapterId: string, draft: WriterRecoveryDraft | undefined) => {
      setRecoveryDrafts((current) => setWriterRecoveryDraft(current, draft, rootPath, chapterId))
    },
    [setRecoveryDrafts]
  )

  const updateActiveJobId = useCallback(
    (rootPath: string, chapterId: string, jobId: string | undefined) => {
      setActiveJobIds((current) => setWriterActiveJobId(current, jobId, rootPath, chapterId))
    },
    [setActiveJobIds]
  )

  if (!project) {
    return (
      <WriterWelcome
        busy={projectBusy}
        recentProjectRoot={recentProjectRoot ?? undefined}
        onCreate={createProject}
        onOpen={openProject}
      />
    )
  }

  return (
    <WriterWorkspace
      project={project}
      chapterDocument={chapterDocument}
      chapterLoading={chapterLoading}
      chapterError={chapterError || undefined}
      onSelectChapter={selectChapter}
      onCreateChapter={createChapter}
      onReloadChapter={reloadChapter}
      onCloseProject={closeProject}
      onDocumentSaved={documentSaved}
      onProjectUpdated={projectUpdated}
      onSaveProjectDocument={saveProjectDocument}
      onApplyProposal={applyProposal}
      recoveryDraft={
        chapterDocument
          ? getWriterRecoveryDraft(recoveryDrafts, project.rootPath, chapterDocument.chapter.id)
          : undefined
      }
      activeJobId={
        chapterDocument ? getWriterActiveJobId(activeJobIds, project.rootPath, chapterDocument.chapter.id) : undefined
      }
      onRecoveryDraftChange={updateRecoveryDraft}
      onActiveJobIdChange={updateActiveJobId}
    />
  )
}
