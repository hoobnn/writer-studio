import type {
  WriterChapterMetadata,
  WriterChapterPlan,
  WriterCharacter,
  WriterContinuityLedger
} from '@shared/types/writer'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@cherrystudio/ui', async () => {
  const React = await import('react')
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({})
  const TabsContext = React.createContext<{ onValueChange?: (value: string) => void; value?: string }>({})

  return {
    Badge: (props: { children: ReactNode; variant?: string }) => {
      const spanProps = { ...props }
      Reflect.deleteProperty(spanProps, 'variant')
      return <span {...spanProps} />
    },
    Button: (
      props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; size?: string; variant?: string }
    ) => {
      const buttonProps = { ...props }
      Reflect.deleteProperty(buttonProps, 'size')
      Reflect.deleteProperty(buttonProps, 'variant')
      return <button type={props.type ?? 'button'} {...buttonProps} />
    },
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Select: ({ children, onValueChange }: { children: ReactNode; onValueChange?: (value: string) => void }) => (
      <SelectContext value={{ onValueChange }}>{children}</SelectContext>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const context = React.use(SelectContext)
      return (
        <button type="button" role="option" aria-selected={false} onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
    SelectValue: () => null,
    Tabs: ({
      children,
      onValueChange,
      value
    }: {
      children: ReactNode
      onValueChange?: (value: string) => void
      value?: string
    }) => <TabsContext value={{ onValueChange, value }}>{children}</TabsContext>,
    TabsList: ({ children, ...props }: { children: ReactNode }) => (
      <div role="tablist" {...props}>
        {children}
      </div>
    ),
    TabsTrigger: ({ children, value, ...props }: { children: ReactNode; value: string }) => {
      const context = React.use(TabsContext)
      return (
        <button
          type="button"
          role="tab"
          aria-selected={context.value === value}
          onClick={() => context.onValueChange?.(value)}
          {...props}>
          {children}
        </button>
      )
    },
    Textarea: {
      Input: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />
    }
  }
})

const NOW = '2026-08-24T00:00:00.000Z'
const REVISION_A = 'a'.repeat(64)
const REVISION_B = 'b'.repeat(64)

function chapter(id: string, title: string, order: number, revision = REVISION_A): WriterChapterMetadata {
  return { id, title, fileName: `${id}.md`, order, createdAt: NOW, updatedAt: NOW, revision }
}

const CHAPTERS = [chapter('chapter-1', 'Chapter One', 0), chapter('chapter-2', 'Chapter Two', 1, REVISION_B)]
const CHARACTERS: WriterCharacter[] = [
  { id: 'character-1', name: 'Mara', role: '', description: '', goals: [], constraints: [] }
]
const CHAPTER_PLANS: WriterChapterPlan[] = [
  {
    chapterId: 'chapter-1',
    title: 'Plan One',
    goal: '',
    beats: [],
    requirements: [{ id: 'req-1', description: 'Reveal the motive' }],
    status: 'planned'
  }
]

const EMPTY_LEDGER: WriterContinuityLedger = {
  schemaVersion: 1,
  facts: [],
  foreshadowing: [],
  chapterSummaries: []
}

async function renderForm(continuity: WriterContinuityLedger, onChange = vi.fn()) {
  const { WriterContinuityForm } = await import('../components/WriterContinuityForm')
  const view = render(
    <WriterContinuityForm
      continuity={continuity}
      chapters={CHAPTERS}
      characters={CHARACTERS}
      chapterPlans={CHAPTER_PLANS}
      disabled={false}
      onChange={onChange}
    />
  )
  return { onChange, view }
}

