import type { WriterContinuityLedger, WriterOutline, WriterProject, WriterStoryBible } from '@shared/types/writer'
import { WriterContinuityLedgerSchema, WriterOutlineSchema, WriterStoryBibleSchema } from '@shared/types/writer'

export const WRITER_PROJECT_DOCUMENT_KINDS = ['storyBible', 'outline', 'continuity'] as const
export type WriterProjectDocumentKind = (typeof WRITER_PROJECT_DOCUMENT_KINDS)[number]

export type ValidatedWriterProjectDocument =
  | { kind: 'storyBible'; document: WriterStoryBible }
  | { kind: 'outline'; document: WriterOutline }
  | { kind: 'continuity'; document: WriterContinuityLedger }

export type WriterProjectDocumentSaveRequest = ValidatedWriterProjectDocument & {
  expectedRevision: string
}

export type WriterProjectDocumentValidation =
  | { ok: true; value: ValidatedWriterProjectDocument }
  | { ok: false; reason: 'invalid_json' | 'invalid_schema'; details?: string }

export function formatWriterProjectDocument(project: WriterProject, kind: WriterProjectDocumentKind): string {
  return JSON.stringify(project[kind], null, 2)
}

export function validateWriterProjectDocument(
  kind: WriterProjectDocumentKind,
  source: string
): WriterProjectDocumentValidation {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(source)
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }

  switch (kind) {
    case 'storyBible':
      return toValidationResult(kind, WriterStoryBibleSchema.safeParse(parsedJson))
    case 'outline':
      return toValidationResult(kind, WriterOutlineSchema.safeParse(parsedJson))
    case 'continuity':
      return toValidationResult(kind, WriterContinuityLedgerSchema.safeParse(parsedJson))
  }
}

function toValidationResult<Kind extends WriterProjectDocumentKind, Document>(
  kind: Kind,
  result:
    | { success: true; data: Document }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }
): WriterProjectDocumentValidation {
  if (result.success) {
    return { ok: true, value: { kind, document: result.data } as ValidatedWriterProjectDocument }
  }

  const details = result.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join('.') || '$'}: ${issue.message}`)
    .join('; ')
  return { ok: false, reason: 'invalid_schema', ...(details ? { details } : {}) }
}
