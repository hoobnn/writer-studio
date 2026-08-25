import type { WriterRecoveryDraftMap } from '@shared/data/cache/cacheValueTypes'
import { describe, expect, it } from 'vitest'

import {
  getWriterActiveJobId,
  getWriterRecoveryDraft,
  setWriterActiveJobId,
  setWriterRecoveryDraft,
  WRITER_MAX_ACTIVE_JOBS,
  WRITER_MAX_RECOVERY_DRAFT_CHARS,
  WRITER_MAX_RECOVERY_DRAFTS
} from '../recovery'

describe('Writer recovery cache maps', () => {
  it('keeps only the newest bounded recovery drafts without truncating content', () => {
    let drafts: WriterRecoveryDraftMap = {}
    for (let index = 0; index < WRITER_MAX_RECOVERY_DRAFTS + 2; index += 1) {
      drafts = setWriterRecoveryDraft(
        drafts,
        {
          rootPath: `/book-${index}`,
          chapterId: `chapter-${index}`,
          baseRevision: String(index).padStart(64, '0'),
          content: `draft-${index}`,
          updatedAt: new Date(index * 1_000).toISOString()
        },
        `/book-${index}`,
        `chapter-${index}`
      )
    }

    expect(Object.keys(drafts)).toHaveLength(WRITER_MAX_RECOVERY_DRAFTS)
    expect(getWriterRecoveryDraft(drafts, '/book-0', 'chapter-0')).toBeUndefined()
    expect(
      getWriterRecoveryDraft(
        drafts,
        `/book-${WRITER_MAX_RECOVERY_DRAFTS + 1}`,
        `chapter-${WRITER_MAX_RECOVERY_DRAFTS + 1}`
      )?.content
    ).toBe(`draft-${WRITER_MAX_RECOVERY_DRAFTS + 1}`)
  })

  it('bounds active job ids and removes an applied job', () => {
    let jobs = {}
    for (let index = 0; index < WRITER_MAX_ACTIVE_JOBS + 2; index += 1) {
      jobs = setWriterActiveJobId(jobs, `job-${index}`, `/book-${index}`, `chapter-${index}`)
    }
    expect(Object.keys(jobs)).toHaveLength(WRITER_MAX_ACTIVE_JOBS)

    jobs = setWriterActiveJobId(jobs, undefined, '/book-51', 'chapter-51')
    expect(getWriterActiveJobId(jobs, '/book-51', 'chapter-51')).toBeUndefined()
  })

  it('keeps the previous recovery entry when a single replacement is too large', () => {
    const previous = {
      rootPath: '/book',
      chapterId: 'chapter',
      baseRevision: 'a'.repeat(64),
      content: 'recoverable',
      updatedAt: new Date(0).toISOString()
    }
    const drafts = setWriterRecoveryDraft({}, previous, previous.rootPath, previous.chapterId)
    const next = setWriterRecoveryDraft(
      drafts,
      { ...previous, content: 'x'.repeat(WRITER_MAX_RECOVERY_DRAFT_CHARS + 1), updatedAt: new Date(1).toISOString() },
      previous.rootPath,
      previous.chapterId
    )

    expect(getWriterRecoveryDraft(next, previous.rootPath, previous.chapterId)?.content).toBe(previous.content)
  })
})
