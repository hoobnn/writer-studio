import { IpcError } from '@shared/ipc/errors/IpcError'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import type { WriterProject } from '@shared/types/writer'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  editorProps: undefined as
    | { value: string; onChange?: (value: string) => void; onSave?: (value: string) => void }
    | undefined
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@cherrystudio/ui/components/composites/code-editor', () => ({
  default: (props: { value: string; onChange?: (value: string) => void; onSave?: (value: string) => void }) => {
    mocks.editorProps = props
    return (
      <textarea
        aria-label="project-document-editor"
        value={props.value}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    )
  }
}))

vi.mock('@cherrystudio/ui', async () => {
  const React = await import('react')
  const TabsContext = React.createContext<{ onValueChange?: (value: string) => void; value?: string }>({})

  return {
    Badge: (props: { children: ReactNode; variant?: string }) => {
      const spanProps = { ...props }
      Reflect.deleteProperty(spanProps, 'variant')
      return <span {...spanProps} />
    },
    Button: (
      props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
        children: ReactNode
        loading?: boolean
        size?: string
        variant?: string
      }
    ) => {
      const buttonProps = { ...props }
      Reflect.deleteProperty(buttonProps, 'loading')
      Reflect.deleteProperty(buttonProps, 'size')
      Reflect.deleteProperty(buttonProps, 'variant')
      return <button type={props.type ?? 'button'} {...buttonProps} />
    },
    ConfirmDialog: ({
      confirmText,
      onConfirm,
      open,
      title
    }: {
      confirmText?: string
      onConfirm?: () => void
      open?: boolean
      title?: ReactNode
    }) =>
      open ? (
        <div role="alertdialog">
          <span>{title}</span>
          <button type="button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      ) : null,
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
    DialogContent: (props: { children: ReactNode; closeOnOverlayClick?: boolean; size?: string }) => {
      const dialogProps = { ...props }
      Reflect.deleteProperty(dialogProps, 'closeOnOverlayClick')
      Reflect.deleteProperty(dialogProps, 'size')
      return <div role="dialog" {...dialogProps} />
    },
    DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
    DialogHeader: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: { children: ReactNode }) => <h2 {...props}>{children}</h2>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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

const REVISION_A = 'a'.repeat(64)
const REVISION_B = 'b'.repeat(64)
const REVISION_C = 'c'.repeat(64)
const NOW = '2026-08-24T00:00:00.000Z'

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
    genre: 'Fantasy',
    premise: 'A promise that cannot be broken.',
    authorGoal: '',
    hardRules: ['Promises have a cost.'],
    themes: [],
    characters: [],
    loreEntries: [],
    worldRules: [],
    styleGuide: []
  },
  outline: { schemaVersion: 1, bookSummary: '', arcs: [], chapterPlans: [] },
  continuity: { schemaVersion: 1, facts: [], foreshadowing: [], chapterSummaries: [] },
  documentRevisions: { storyBible: REVISION_A, outline: REVISION_B, continuity: REVISION_C }
}

