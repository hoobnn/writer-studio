import {
  WRITER_MAX_CONTINUITY_AUDIT_OBSERVATIONS,
  WriterContinuityAuditReportSchema,
  type WriterContinuityReviewDocument,
  type WriterProject,
  WriterProjectSchema
} from '@shared/types/writer'
import { describe, expect, it } from 'vitest'

import { buildWriterContinuityReviewView, compileWriterContinuityAudit } from '../writerContinuityReview'

const NOW = '2026-08-25T00:00:00.000Z'
const REVISION = 'a'.repeat(64)

function fixture(): WriterProject {
  const chapters = ['chapter-1', 'chapter-2', 'chapter-3', 'chapter-4'].map((id, order) => ({
    id,
    title: `Chapter ${order + 1}`,
    fileName: `${String(order + 1).padStart(4, '0')}-${id}.md`,
    order,
    createdAt: NOW,
    updatedAt: NOW,
    revision: String(order + 1).repeat(64)
  }))
  return WriterProjectSchema.parse({
    rootPath: '/books/audited-novel',
    manifest: {
      schemaVersion: 1,
      id: 'audited-novel',
      title: 'Audited Novel',
      createdAt: NOW,
      updatedAt: NOW,
      activeChapterId: 'chapter-4',
      chapters
    },
    storyBible: {
      schemaVersion: 1,
      genre: '',
      premise: '',
      authorGoal: '',
      hardRules: [],
      themes: [],
      characters: [
        {
          id: 'alice',
          name: 'Alice',
          role: 'protagonist',
          description: '',
          goals: [],
          constraints: []
        }
      ],
      loreEntries: [],
      worldRules: [],
      styleGuide: []
    },
    outline: {
      schemaVersion: 1,
      bookSummary: '',
      arcs: [],
      chapterPlans: [
        {
          chapterId: 'chapter-2',
          title: 'Chapter 2',
          goal: '',
          beats: [],
          requirements: [{ id: 'requirement-door', description: 'Alice opens the sealed door.' }],
          status: 'drafted'
        }
      ]
    },
    continuity: {
      schemaVersion: 1,
      facts: [
        {
          id: 'fact-identity',
          subject: 'The guard',
          predicate: 'is the heir',
          detail: 'Revealed in chapter three.',
          sourceChapterId: 'chapter-3',
          usedInChapterIds: ['chapter-1']
        }
      ],
      foreshadowing: [
        {
          id: 'clue-key',
          description: 'The brass key must be used.',
          plantedChapterId: 'chapter-1',
          dueChapterId: 'chapter-2',
          status: 'open'
        }
      ],
      chapterSummaries: [
        {
          chapterId: 'chapter-2',
          summary: 'Alice refuses the sealed door.',
          assessmentRevision: chapters[1].revision,
          requirementAssessments: [
            {
              requirementId: 'requirement-door',
              status: 'deviated',
              evidence: 'The chapter ends before Alice touches the door.'
            }
          ],
          updatedAt: NOW
        }
      ],
      timelineEvents: [
        { id: 'event-later', chapterId: 'chapter-1', sequence: 0, storyTime: 10, label: 'Later event' },
        { id: 'event-earlier', chapterId: 'chapter-2', sequence: 0, storyTime: 5, label: 'Earlier event' }
      ],
      characterStates: [
        {
          id: 'alice-hall',
          characterId: 'alice',
          chapterId: 'chapter-2',
          sequence: 0,
          location: 'Hall',
          lifeStatus: 'alive'
        },
        {
          id: 'alice-tower',
          characterId: 'alice',
          chapterId: 'chapter-2',
          sequence: 0,
          location: 'Tower',
          lifeStatus: 'alive'
        },
        {
          id: 'alice-dead',
          characterId: 'alice',
          chapterId: 'chapter-2',
          sequence: 1,
          location: 'Hall',
          lifeStatus: 'dead'
        },
        {
          id: 'alice-alive-again',
          characterId: 'alice',
          chapterId: 'chapter-3',
          sequence: 0,
          location: 'Road',
          lifeStatus: 'alive'
        }
      ]
    },
    documentRevisions: { storyBible: REVISION, outline: REVISION, continuity: REVISION }
  })
}