describe('WriterContinuityForm', () => {
  it('switches tabs and edits the selected entry through list and detail panes', async () => {
    const ledger: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      facts: [
        { id: 'fact-1', subject: 'Mara', predicate: 'owns the key', detail: '' },
        { id: 'fact-2', subject: 'The tower', predicate: 'is sealed', detail: '' }
      ],
      foreshadowing: [{ id: 'foreshadowing-1', description: 'The letter', status: 'open' }]
    }
    const { onChange } = await renderForm(ledger)

    fireEvent.click(screen.getByRole('button', { name: /The tower is sealed/ }))
    const predicateInput = screen.getByDisplayValue('is sealed')
    fireEvent.change(predicateInput, { target: { value: 'is open again' } })
    const afterFactEdit = onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(afterFactEdit.facts[1].predicate).toBe('is open again')

    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.foreshadowing/ }))
    expect(screen.getByDisplayValue('The letter')).toBeInTheDocument()
  })

  it('warns on a status and resolved-chapter mismatch in both directions', async () => {
    const resolvedWithoutChapter: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      foreshadowing: [{ id: 'foreshadowing-1', description: 'The letter', status: 'resolved' }]
    }
    const first = await renderForm(resolvedWithoutChapter)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.foreshadowing/ }))
    expect(screen.getByText('writer.continuity_studio.foreshadowing_resolved_mismatch')).toBeInTheDocument()
    first.view.unmount()

    const consistent: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      foreshadowing: [
        { id: 'foreshadowing-1', description: 'The letter', status: 'resolved', resolvedChapterId: 'chapter-2' }
      ]
    }
    await renderForm(consistent)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.foreshadowing/ }))
    expect(screen.queryByText('writer.continuity_studio.foreshadowing_resolved_mismatch')).not.toBeInTheDocument()
  })

  it('stamps updatedAt automatically when a summary field changes', async () => {
    const ledger: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      chapterSummaries: [{ chapterId: 'chapter-1', summary: 'Old summary.', updatedAt: NOW }]
    }
    const { onChange } = await renderForm(ledger)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.chapter_summaries/ }))

    fireEvent.change(screen.getByDisplayValue('Old summary.'), { target: { value: 'New summary.' } })
    const next = onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(next.chapterSummaries[0].summary).toBe('New summary.')
    expect(next.chapterSummaries[0].updatedAt).not.toBe(NOW)
    expect(new Date(next.chapterSummaries[0].updatedAt).toISOString()).toBe(next.chapterSummaries[0].updatedAt)
  })

  it('marks assessments against the current chapter revision and clears them again', async () => {
    const ledger: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      chapterSummaries: [{ chapterId: 'chapter-1', summary: '', assessmentRevision: REVISION_B, updatedAt: NOW }]
    }
    const marked = await renderForm(ledger)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.chapter_summaries/ }))
    expect(screen.getByText('writer.continuity_studio.assessment_revision_stale')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'writer.continuity_studio.mark_assessed' }))
    const afterMark = marked.onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(afterMark.chapterSummaries[0].assessmentRevision).toBe(REVISION_A)
    marked.view.unmount()

    const cleared = await renderForm({
      ...EMPTY_LEDGER,
      chapterSummaries: [{ chapterId: 'chapter-1', summary: '', assessmentRevision: REVISION_A, updatedAt: NOW }]
    })
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.chapter_summaries/ }))
    expect(screen.getByText('writer.continuity_studio.assessment_revision_current')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'writer.continuity_studio.clear_assessed' }))
    const afterClear = cleared.onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(afterClear.chapterSummaries[0].assessmentRevision).toBeUndefined()
    expect(JSON.parse(JSON.stringify(afterClear.chapterSummaries[0]))).not.toHaveProperty('assessmentRevision')
  })

  it('adds a requirement assessment from the chapter plan requirements', async () => {
    const ledger: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      chapterSummaries: [{ chapterId: 'chapter-1', summary: '', updatedAt: NOW }]
    }
    const { onChange } = await renderForm(ledger)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.chapter_summaries/ }))

    fireEvent.click(screen.getByRole('button', { name: 'writer.continuity_studio.add_assessment' }))
    const next = onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(next.chapterSummaries[0].requirementAssessments).toEqual([
      { requirementId: 'req-1', status: 'met', evidence: '' }
    ])
  })

  it('warns on timeline slot conflicts', async () => {
    const ledger: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      timelineEvents: [
        {
          id: 'event-1',
          timelineId: 'main',
          chapterId: 'chapter-1',
          sequence: 0,
          storyTime: 1,
          label: 'A',
          evidence: ''
        },
        {
          id: 'event-2',
          timelineId: 'main',
          chapterId: 'chapter-1',
          sequence: 0,
          storyTime: 2,
          label: 'B',
          evidence: ''
        }
      ]
    }
    await renderForm(ledger)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.timeline_events/ }))
    expect(screen.getByText('writer.continuity_studio.timeline_slot_conflict')).toBeInTheDocument()
  })

  it('round-trips optional collections: adding creates the array, deleting the last entry drops the key', async () => {
    const added = await renderForm(EMPTY_LEDGER)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.timeline_events/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'writer.continuity_studio.add_entry' })[0])
    const afterAdd = added.onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(afterAdd.timelineEvents).toHaveLength(1)
    expect(afterAdd.timelineEvents?.[0]).toEqual({
      id: 'event-1',
      timelineId: 'main',
      chapterId: 'chapter-1',
      sequence: 0,
      storyTime: 0,
      label: 'writer.continuity_studio.new_event',
      evidence: ''
    })
    added.view.unmount()

    const removed = await renderForm({
      ...EMPTY_LEDGER,
      timelineEvents: [
        {
          id: 'event-1',
          timelineId: 'main',
          chapterId: 'chapter-1',
          sequence: 0,
          storyTime: 0,
          label: 'A',
          evidence: ''
        }
      ]
    })
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.timeline_events/ }))
    fireEvent.click(screen.getByRole('button', { name: 'writer.continuity_studio.remove_entry' }))
    const afterRemove = removed.onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(JSON.parse(JSON.stringify(afterRemove))).not.toHaveProperty('timelineEvents')
  })

  it('offers story bible characters in the character state selector', async () => {
    const ledger: WriterContinuityLedger = {
      ...EMPTY_LEDGER,
      characterStates: [
        {
          id: 'state-1',
          timelineId: 'main',
          characterId: 'ghost-character',
          chapterId: 'chapter-1',
          sequence: 0,
          location: '',
          lifeStatus: 'unknown',
          transitionExplanation: '',
          evidence: ''
        }
      ]
    }
    const { onChange } = await renderForm(ledger)
    fireEvent.click(screen.getByRole('tab', { name: /writer.continuity_studio.tabs.character_states/ }))

    expect(screen.getByRole('option', { name: 'ghost-character' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Mara' }))
    const next = onChange.mock.calls[0][0] as WriterContinuityLedger
    expect(next.characterStates?.[0].characterId).toBe('character-1')
  })
})