describe('WriterProjectDocumentsDialog', () => {
  beforeEach(() => {
    mocks.editorProps = undefined
  })

  it('saves visual story bible edits through the same revision-protected boundary', async () => {
    const user = userEvent.setup()
    const updatedStoryBible = {
      ...PROJECT.storyBible,
      authorGoal: 'Make every choice carry a visible cost.',
      characters: [{ id: 'character-1', name: 'Mara', role: '', description: '', goals: [], constraints: [] }]
    }
    const savedProject: WriterProject = {
      ...PROJECT,
      storyBible: updatedStoryBible,
      documentRevisions: { ...PROJECT.documentRevisions, storyBible: REVISION_B }
    }
    const onSaveDocument = vi.fn().mockResolvedValue(savedProject)
    const onProjectUpdated = vi.fn()
    const { WriterProjectDocumentsDialog } = await import('../components/WriterProjectDocumentsDialog')

    render(
      <WriterProjectDocumentsDialog
        project={PROJECT}
        onClose={vi.fn()}
        onProjectUpdated={onProjectUpdated}
        onSaveDocument={onSaveDocument}
      />
    )

    await user.type(
      screen.getByRole('textbox', { name: 'writer.story_studio.author_goal' }),
      updatedStoryBible.authorGoal
    )
    await user.click(screen.getByRole('button', { name: 'writer.story_studio.add_character' }))
    const characterName = screen.getByRole('textbox', { name: 'common.name' })
    await user.clear(characterName)
    await user.type(characterName, 'Mara')
    await user.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(onSaveDocument).toHaveBeenCalledWith({
        kind: 'storyBible',
        document: updatedStoryBible,
        expectedRevision: REVISION_A
      })
    })
    expect(onProjectUpdated).toHaveBeenCalledWith(savedProject)
  })

  it('validates and saves a complete structured document with its current revision', async () => {
    const onClose = vi.fn()
    const onProjectUpdated = vi.fn()
    const updatedStoryBible = { ...PROJECT.storyBible, authorGoal: 'Make every choice carry a visible cost.' }
    const savedProject: WriterProject = {
      ...PROJECT,
      storyBible: updatedStoryBible,
      documentRevisions: { ...PROJECT.documentRevisions, storyBible: REVISION_B }
    }
    const onSaveDocument = vi.fn().mockResolvedValue(savedProject)
    const { WriterProjectDocumentsDialog } = await import('../components/WriterProjectDocumentsDialog')

    const { container } = render(
      <WriterProjectDocumentsDialog
        project={PROJECT}
        onClose={onClose}
        onProjectUpdated={onProjectUpdated}
        onSaveDocument={onSaveDocument}
      />
    )
    expect(container.querySelector('[data-ui="writer.documents.dialog"]')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'writer.story_studio.json_mode' }))
    const editor = await screen.findByRole('textbox', { name: 'project-document-editor' })
    fireEvent.change(editor, { target: { value: JSON.stringify(updatedStoryBible, null, 2) } })
    fireEvent.click(screen.getByRole('tab', { name: 'writer.documents.tabs.outline' }))
    expect(editor).toHaveValue(JSON.stringify(PROJECT.outline, null, 2))
    fireEvent.click(screen.getByRole('tab', { name: /writer.documents.tabs.story_bible/ }))
    expect(editor).toHaveValue(JSON.stringify(updatedStoryBible, null, 2))
    fireEvent.click(container.querySelector('[data-ui="writer.documents.save"]')!)

    await waitFor(() => {
      expect(onSaveDocument).toHaveBeenCalledWith({
        kind: 'storyBible',
        document: updatedStoryBible,
        expectedRevision: REVISION_A
      })
    })
    expect(onProjectUpdated).toHaveBeenCalledWith(savedProject)
    expect(editor).toHaveValue(JSON.stringify(updatedStoryBible, null, 2))
  })

  it('blocks invalid JSON before the save boundary', async () => {
    const onSaveDocument = vi.fn()
    const { WriterProjectDocumentsDialog } = await import('../components/WriterProjectDocumentsDialog')

    const { container } = render(
      <WriterProjectDocumentsDialog
        project={PROJECT}
        onClose={vi.fn()}
        onProjectUpdated={vi.fn()}
        onSaveDocument={onSaveDocument}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'writer.story_studio.json_mode' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'project-document-editor' }), {
      target: { value: '{ invalid json' }
    })
    fireEvent.click(container.querySelector('[data-ui="writer.documents.save"]')!)

    expect(onSaveDocument).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('writer.documents.errors.invalid_json')
  })

  it('preserves a newer draft edit while an earlier save is in flight', async () => {
    let resolveSave!: (project: WriterProject) => void
    const savePending = new Promise<WriterProject>((resolve) => {
      resolveSave = resolve
    })
    const onSaveDocument = vi.fn(() => savePending)
    const { WriterProjectDocumentsDialog } = await import('../components/WriterProjectDocumentsDialog')
    const firstDocument = { ...PROJECT.storyBible, authorGoal: 'First submitted edit.' }
    const newerDocument = { ...PROJECT.storyBible, authorGoal: 'Newer local edit.' }
    const savedProject = {
      ...PROJECT,
      storyBible: firstDocument,
      documentRevisions: { ...PROJECT.documentRevisions, storyBible: REVISION_B }
    }

    const { container } = render(
      <WriterProjectDocumentsDialog
        project={PROJECT}
        onClose={vi.fn()}
        onProjectUpdated={vi.fn()}
        onSaveDocument={onSaveDocument}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'writer.story_studio.json_mode' }))
    const editor = await screen.findByRole('textbox', { name: 'project-document-editor' })
    fireEvent.change(editor, { target: { value: JSON.stringify(firstDocument, null, 2) } })
    fireEvent.click(container.querySelector('[data-ui="writer.documents.save"]')!)
    await waitFor(() => expect(onSaveDocument).toHaveBeenCalledTimes(1))
    fireEvent.change(editor, { target: { value: JSON.stringify(newerDocument, null, 2) } })
    await act(async () => resolveSave(savedProject))

    expect(editor).toHaveValue(JSON.stringify(newerDocument, null, 2))
    expect(container.querySelector('[data-ui="writer.documents.save"]')).not.toBeDisabled()
  })

  it('keeps a conflicting draft and confirms before closing with unsaved changes', async () => {
    const onClose = vi.fn()
    const onSaveDocument = vi.fn().mockRejectedValue(new IpcError(writerErrorCodes.REVISION_CONFLICT))
    const { WriterProjectDocumentsDialog } = await import('../components/WriterProjectDocumentsDialog')

    const { container } = render(
      <WriterProjectDocumentsDialog
        project={PROJECT}
        onClose={onClose}
        onProjectUpdated={vi.fn()}
        onSaveDocument={onSaveDocument}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'writer.story_studio.json_mode' }))
    const editor = await screen.findByRole('textbox', { name: 'project-document-editor' })
    const conflictingDraft = JSON.stringify({ ...PROJECT.storyBible, authorGoal: 'Keep this local draft.' }, null, 2)
    fireEvent.change(editor, { target: { value: conflictingDraft } })
    fireEvent.click(container.querySelector('[data-ui="writer.documents.save"]')!)

    expect(await screen.findByRole('alert')).toHaveTextContent('writer.documents.errors.conflict')
    expect(editor).toHaveValue(conflictingDraft)
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(screen.getByText('writer.documents.close_confirm.title')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'writer.documents.close_confirm.confirm' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