describe('writer continuity review', () => {
  it('finds all six typed continuity rule families with stable structured evidence', () => {
    const report = compileWriterContinuityAudit({ project: fixture(), now: new Date(NOW) })

    expect(report.findings.map((item) => item.rule)).toEqual(
      expect.arrayContaining([
        'timeline_regression',
        'character_location_conflict',
        'character_resurrection',
        'foreshadowing_overdue',
        'future_information',
        'chapter_plan_deviation'
      ])
    )
    expect(report.findings).toHaveLength(6)
    expect(report.findings.every((item) => item.evidence.length > 0 && item.key !== item.fingerprint)).toBe(true)
    expect(report.ruleStats).toHaveLength(6)
    expect(report.truncated).toBe(false)
  })

  it('keeps a finding key stable while evidence changes invalidate its waiver', () => {
    const project = fixture()
    const original = compileWriterContinuityAudit({ project, now: new Date(NOW) })
    const overdue = original.findings.find((item) => item.rule === 'foreshadowing_overdue')!
    const document: WriterContinuityReviewDocument = {
      schemaVersion: 1,
      updatedAt: NOW,
      report: original,
      coverageDeclarations: [],
      waivers: [
        {
          findingKey: overdue.key,
          findingFingerprint: overdue.fingerprint,
          reason: 'The slow reveal is intentional.',
          createdAt: NOW,
          updatedAt: NOW
        }
      ]
    }
    const exempted = buildWriterContinuityReviewView({ project, document, revision: REVISION })
    expect(exempted.findings.find((item) => item.key === overdue.key)?.state).toBe('exempted')

    const changedProject = {
      ...project,
      continuity: {
        ...project.continuity,
        foreshadowing: project.continuity.foreshadowing.map((item) => ({ ...item, dueChapterId: 'chapter-3' }))
      },
      documentRevisions: { ...project.documentRevisions, continuity: 'b'.repeat(64) }
    }
    const changed = compileWriterContinuityAudit({ project: changedProject, now: new Date(NOW) })
    const changedOverdue = changed.findings.find((item) => item.rule === 'foreshadowing_overdue')!
    expect(changedOverdue.key).toBe(overdue.key)
    expect(changedOverdue.fingerprint).not.toBe(overdue.fingerprint)
    const stale = buildWriterContinuityReviewView({
      project: changedProject,
      document: { ...document, report: changed },
      revision: REVISION
    })
    expect(stale.findings.find((item) => item.key === overdue.key)?.state).toBe('stale_exemption')
  })

  it('never reports clear without current coverage declarations', () => {
    const project = fixture()
    project.continuity = {
      ...project.continuity,
      facts: [],
      foreshadowing: [],
      chapterSummaries: [],
      timelineEvents: [],
      characterStates: []
    }
    project.outline = { ...project.outline, chapterPlans: [] }
    project.documentRevisions.continuity = 'c'.repeat(64)
    project.documentRevisions.outline = 'c'.repeat(64)
    const report = compileWriterContinuityAudit({ project, now: new Date(NOW) })
    const view = buildWriterContinuityReviewView({
      project,
      document: { schemaVersion: 1, updatedAt: NOW, report, coverageDeclarations: [], waivers: [] },
      revision: REVISION
    })

    expect(view.findings).toEqual([])
    expect(view.coverage.every((item) => item.status === 'insufficient_data')).toBe(true)
    expect(view.status).toBe('incomplete')
  })

  it('marks a report stale when structured source revisions move', () => {
    const project = fixture()
    const report = compileWriterContinuityAudit({ project, now: new Date(NOW) })
    const changed = {
      ...project,
      documentRevisions: { ...project.documentRevisions, outline: 'd'.repeat(64) }
    }
    const view = buildWriterContinuityReviewView({
      project: changed,
      document: { schemaVersion: 1, updatedAt: NOW, report, coverageDeclarations: [], waivers: [] },
      revision: REVISION
    })

    expect(view.stale).toBe(true)
    expect(view.status).toBe('stale')
  })

  it('bounds oversized evidence groups and long labels without producing an invalid report', () => {
    const project = fixture()
    project.continuity.characterStates = Array.from({ length: 101 }, (_, index) => ({
      id: `state-${index}`,
      timelineId: 'main',
      characterId: 'alice',
      chapterId: 'chapter-2',
      sequence: 0,
      location: index % 2 === 0 ? 'Hall' : 'Tower',
      lifeStatus: 'unknown' as const,
      transitionExplanation: '',
      evidence: ''
    }))
    project.continuity.foreshadowing[0].description = `${'线索'.repeat(4_999)}😀`

    const report = compileWriterContinuityAudit({ project, now: new Date(NOW) })
    const location = report.findings.find((item) => item.rule === 'character_location_conflict')!
    const overdue = report.findings.find((item) => item.rule === 'foreshadowing_overdue')!

    expect(location.evidence).toHaveLength(100)
    expect(location.entityIds).toHaveLength(100)
    expect(location.evidenceTruncated).toBe(true)
    expect(overdue.evidence[0].label.length).toBeLessThanOrEqual(2_000)
    expect(overdue.evidence[0].truncated).toBe(true)
    expect(report.truncated).toBe(true)
    expect(WriterContinuityAuditReportSchema.safeParse(report).success).toBe(true)
  })

  it('deduplicates repeated knowledge-use receipts by stable finding key', () => {
    const project = fixture()
    project.continuity.facts[0].usedInChapterIds = ['chapter-1', 'chapter-1']

    const report = compileWriterContinuityAudit({ project, now: new Date(NOW) })

    expect(report.findings.filter((item) => item.rule === 'future_information')).toHaveLength(1)
  })

  it('fails closed before materializing an unsafe number of observations', () => {
    const project = fixture()
    const uses = Array.from({ length: 20_000 }, (_, index) => `used-${index}`)
    project.continuity.facts = Array.from({ length: 6 }, (_, index) => ({
      id: `fact-${index}`,
      subject: 'Subject',
      predicate: 'knows',
      detail: '',
      sourceChapterId: 'chapter-4',
      usedInChapterIds: uses
    }))

    expect(() => compileWriterContinuityAudit({ project, now: new Date(NOW) })).toThrow(
      expect.objectContaining({
        code: 'WRITER_CONTINUITY_CHECK_FAILED',
        data: expect.objectContaining({ maxObservations: WRITER_MAX_CONTINUITY_AUDIT_OBSERVATIONS })
      })
    )
  })
})
