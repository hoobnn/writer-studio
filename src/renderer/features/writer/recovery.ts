import type {
  WriterActiveJobMap,
  WriterRecoveryDraft,
  WriterRecoveryDraftMap
} from '@shared/data/cache/cacheValueTypes'

export const WRITER_MAX_RECOVERY_DRAFTS = 20
export const WRITER_MAX_ACTIVE_JOBS = 50
export const WRITER_MAX_RECOVERY_DRAFT_CHARS = 1_000_000
export const WRITER_MAX_RECOVERY_TOTAL_CHARS = 1_000_000

function newestEntries<T>(entries: Array<[string, T]>, limit: number, updatedAt: (value: T) => string) {
  return entries
    .map((entry, insertionIndex) => ({ entry, insertionIndex }))
    .sort(
      (a, b) =>
        Date.parse(updatedAt(b.entry[1])) - Date.parse(updatedAt(a.entry[1])) || b.insertionIndex - a.insertionIndex
    )
    .slice(0, limit)
    .map(({ entry }) => entry)
}

export function writerChapterCacheKey(rootPath: string, chapterId: string): string {
  return JSON.stringify([rootPath, chapterId])
}

export function getWriterRecoveryDraft(
  drafts: WriterRecoveryDraftMap,
  rootPath: string,
  chapterId: string
): WriterRecoveryDraft | undefined {
  return drafts[writerChapterCacheKey(rootPath, chapterId)]
}

export function setWriterRecoveryDraft(
  drafts: WriterRecoveryDraftMap,
  draft: WriterRecoveryDraft | undefined,
  rootPath: string,
  chapterId: string
): WriterRecoveryDraftMap {
  const key = writerChapterCacheKey(rootPath, chapterId)
  if (draft) {
    if (draft.content.length > WRITER_MAX_RECOVERY_DRAFT_CHARS) return drafts
    const next = { ...drafts }
    delete next[key]
    next[key] = draft
    const newest = newestEntries(Object.entries(next), WRITER_MAX_RECOVERY_DRAFTS, (value) => value.updatedAt)
    let retainedChars = 0
    return Object.fromEntries(
      newest.filter(([, value]) => {
        if (retainedChars + value.content.length > WRITER_MAX_RECOVERY_TOTAL_CHARS) return false
        retainedChars += value.content.length
        return true
      })
    )
  }
  if (!(key in drafts)) return drafts

  const next = { ...drafts }
  delete next[key]
  return next
}

export function getWriterActiveJobId(
  jobs: WriterActiveJobMap,
  rootPath: string,
  chapterId: string
): string | undefined {
  const entry = jobs[writerChapterCacheKey(rootPath, chapterId)]
  return typeof entry === 'string' ? entry : entry?.jobId
}

export function setWriterActiveJobId(
  jobs: WriterActiveJobMap,
  jobId: string | undefined,
  rootPath: string,
  chapterId: string
): WriterActiveJobMap {
  const key = writerChapterCacheKey(rootPath, chapterId)
  if (jobId) {
    const next = { ...jobs }
    delete next[key]
    next[key] = { jobId, updatedAt: new Date().toISOString() }
    return Object.fromEntries(newestEntries(Object.entries(next), WRITER_MAX_ACTIVE_JOBS, (value) => value.updatedAt))
  }
  if (!(key in jobs)) return jobs

  const next = { ...jobs }
  delete next[key]
  return next
}
