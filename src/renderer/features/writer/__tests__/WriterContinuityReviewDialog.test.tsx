import { IpcError } from '@shared/ipc/errors/IpcError'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import type {
  WriterContinuityAuditRule,
  WriterContinuityCoverageView,
  WriterContinuityFindingView,
  WriterContinuityReviewView,
  WriterProject
} from '@shared/types/writer'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WriterContinuityReviewDialog } from '../components/WriterContinuityReviewDialog'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@renderer/ipc', () => ({ ipcApi: { request: mocks.request } }))
vi.mock('react-i18next', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

const REVISION_A = 'a'.repeat(64)
const REVISION_B = 'b'.repeat(64)
const REVISION_C = 'g'.repeat(64)
const FINDING_KEY = 'c'.repeat(64)
const FINDING_FINGERPRINT = 'd'.repeat(64)
const OLD_FINGERPRINT = 'e'.repeat(64)
const ORPHAN_KEY = 'f'.repeat(64)
const NOW = '2026-08-25T00:00:00.000Z'
const COVERAGE_RULES: WriterContinuityAuditRule[] = [
  'timeline',
  'character_location',
  'character_life',
  'foreshadowing_due',
  'future_information',
  'chapter_plan'
]

const PROJECT: WriterProject = {
  rootPath: '/books/my-novel',
  manifest: {
    schemaVersion: 1,
    id: 'my-novel',
    title: 'My Novel',
    createdAt: NOW,
    updatedAt: NOW,
    activeChapterId: 'chapter-1',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter One',
        fileName: 'chapter-1.md',
        order: 0,
        createdAt: NOW,
        updatedAt: NOW,
        revision: REVISION_A
      }
    ]
  },
  storyBible: {
    schemaVersion: 1,
    genre: '',
    premise: '',
    authorGoal: '',
    hardRules: [],
    themes: [],
    characters: [],
    loreEntries: [],
    worldRules: [],
    styleGuide: []
  },
  outline: { schemaVersion: 1, bookSummary: '', arcs: [], chapterPlans: [] },
  continuity: { schemaVersion: 1, facts: [], foreshadowing: [], chapterSummaries: [] },
  documentRevisions: { storyBible: REVISION_A, outline: REVISION_A, continuity: REVISION_A }
}

const FINDING: WriterContinuityFindingView = {
  key: FINDING_KEY,
  fingerprint: FINDING_FINGERPRINT,
  ruleVersion: 1,
  rule: 'chapter_plan_deviation',
  severity: 'error',
  exemptible: true,
  chapterIds: ['chapter-1'],
  entityIds: ['missing-fact'],
  evidence: [
    {
      kind: 'chapter_plan',
      sourceId: 'missing-fact',
      chapterId: 'chapter-1',
      label: 'The protagonist opens the sealed door.',
      detail: 'The chapter ends before the door is opened.',
      truncated: false
    }
  ],
  evidenceTruncated: false,
  suggestion: 'update_plan_or_mark_intentional',
  state: 'open'
}

function makeCoverage(status: WriterContinuityCoverageView['status']): WriterContinuityCoverageView[] {
  return COVERAGE_RULES.map((rule) => ({
    rule,
    status,
    evaluatedItems: 1,
    staleItems: 0,
    basisFingerprint: REVISION_B,
    ...(status === 'checked' ? { throughChapterId: 'chapter-1' } : {}),
    note: status === 'checked' ? 'Checked against the chapter ledger.' : ''
  }))
}

function makeView(
  patch: Partial<WriterContinuityReviewView> = {},
  findings: WriterContinuityFindingView[] = [FINDING]
): WriterContinuityReviewView {
  return {
    revision: REVISION_A,
    status: 'issues',
    stale: false,
    targetChapterId: 'chapter-1',
    generatedAt: NOW,
    sourceFingerprint: REVISION_A,
    findings,
    coverage: makeCoverage('insufficient_data'),
    orphanedWaivers: [],
    truncated: false,
    counts: {
      open: findings.filter((finding) => finding.state !== 'exempted').length,
      exempted: findings.filter((finding) => finding.state === 'exempted').length,
      staleExemption: findings.filter((finding) => finding.state === 'stale_exemption').length,
      error: findings.filter((finding) => finding.severity === 'error' && finding.state !== 'exempted').length,
      warning: 0,
      info: 0
    },
    ...patch
  }
}

