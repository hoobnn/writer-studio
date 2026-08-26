import type { WriterChapterDocument, WriterContextPacket, WriterOperation, WriterProject } from '@shared/types/writer'

import { compileWriterContext } from './writerContext'
import type { WriterProjectRepository } from './WriterProjectRepository'

interface CompileWriterProjectContextInput {
  repository: WriterProjectRepository
  project: WriterProject
  currentChapter: WriterChapterDocument
  instruction?: string
  operation: WriterOperation
  budgetChars: number
}

export async function compileWriterProjectContext({
  repository,
  project,
  currentChapter,
  instruction,
  operation,
  budgetChars
}: CompileWriterProjectContextInput): Promise<WriterContextPacket> {
  const recentMetadata = project.manifest.chapters
    .filter((chapter) => chapter.order < currentChapter.chapter.order)
    .toSorted((a, b) => b.order - a.order)
    .slice(0, 3)
  const recentChapters = await Promise.all(
    recentMetadata.map((chapter) => repository.readChapterFromProject(project, chapter.id))
  )
  return compileWriterContext({
    project,
    currentChapter,
    recentChapters,
    instruction,
    operation,
    budgetChars
  })
}
