import { writerErrorCodes } from '@shared/ipc/errors/writer'
import type {
  WriterChapterDocument,
  WriterChapterMetadata,
  WriterOperation,
  WriterProject,
  WriterProposalMode
} from '@shared/types/writer'

const NO_APPLY_MODES: readonly WriterProposalMode[] = []
const REPLACE_APPLY_MODE: readonly WriterProposalMode[] = ['replace']
const APPEND_APPLY_MODE: readonly WriterProposalMode[] = ['append']

export function countManuscriptCharacters(content: string): number {
  return content.replace(/\s/g, '').length
}

export function withChapterMetadata(project: WriterProject, chapter: WriterChapterMetadata): WriterProject {
  const chapterExists = project.manifest.chapters.some((candidate) => candidate.id === chapter.id)
  const chapters = chapterExists
    ? project.manifest.chapters.map((candidate) => (candidate.id === chapter.id ? chapter : candidate))
    : [...project.manifest.chapters, chapter].sort((a, b) => a.order - b.order)

  return {
    ...project,
    manifest: {
      ...project.manifest,
      activeChapterId: chapter.id,
      chapters
    }
  }
}

export function withChapterDocument(project: WriterProject, document: WriterChapterDocument): WriterProject {
  return withChapterMetadata(project, document.chapter)
}

export function isWriterRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return 'code' in error && error.code === writerErrorCodes.REVISION_CONFLICT
}

export function getProposalApplyModes(operation: WriterOperation): readonly WriterProposalMode[] {
  if (operation === 'draft' || operation === 'rewrite') return REPLACE_APPLY_MODE
  if (operation === 'continue') return APPEND_APPLY_MODE
  return NO_APPLY_MODES
}
