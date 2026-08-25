import { application } from '@application'
import { isWriterStudioError } from '@main/features/writer'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type { writerRequestSchemas } from '@shared/ipc/schemas/writer'
import type { IpcHandlersFor } from '@shared/ipc/types'

async function exposeWriterError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isWriterStudioError(error)) {
      throw new IpcError(error.code, error.message, error.data)
    }
    throw error
  }
}

export const writerHandlers: IpcHandlersFor<typeof writerRequestSchemas> = {
  'writer.project.create': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').createProject(input)),
  'writer.project.open': async ({ rootPath }) =>
    exposeWriterError(() => application.get('WriterStudioService').openProject(rootPath)),
  'writer.chapter.create': async ({ rootPath, title }) =>
    exposeWriterError(() => application.get('WriterStudioService').createChapter(rootPath, title)),
  'writer.chapter.read': async ({ rootPath, chapterId }) =>
    exposeWriterError(() => application.get('WriterStudioService').readChapter(rootPath, chapterId)),
  'writer.chapter.save': async ({ rootPath, chapterId, content, expectedRevision }) =>
    exposeWriterError(() =>
      application.get('WriterStudioService').saveChapter(rootPath, chapterId, content, expectedRevision)
    ),
  'writer.story_bible.save': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').saveStoryBible(input)),
  'writer.outline.save': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').saveOutline(input)),
  'writer.continuity.save': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').saveContinuity(input)),
  'writer.continuity_review.read': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').readContinuityReview(input)),
  'writer.continuity_review.run': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').runContinuityReview(input)),
  'writer.continuity_review.waive': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').waiveContinuityFinding(input)),
  'writer.continuity_review.unwaive': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').unwaiveContinuityFinding(input)),
  'writer.continuity_review.coverage.update': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').updateContinuityCoverage(input)),
  'writer.generation.start': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').startGeneration(input)),
  'writer.generation.cancel': async ({ jobId }) =>
    exposeWriterError(() => application.get('WriterStudioService').cancelGeneration(jobId)),
  'writer.proposal.apply': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').applyProposal(input)),
  'writer.proposal.list': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').listProposals(input)),
  'writer.proposal.read': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').readProposal(input)),
  'writer.history.list': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').listHistory(input)),
  'writer.history.read': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').readHistory(input)),
  'writer.history.restore': async (input) =>
    exposeWriterError(() => application.get('WriterStudioService').restoreHistory(input))
}
