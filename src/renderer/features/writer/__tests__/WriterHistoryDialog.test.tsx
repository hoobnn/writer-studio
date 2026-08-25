import { IpcError } from '@shared/ipc/errors/IpcError'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import type { WriterChapterDocument, WriterHistorySnapshot, WriterHistorySummary } from '@shared/types/writer'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  t: vi.fn((key: string) => key)
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t })
}))

vi.mock('@renderer/ipc', () => ({ ipcApi: { request: mocks.request } }))

vi.mock('@cherrystudio/ui/components/composites/code-editor', () => ({
  default: ({ value }: { value: string }) => <pre data-testid="history-markdown">{value}</pre>
}))

const REVISION_A = 'a'.repeat(64)
const REVISION_B = 'b'.repeat(64)
const NOW = '2026-08-24T00:00:00.000Z'
const FILE_NAME = '1755993600000-aaaaaaaaaaaa-chapter-1.md'

const DOCUMENT: WriterChapterDocument = {
  chapter: {
    id: 'chapter-1',
    title: 'Chapter One',
    fileName: 'chapter-1.md',
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    revision: REVISION_A
  },
  content: 'Current manuscript'
}

const SUMMARY: WriterHistorySummary = {
  fileName: FILE_NAME,
  createdAt: NOW,
  revision: REVISION_B,
  characterCount: 19
}

const SNAPSHOT: WriterHistorySnapshot = { ...SUMMARY, content: 'Historical manuscript' }
const RESTORED: WriterChapterDocument = {
  chapter: { ...DOCUMENT.chapter, revision: REVISION_B },
  content: SNAPSHOT.content
}

describe('WriterHistoryDialog', () => {
  beforeEach(() => mocks.request.mockReset())

  it('reads, diffs, and restores a selected snapshot through the revision gate', async () => {
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.history.list') return { history: [SUMMARY] }
      if (route === 'writer.history.read') return SNAPSHOT
      if (route === 'writer.history.restore') return RESTORED
      if (route === undefined) return undefined
      throw new Error(`Unexpected route: ${route}`)
    })
    const onRestored = vi.fn()
    const { WriterHistoryDialog } = await import('../components/WriterHistoryDialog')
    const { container } = render(
      <WriterHistoryDialog rootPath="/books/my-novel" document={DOCUMENT} onClose={vi.fn()} onRestored={onRestored} />
    )

    expect(container.querySelector('[data-ui="writer.history.dialog"]')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('[data-ui="writer.history.read"]')).toBeInTheDocument())
    fireEvent.click(container.querySelector('[data-ui="writer.history.read"]')!)
    await waitFor(() => expect(screen.getByTestId('history-markdown')).toHaveTextContent(SNAPSHOT.content))
    expect(mocks.request).toHaveBeenCalledWith('writer.history.read', {
      rootPath: '/books/my-novel',
      chapterId: DOCUMENT.chapter.id,
      fileName: FILE_NAME
    })
    expect(container.querySelector('[data-diff-kind="removed"]')).toHaveTextContent(DOCUMENT.content)
    expect(container.querySelector('[data-diff-kind="added"]')).toHaveTextContent(SNAPSHOT.content)

    fireEvent.click(container.querySelector('[data-ui="writer.history.restore"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'writer.history.restore_confirm.confirm' }))

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.history.restore', {
        rootPath: '/books/my-novel',
        chapterId: DOCUMENT.chapter.id,
        fileName: FILE_NAME,
        expectedRevision: REVISION_A
      })
    })
    expect(onRestored).toHaveBeenCalledWith(RESTORED)
  })

  it('preserves the current manuscript when a stale restore is rejected', async () => {
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.history.list') return { history: [SUMMARY] }
      if (route === 'writer.history.read') return SNAPSHOT
      if (route === 'writer.history.restore') throw new IpcError(writerErrorCodes.REVISION_CONFLICT)
      if (route === undefined) return undefined
      throw new Error(`Unexpected route: ${route}`)
    })
    const onRestored = vi.fn()
    const { WriterHistoryDialog } = await import('../components/WriterHistoryDialog')
    const { container } = render(
      <WriterHistoryDialog rootPath="/books/my-novel" document={DOCUMENT} onClose={vi.fn()} onRestored={onRestored} />
    )

    await waitFor(() => expect(container.querySelector('[data-ui="writer.history.read"]')).toBeInTheDocument())
    fireEvent.click(container.querySelector('[data-ui="writer.history.read"]')!)
    await waitFor(() => expect(screen.getByTestId('history-markdown')).toBeInTheDocument())
    fireEvent.click(container.querySelector('[data-ui="writer.history.restore"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'writer.history.restore_confirm.confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('writer.history.errors.conflict')
    expect(onRestored).not.toHaveBeenCalled()
    expect(container.querySelector('[data-diff-kind="removed"]')).toHaveTextContent(DOCUMENT.content)
  })
})
