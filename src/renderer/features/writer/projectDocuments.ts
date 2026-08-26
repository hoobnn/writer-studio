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

/**
 * Lenient pre-check used while a studio form is open: keeps the form rendered
 * through transient invalid states. Full zod validation still gates saving.
 */
export function parseStoryBibleDraft(source: string): WriterStoryBible | undefined {
  try {
    const value = JSON.parse(source) as Partial<WriterStoryBible>
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.hardRules) ||
      !Array.isArray(value.themes) ||
      !Array.isArray(value.characters) ||
      !Array.isArray(value.loreEntries) ||
      !Array.isArray(value.worldRules) ||
      !Array.isArray(value.styleGuide)
    ) {
      return undefined
    }
    return value as WriterStoryBible
  } catch {
    return undefined
  }
}

export function parseOutlineDraft(source: string): WriterOutline | undefined {
  try {
    const value = JSON.parse(source) as Partial<WriterOutline>
    if (
      value.schemaVersion !== 1 ||
      typeof value.bookSummary !== 'string' ||
      !Array.isArray(value.arcs) ||
      !Array.isArray(value.chapterPlans)
    ) {
      return undefined
    }
    return value as WriterOutline
  } catch {
    return undefined
  }
}

export function parseContinuityDraft(source: string): WriterContinuityLedger | undefined {
  try {
    const value = JSON.parse(source) as Partial<WriterContinuityLedger>
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.facts) ||
      !Array.isArray(value.foreshadowing) ||
      !Array.isArray(value.chapterSummaries) ||
      (value.timelineEvents !== undefined && !Array.isArray(value.timelineEvents)) ||
      (value.characterStates !== undefined && !Array.isArray(value.characterStates))
    ) {
      return undefined
    }
    return value as WriterContinuityLedger
  } catch {
    return undefined
  }
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
