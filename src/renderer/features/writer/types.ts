import type { WriterChapterDocument, WriterProjectCreateInput } from '@shared/types/writer'

export type WriterEditorStatus = 'dirty' | 'saving' | 'saved' | 'conflict' | 'error'

export interface WriterEditorController {
  flush: () => Promise<WriterChapterDocument | null>
  getDocument: () => WriterChapterDocument
}

export type CreateWriterProjectValues = WriterProjectCreateInput