describe('WriterContinuityReviewDialog', () => {
  beforeEach(() => {
    mocks.request.mockReset()
  })

  it('runs checks and records explicit coverage through the current chapter', async () => {
    const notRun = makeView({
      revision: 'missing',
      status: 'not_run',
      generatedAt: undefined,
      sourceFingerprint: undefined,
      findings: [],
      coverage: makeCoverage('insufficient_data').map((item) => ({ ...item, basisFingerprint: undefined })),
      counts: { open: 0, exempted: 0, staleExemption: 0, error: 0, warning: 0, info: 0 }
    })
    const reviewed = makeView()
    const covered = makeView({ revision: REVISION_B, coverage: makeCoverage('checked') })
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.continuity_review.read') return notRun
      if (route === 'writer.continuity_review.run') return reviewed
      if (route === 'writer.continuity_review.coverage.update') return covered
      throw new Error(`Unexpected route: ${route}`)
    })

    render(<WriterContinuityReviewDialog project={PROJECT} targetChapterId="chapter-1" onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'writer.continuity_review.actions.run' }))
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith('writer.continuity_review.run', {
        rootPath: PROJECT.rootPath,
        targetChapterId: 'chapter-1',
        expectedRevision: 'missing'
      })
    )

    const noteFields = await screen.findAllByLabelText('writer.continuity_review.coverage_note')
    fireEvent.change(noteFields[0], { target: { value: 'Verified the timeline against chapter one.' } })
    const markButton = screen.getAllByRole('button', {
      name: 'writer.continuity_review.actions.mark_covered'
    })[0]
    await waitFor(() => expect(markButton).toBeEnabled())
    fireEvent.click(markButton)

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith('writer.continuity_review.coverage.update', {
        rootPath: PROJECT.rootPath,
        targetChapterId: 'chapter-1',
        rule: 'timeline',
        covered: true,
        note: 'Verified the timeline against chapter one.',
        expectedRevision: REVISION_A
      })
    )
  })

  it('requires a reason and preserves it when a revision conflict rejects the exemption', async () => {
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.continuity_review.read') return makeView()
      if (route === 'writer.continuity_review.waive') {
        throw new IpcError(writerErrorCodes.REVISION_CONFLICT)
      }
      throw new Error(`Unexpected route: ${route}`)
    })
    render(<WriterContinuityReviewDialog project={PROJECT} targetChapterId="chapter-1" onClose={vi.fn()} />)

    const waiveButton = await screen.findByRole('button', { name: 'writer.continuity_review.actions.waive' })
    fireEvent.click(waiveButton)
    expect(screen.getByRole('alert')).toHaveTextContent('writer.continuity_review.errors.reason_required')
    expect(mocks.request).not.toHaveBeenCalledWith('writer.continuity_review.waive', expect.anything())

    const reasonField = screen.getByLabelText('writer.continuity_review.waiver_reason')
    fireEvent.change(reasonField, { target: { value: 'The contradiction is a deliberate unreliable-memory clue.' } })
    fireEvent.click(waiveButton)

    expect(await screen.findByText('writer.continuity_review.errors.conflict_reason_preserved')).toBeInTheDocument()
    expect(reasonField).toHaveValue('The contradiction is a deliberate unreliable-memory clue.')
    expect(mocks.request).toHaveBeenCalledWith('writer.continuity_review.waive', {
      rootPath: PROJECT.rootPath,
      targetChapterId: 'chapter-1',
      findingKey: FINDING_KEY,
      findingFingerprint: FINDING_FINGERPRINT,
      reason: 'The contradiction is a deliberate unreliable-memory clue.',
      expectedRevision: REVISION_A
    })
  })

  it('renews a stale exemption and can remove an orphaned exemption', async () => {
    const staleFinding: WriterContinuityFindingView = {
      ...FINDING,
      state: 'stale_exemption',
      waiver: {
        findingKey: FINDING_KEY,
        findingFingerprint: OLD_FINGERPRINT,
        reason: 'This was intentional in the earlier draft.',
        createdAt: NOW,
        updatedAt: NOW
      }
    }
    const orphanedWaiver = {
      findingKey: ORPHAN_KEY,
      findingFingerprint: OLD_FINGERPRINT,
      reason: 'No longer attached to a current finding.',
      createdAt: NOW,
      updatedAt: NOW
    }
    const initial = makeView({ orphanedWaivers: [orphanedWaiver] }, [staleFinding])
    const renewedFinding: WriterContinuityFindingView = {
      ...FINDING,
      state: 'exempted',
      waiver: {
        ...staleFinding.waiver!,
        findingFingerprint: FINDING_FINGERPRINT
      }
    }
    const renewed = makeView({ revision: REVISION_B, orphanedWaivers: [orphanedWaiver] }, [renewedFinding])
    const activeRemoved = makeView({ revision: REVISION_C, orphanedWaivers: [orphanedWaiver] })
    mocks.request.mockImplementation(async (route: string, input?: { findingKey?: string }) => {
      if (route === 'writer.continuity_review.read') return initial
      if (route === 'writer.continuity_review.waive') return renewed
      if (route === 'writer.continuity_review.unwaive' && input?.findingKey === FINDING_KEY) return activeRemoved
      if (route === 'writer.continuity_review.unwaive' && input?.findingKey === ORPHAN_KEY) {
        return makeView({ revision: 'h'.repeat(64), orphanedWaivers: [] })
      }
      throw new Error(`Unexpected route: ${route}`)
    })
    const { container } = render(
      <WriterContinuityReviewDialog project={PROJECT} targetChapterId="chapter-1" onClose={vi.fn()} />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'writer.continuity_review.actions.renew' }))
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith('writer.continuity_review.waive', {
        rootPath: PROJECT.rootPath,
        targetChapterId: 'chapter-1',
        findingKey: FINDING_KEY,
        findingFingerprint: FINDING_FINGERPRINT,
        reason: 'This was intentional in the earlier draft.',
        expectedRevision: REVISION_A
      })
    )

    const activeFindingRow = container.querySelector('[data-ui="writer.continuity-review.finding"]')
    expect(activeFindingRow).not.toBeNull()
    const activeUnwaive = within(activeFindingRow as HTMLElement).getByRole('button', {
      name: 'writer.continuity_review.actions.unwaive'
    })
    await waitFor(() => expect(activeUnwaive).toBeEnabled())
    fireEvent.click(activeUnwaive)
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith('writer.continuity_review.unwaive', {
        rootPath: PROJECT.rootPath,
        targetChapterId: 'chapter-1',
        findingKey: FINDING_KEY,
        expectedRevision: REVISION_B
      })
    )

    const orphanRow = await waitFor(() => {
      const row = container.querySelector('[data-ui="writer.continuity-review.orphan"]')
      expect(row).not.toBeNull()
      return row
    })
    expect(orphanRow).not.toBeNull()
    const orphanUnwaive = within(orphanRow as HTMLElement).getByRole('button', {
      name: 'writer.continuity_review.actions.unwaive'
    })
    await waitFor(() => expect(orphanUnwaive).toBeEnabled())
    fireEvent.click(orphanUnwaive)
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith('writer.continuity_review.unwaive', {
        rootPath: PROJECT.rootPath,
        targetChapterId: 'chapter-1',
        findingKey: ORPHAN_KEY,
        expectedRevision: REVISION_C
      })
    )
  })

  it('blocks new exemptions and coverage confirmation while the report is stale', async () => {
    mocks.request.mockResolvedValue(makeView({ status: 'stale', stale: true, coverage: makeCoverage('stale') }))
    render(<WriterContinuityReviewDialog project={PROJECT} targetChapterId="chapter-1" onClose={vi.fn()} />)

    expect(await screen.findByRole('button', { name: 'writer.continuity_review.actions.waive' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'writer.continuity_review.actions.mark_covered' })[0]).toBeDisabled()
    expect(screen.getByText('writer.continuity_review.stale_title')).toBeInTheDocument()
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  it('filters findings by severity and exemption state', async () => {
    const exemptedWarning: WriterContinuityFindingView = {
      ...FINDING,
      key: 'i'.repeat(64),
      fingerprint: 'j'.repeat(64),
      severity: 'warning',
      state: 'exempted',
      waiver: {
        findingKey: 'i'.repeat(64),
        findingFingerprint: 'j'.repeat(64),
        reason: 'Intentional unreliable narration.',
        createdAt: NOW,
        updatedAt: NOW
      }
    }
    mocks.request.mockResolvedValue(makeView({}, [FINDING, exemptedWarning]))
    const { container } = render(
      <WriterContinuityReviewDialog project={PROJECT} targetChapterId="chapter-1" onClose={vi.fn()} />
    )

    await waitFor(() =>
      expect(container.querySelectorAll('[data-ui="writer.continuity-review.finding"]')).toHaveLength(2)
    )
    fireEvent.change(screen.getByLabelText('writer.continuity_review.severity_filter'), {
      target: { value: 'warning' }
    })
    await waitFor(() => {
      const rows = container.querySelectorAll('[data-ui="writer.continuity-review.finding"]')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toHaveAttribute('data-severity', 'warning')
    })

    fireEvent.change(screen.getByLabelText('writer.continuity_review.state_filter'), {
      target: { value: 'open' }
    })
    expect(await screen.findByText('writer.continuity_review.no_filter_results')).toBeInTheDocument()
  })

  it('blocks coverage confirmation when the underlying structured assessment is stale', async () => {
    const coverage = makeCoverage('stale')
    coverage[0] = { ...coverage[0], staleItems: 1 }
    mocks.request.mockResolvedValue(makeView({ coverage }))
    render(<WriterContinuityReviewDialog project={PROJECT} targetChapterId="chapter-1" onClose={vi.fn()} />)

    const markButtons = await screen.findAllByRole('button', {
      name: 'writer.continuity_review.actions.mark_covered'
    })
    expect(markButtons[0]).toBeDisabled()
    expect(screen.getByText('writer.continuity_review.coverage_data_stale_disabled')).toBeInTheDocument()
    expect(markButtons[1]).toBeEnabled()
  })
})
