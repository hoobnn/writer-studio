import { IpcError } from '@shared/ipc/errors/IpcError'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import type { WriterLoreEntry, WriterProject } from '@shared/types/writer'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseLoreKeys, WriterLorebookDialog } from '../components/WriterLorebookDialog'
import type { WriterProjectDocumentSaveRequest } from '../projectDocuments'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const REVISION_A = 'a'.repeat(64)
const REVISION_B = 'b'.repeat(64)
const NOW = '2026-08-24T00:00:00.000Z'

const EXISTING_ENTRY: WriterLoreEntry = {
  id: 'brass-key',
  title: 'The Brass Key',
  content: 'The key opens the sealed archive.',
  keys: ['Brass Key'],
  enabled: true,
  alwaysActive: false,
  caseSensitive: false,
  matchWholeWords: true,
  order: 120
}

function makeProject(loreEntries: WriterLoreEntry[] = []): WriterProject {
  return {
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
      loreEntries,
      worldRules: [],
      styleGuide: []
    },
    outline: { schemaVersion: 1, bookSummary: '', arcs: [], chapterPlans: [] },
    continuity: { schemaVersion: 1, facts: [], foreshadowing: [], chapterSummaries: [] },
    documentRevisions: { storyBible: REVISION_A, outline: REVISION_A, continuity: REVISION_A }
  }
}

function savedProject(request: WriterProjectDocumentSaveRequest): WriterProject {
  if (request.kind !== 'storyBible') throw new Error('Expected a Story Bible save')
  return {
    ...makeProject(request.document.loreEntries),
    storyBible: request.document,
    documentRevisions: { storyBible: REVISION_B, outline: REVISION_A, continuity: REVISION_A }
  }
}

