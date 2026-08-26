import type { WriterChapterMetadata, WriterOutline } from '@shared/types/writer'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@cherrystudio/ui', async () => {
  const React = await import('react')
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({})

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
    Textarea: {
      Input: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />
    }
  }
})

const NOW = '2026-08-24T00:00:00.000Z'
const REVISION = 'a'.repeat(64)

function chapter(id: string, title: string, order: number): WriterChapterMetadata {
  return { id, title, fileName: `${id}.md`, order, createdAt: NOW, updatedAt: NOW, revision: REVISION }
}

const CHAPTERS = [chapter('chapter-1', 'Chapter One', 0), chapter('chapter-2', 'Chapter Two', 1)]

const EMPTY_OUTLINE: WriterOutline = { schemaVersion: 1, bookSummary: '', arcs: [], chapterPlans: [] }

async function renderForm(outline: WriterOutline, onChange = vi.fn()) {
  const { WriterOutlineForm } = await import('../components/WriterOutlineForm')
  const view = render(<WriterOutlineForm outline={outline} chapters={CHAPTERS} disabled={false} onChange={onChange} />)
  return { onChange, view }
}

describe('WriterOutlineForm', () => {
  it('adds a chapter plan prefilled with the first unplanned chapter and no requirements key', async () => {
    const outline: WriterOutline = {
      ...EMPTY_OUTLINE,
      chapterPlans: [{ chapterId: 'chapter-1', title: 'Chapter One', goal: '', beats: [], status: 'planned' }]
    }
    const { onChange } = await renderForm(outline)

    fireEvent.click(screen.getByRole('button', { name: 'writer.outline_studio.add_chapter_plan' }))

    const next = onChange.mock.calls[0][0] as WriterOutline
    expect(next.chapterPlans[1]).toEqual({
      chapterId: 'chapter-2',
      title: 'Chapter Two',
      goal: '',
      beats: [],
      status: 'planned'
    })
    expect('requirements' in next.chapterPlans[1]).toBe(false)
  })

  it('disables adding plans once every chapter is planned and excludes planned chapters from the selector', async () => {
    const outline: WriterOutline = {
      ...EMPTY_OUTLINE,
      chapterPlans: [
        { chapterId: 'chapter-1', title: 'Plan One', goal: '', beats: [], status: 'planned' },
        { chapterId: 'chapter-2', title: 'Plan Two', goal: '', beats: [], status: 'planned' }
      ]
    }
    await renderForm(outline)

    expect(screen.getByRole('button', { name: 'writer.outline_studio.add_chapter_plan' })).toBeDisabled()
    const firstCard = screen.getAllByRole('article')[0]
    const optionNames = within(firstCard)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(optionNames).toContain('Chapter One')
    expect(optionNames).not.toContain('Chapter Two')
  })

  it('changes the plan status through the enum selector', async () => {
    const outline: WriterOutline = {
      ...EMPTY_OUTLINE,
      chapterPlans: [{ chapterId: 'chapter-1', title: 'Plan One', goal: '', beats: [], status: 'planned' }]
    }
    const { onChange } = await renderForm(outline)

    fireEvent.click(screen.getByRole('option', { name: 'writer.outline_studio.plan_status.revised' }))

    const next = onChange.mock.calls[0][0] as WriterOutline
    expect(next.chapterPlans[0].status).toBe('revised')
  })

  it('adds requirements as an array and drops the key again when the last one is removed', async () => {
    const withoutRequirements: WriterOutline = {
      ...EMPTY_OUTLINE,
      chapterPlans: [{ chapterId: 'chapter-1', title: 'Plan One', goal: '', beats: [], status: 'planned' }]
    }
    const added = await renderForm(withoutRequirements)
    fireEvent.click(screen.getByRole('button', { name: 'writer.outline_studio.add_requirement' }))
    const afterAdd = added.onChange.mock.calls[0][0] as WriterOutline
    expect(afterAdd.chapterPlans[0].requirements).toEqual([{ id: 'req-1', description: '' }])

    added.view.unmount()

    const withRequirement: WriterOutline = {
      ...EMPTY_OUTLINE,
      chapterPlans: [
        {
          chapterId: 'chapter-1',
          title: 'Plan One',
          goal: '',
          beats: [],
          requirements: [{ id: 'req-1', description: 'Reveal the motive' }],
          status: 'planned'
        }
      ]
    }
    const removed = await renderForm(withRequirement)
    fireEvent.click(screen.getByRole('button', { name: 'common.delete writer.outline_studio.requirements 1' }))
    const afterRemove = removed.onChange.mock.calls[0][0] as WriterOutline
    expect(afterRemove.chapterPlans[0].requirements).toBeUndefined()
    expect(JSON.parse(JSON.stringify(afterRemove.chapterPlans[0]))).not.toHaveProperty('requirements')
  })

  it('marks an empty arc as book-wide and manages covered chapters as removable chips', async () => {
    const outline: WriterOutline = {
      ...EMPTY_OUTLINE,
      arcs: [
        { id: 'arc-1', title: 'Rise', summary: '', chapterIds: [] },
        { id: 'arc-2', title: 'Fall', summary: '', chapterIds: ['chapter-1', 'ghost-chapter'] }
      ]
    }
    const { onChange } = await renderForm(outline)

    expect(screen.getByText('writer.outline_studio.arc_global_badge')).toBeInTheDocument()
    expect(screen.getByText('ghost-chapter')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'writer.outline_studio.remove_arc_chapter' })[0])
    const next = onChange.mock.calls[0][0] as WriterOutline
    expect(next.arcs[1].chapterIds).toEqual(['ghost-chapter'])
  })
})
