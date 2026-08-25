import type { WriterProjectDocumentRevisions } from '@shared/types/writer'

export function writerDocumentRevisionsEqual(
  left: WriterProjectDocumentRevisions | undefined,
  right: WriterProjectDocumentRevisions | undefined
): boolean {
  if (!left || !right) return false
  return left.storyBible === right.storyBible && left.outline === right.outline && left.continuity === right.continuity
}
