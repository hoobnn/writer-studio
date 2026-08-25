import {
  WriterContinuityLedgerSchema,
  WriterContinuityReviewDocumentSchema,
  WriterContinuityWaiveInputSchema,
  WriterOutlineSchema
} from '@shared/types/writer'
import { describe, expect, it } from 'vitest'

const NOW = '2026-08-25T00:00:00.000Z'

describe('writer continuity schemas', () => {
  it('keeps schema-version-one outline and continuity documents backward compatible', () => {
    expect(
      WriterOutlineSchema.parse({
        schemaVersion: 1,
        bookSummary: '',
        arcs: [],
        chapterPlans: [{ chapterId: 'chapter-1', title: 'Chapter 1', goal: '', beats: [], status: 'planned' }]
      }).chapterPlans[0].requirements
    ).toBeUndefined()
    const continuity = WriterContinuityLedgerSchema.parse({
      schemaVersion: 1,
      facts: [],
      foreshadowing: [],
      chapterSummaries: []
    })
    expect(continuity.timelineEvents).toBeUndefined()
    expect(continuity.characterStates).toBeUndefined()
  })

  it('normalizes old review sidecars with empty coverage and waivers', () => {
    const review = WriterContinuityReviewDocumentSchema.parse({ schemaVersion: 1, updatedAt: NOW })

    expect(review.coverageDeclarations).toEqual([])
    expect(review.waivers).toEqual([])
  })

  it('rejects duplicate typed identities and duplicate plan requirement ids', () => {
    const duplicatedEvent = {
      id: 'event-1',
      chapterId: 'chapter-1',
      sequence: 0,
      storyTime: 1,
      label: 'Event'
    }
    expect(
      WriterContinuityLedgerSchema.safeParse({
        schemaVersion: 1,
        facts: [],
        foreshadowing: [],
        chapterSummaries: [],
        timelineEvents: [duplicatedEvent, duplicatedEvent]
      }).success
    ).toBe(false)
    expect(
      WriterContinuityLedgerSchema.safeParse({
        schemaVersion: 1,
        facts: [],
        foreshadowing: [],
        chapterSummaries: [],
        characterStates: Array.from({ length: 101 }, (_, index) => ({
          id: `state-${index}`,
          characterId: 'character-1',
          chapterId: 'chapter-1',
          sequence: 0
        }))
      }).success
    ).toBe(false)
    expect(
      WriterContinuityLedgerSchema.safeParse({
        schemaVersion: 1,
        facts: [],
        foreshadowing: [],
        chapterSummaries: [],
        timelineEvents: [duplicatedEvent, { ...duplicatedEvent, id: 'event-2', storyTime: 2 }]
      }).success
    ).toBe(false)
    expect(
      WriterOutlineSchema.safeParse({
        schemaVersion: 1,
        bookSummary: '',
        arcs: [],
        chapterPlans: [
          {
            chapterId: 'chapter-1',
            title: 'Chapter 1',
            goal: '',
            beats: [],
            requirements: [
              { id: 'required-item', description: 'First' },
              { id: 'required-item', description: 'Second' }
            ],
            status: 'planned'
          }
        ]
      }).success
    ).toBe(false)
    expect(
      WriterOutlineSchema.safeParse({
        schemaVersion: 1,
        bookSummary: '',
        arcs: [],
        chapterPlans: [
          { chapterId: 'chapter-1', title: 'First', goal: '', beats: [], status: 'planned' },
          { chapterId: 'chapter-1', title: 'Second', goal: '', beats: [], status: 'planned' }
        ]
      }).success
    ).toBe(false)
    expect(
      WriterContinuityLedgerSchema.safeParse({
        schemaVersion: 1,
        facts: [],
        foreshadowing: [],
        chapterSummaries: [
          {
            chapterId: 'chapter-1',
            summary: '',
            updatedAt: NOW,
            requirementAssessments: [
              { requirementId: 'required-item', status: 'met', evidence: '' },
              { requirementId: 'required-item', status: 'deviated', evidence: '' }
            ]
          }
        ]
      }).success
    ).toBe(false)
  })

  it('requires a bounded non-empty intentional-waiver reason', () => {
    expect(
      WriterContinuityWaiveInputSchema.safeParse({
        rootPath: '/book',
        findingKey: 'a'.repeat(64),
        findingFingerprint: 'b'.repeat(64),
        reason: '   ',
        expectedRevision: 'c'.repeat(64)
      }).success
    ).toBe(false)
  })
})