describe('WriterLorebookDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds, edits, and saves a complete lore entry with the Story Bible revision', async () => {
    const project = makeProject()
    const onProjectUpdated = vi.fn()
    const onSaveDocument = vi.fn(async (request: WriterProjectDocumentSaveRequest) => savedProject(request))
    const { container } = render(
      <WriterLorebookDialog
        project={project}
        onClose={vi.fn()}
        onProjectUpdated={onProjectUpdated}
        onSaveDocument={onSaveDocument}
      />
    )

    fireEvent.click(container.querySelector('[data-ui="writer.lorebook.add"]')!)
    fireEvent.change(screen.getByLabelText('writer.lorebook.title_field'), { target: { value: 'Moon Gate' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'writer.lorebook.keys' }), {
      target: { value: 'moon\nnight' }
    })
    fireEvent.change(screen.getByLabelText('writer.lorebook.content'), {
      target: { value: 'The Moon Gate opens only at midnight.' }
    })
    fireEvent.click(container.querySelector('[data-ui="writer.lorebook.save"]')!)

    await waitFor(() => expect(onSaveDocument).toHaveBeenCalledTimes(1))
    const request = onSaveDocument.mock.calls[0][0]
    expect(request).toMatchObject({ kind: 'storyBible', expectedRevision: REVISION_A })
    if (request.kind !== 'storyBible') throw new Error('Expected a Story Bible save')
    expect(request.document.loreEntries).toEqual([
      expect.objectContaining({
        title: 'Moon Gate',
        content: 'The Moon Gate opens only at midnight.',
        keys: ['moon', 'night'],
        alwaysActive: false
      })
    ])
    expect(onProjectUpdated).toHaveBeenCalledWith(savedProject(request))
  })

  it('blocks an entry without activation keys unless it is always active', () => {
    const onSaveDocument = vi.fn()
    const { container } = render(
      <WriterLorebookDialog
        project={makeProject()}
        onClose={vi.fn()}
        onProjectUpdated={vi.fn()}
        onSaveDocument={onSaveDocument}
      />
    )

    fireEvent.click(container.querySelector('[data-ui="writer.lorebook.add"]')!)
    fireEvent.change(screen.getByLabelText('writer.lorebook.title_field'), { target: { value: 'Moon Gate' } })
    fireEvent.change(screen.getByLabelText('writer.lorebook.content'), { target: { value: 'Opens at midnight.' } })
    fireEvent.click(container.querySelector('[data-ui="writer.lorebook.save"]')!)

    expect(onSaveDocument).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('writer.lorebook.errors.invalid')
  })

  it('preserves the edited lore draft when a revision conflict rejects the save', async () => {
    const onSaveDocument = vi.fn().mockRejectedValue(new IpcError(writerErrorCodes.REVISION_CONFLICT))
    render(
      <WriterLorebookDialog
        project={makeProject([EXISTING_ENTRY])}
        onClose={vi.fn()}
        onProjectUpdated={vi.fn()}
        onSaveDocument={onSaveDocument}
      />
    )

    const title = screen.getByLabelText('writer.lorebook.title_field')
    fireEvent.change(title, { target: { value: 'Edited Brass Key' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('writer.lorebook.errors.conflict')
    expect(title).toHaveValue('Edited Brass Key')
  })

  it('keeps a later edit dirty when an earlier save completes', async () => {
    let resolveSave!: (project: WriterProject) => void
    const pending = new Promise<WriterProject>((resolve) => {
      resolveSave = resolve
    })
    const onSaveDocument = vi.fn<(request: WriterProjectDocumentSaveRequest) => Promise<WriterProject>>(() => pending)
    const project = makeProject([EXISTING_ENTRY])
    const { container } = render(
      <WriterLorebookDialog
        project={project}
        onClose={vi.fn()}
        onProjectUpdated={vi.fn()}
        onSaveDocument={onSaveDocument}
      />
    )
    const title = screen.getByLabelText('writer.lorebook.title_field')
    fireEvent.change(title, { target: { value: 'Submitted title' } })
    fireEvent.click(container.querySelector('[data-ui="writer.lorebook.save"]')!)
    await waitFor(() => expect(onSaveDocument).toHaveBeenCalledTimes(1))
    const request = onSaveDocument.mock.calls[0][0]

    title.removeAttribute('disabled')
    fireEvent.change(title, { target: { value: 'Newer local title' } })
    await act(async () => resolveSave(savedProject(request)))

    expect(title).toHaveValue('Newer local title')
    expect(container.querySelector('[data-ui="writer.lorebook.save"]')).not.toBeDisabled()
  })

  it('does not persist a removal until Save and exposes the entry list accessibly', async () => {
    const onProjectUpdated = vi.fn()
    const onSaveDocument = vi.fn(async (request: WriterProjectDocumentSaveRequest) => savedProject(request))
    const { container } = render(
      <WriterLorebookDialog
        project={makeProject([EXISTING_ENTRY])}
        onClose={vi.fn()}
        onProjectUpdated={onProjectUpdated}
        onSaveDocument={onSaveDocument}
      />
    )

    expect(screen.getByRole('list', { name: 'writer.memory.lorebook' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'writer.lorebook.remove_entry' }))
    expect(onSaveDocument).not.toHaveBeenCalled()
    expect(onProjectUpdated).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('[data-ui="writer.lorebook.save"]')!)
    await waitFor(() => expect(onSaveDocument).toHaveBeenCalledTimes(1))
    const request = onSaveDocument.mock.calls[0][0]
    if (request.kind !== 'storyBible') throw new Error('Expected a Story Bible save')
    expect(request.document.loreEntries).toEqual([])
  })

  it('asks before closing with unsaved lorebook changes', async () => {
    const onClose = vi.fn()
    render(
      <WriterLorebookDialog
        project={makeProject([EXISTING_ENTRY])}
        onClose={onClose}
        onProjectUpdated={vi.fn()}
        onSaveDocument={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('writer.lorebook.title_field'), { target: { value: 'Unsaved title' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(screen.getByText('writer.lorebook.close_confirm.title')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'writer.lorebook.close_confirm.confirm' }))
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('trims, removes empty lines, deduplicates, and caps activation keys', () => {
    const keys = Array.from({ length: 25 }, (_, index) => `key-${index}`)
    expect(parseLoreKeys(` Alpha \n\nBeta\r\nAlpha\n${keys.join('\n')}`)).toEqual([
      'Alpha',
      'Beta',
      ...keys.slice(0, 18)
    ])
  })
})
