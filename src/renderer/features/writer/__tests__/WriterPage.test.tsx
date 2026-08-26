import type { WriterChapterDocument, WriterProject, WriterProposal } from '@shared/types/writer'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildProposalTargetContent,
  WRITER_DIFF_MAX_TOTAL_CHARS,
  WriterProposalDiff
} from '../components/WriterProposalDiff'
import { getProposalApplyModes } from '../utils'

const mocks = vi.hoisted(() => ({
  recentProjectRoot: null as string | null,
  recoveryDrafts: {} as Record<string, unknown>,
  activeJobIds: {} as Record<string, unknown>,
  quickModel: { id: 'provider::quick-model', name: 'Quick Writer Model', providerId: 'provider' } as
    | { id: string; name: string; providerId: string }
    | undefined,
  request: vi.fn(),
  selectFolder: vi.fn(),
  setRecentProjectRoot: vi.fn(),
  setRecoveryDrafts: vi.fn(),
  setActiveJobIds: vi.fn()
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@renderer/data/hooks/useCache', () => ({
  usePersistCache: (key: string) => {
    if (key === 'ui.writer.last_project_root') return [mocks.recentProjectRoot, mocks.setRecentProjectRoot]
    if (key === 'ui.writer.recovery_drafts') return [mocks.recoveryDrafts, mocks.setRecoveryDrafts]
    if (key === 'ui.writer.active_job_ids') return [mocks.activeJobIds, mocks.setActiveJobIds]
    throw new Error(`Unexpected persist cache key: ${key}`)
  }
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mocks.request }
}))

vi.mock('@renderer/hooks/useModel', () => ({
  useDefaultModel: () => ({
    quickModel: mocks.quickModel
  })
}))

vi.mock('@shared/utils/model', () => ({
  isNonChatModel: () => false
}))

vi.mock('@renderer/components/ModelSelector', () => ({
  ModelSelector: ({ trigger, onSelect }: { trigger: ReactNode; onSelect: (model: unknown) => void }) => (
    <>
      {trigger}
      <button
        type="button"
        aria-label="select-test-model"
        onClick={() =>
          onSelect({ id: 'provider::selected-model', name: 'Selected Writer Model', providerId: 'provider' })
        }
      />
    </>
  )
}))

vi.mock('@cherrystudio/ui/components/composites/code-editor', () => ({
  default: ({
    value,
    editable = true,
    onChange,
    placeholder
  }: {
    value: string
    editable?: boolean
    onChange?: (value: string) => void
    placeholder?: string
  }) =>
    editable ? (
      <textarea aria-label={placeholder} value={value} onChange={(event) => onChange?.(event.target.value)} />
    ) : (
      <pre>{value}</pre>
    )
}))

vi.mock('@renderer/hooks/useJob', () => ({
  useJob: () => ({
    data: {
      id: 'job-1',
      status: 'completed',
      output: { proposalId: PROPOSAL.id },
      error: null
    },
    isTerminal: true,
    isLoading: false,
    error: undefined
  }),
  useJobProgress: () => ({ progress: 100 })
}))

vi.mock('@cherrystudio/ui', async () => {
  const React = await import('react')
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({})

  return {
    Badge: (props: { children: ReactNode; variant?: string }) => {
      const { children, ...spanProps } = props
      Reflect.deleteProperty(spanProps, 'variant')
      return <span {...spanProps}>{children}</span>
    },
    Button: (
      props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
        children: ReactNode
        loading?: boolean
        size?: string
        variant?: string
      }
    ) => {
      const { children, ...buttonProps } = props
      Reflect.deleteProperty(buttonProps, 'loading')
      Reflect.deleteProperty(buttonProps, 'variant')
      Reflect.deleteProperty(buttonProps, 'size')
      return (
        <button type={props.type ?? 'button'} {...buttonProps}>
          {children}
        </button>
      )
    },
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    NormalTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    ResizableHandle: () => <div data-testid="resizable-handle" />,
    ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Select: ({ children, onValueChange }: { children: ReactNode; onValueChange?: (value: string) => void }) => (
      <SelectContext value={{ onValueChange }}>{children}</SelectContext>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const context = React.use(SelectContext)
      return (
        <button type="button" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
    SelectValue: () => null,
    Spinner: ({ text }: { text?: string }) => <div>{text}</div>,
    Textarea: {
      Input: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />
    },
    useResizablePanelRef: () => React.useRef(null),
    ConfirmDialog: ({ open, title, onConfirm }: { open?: boolean; title?: ReactNode; onConfirm?: () => void }) =>
      open ? (
        <div role="dialog">
          <span>{title}</span>
          <button type="button" onClick={onConfirm}>
            confirm
          </button>
        </div>
      ) : null
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
    genre: 'Fantasy',
    premise: 'A promise that cannot be broken.',
    targetWordCount: 120000,
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
  continuity: {
    schemaVersion: 1,
    facts: [],
    foreshadowing: [],
    chapterSummaries: []
  },
  documentRevisions: {
    storyBible: REVISION_A,
    outline: REVISION_B,
    continuity: REVISION_C
  }
}

const CHAPTER: WriterChapterDocument = {
  chapter: PROJECT.manifest.chapters[0],
  content: 'Original manuscript'
}

const APPLIED_CHAPTER: WriterChapterDocument = {
  chapter: { ...CHAPTER.chapter, revision: REVISION_C },
  content: 'Generated proposal'
}

const SAVED_CHAPTER: WriterChapterDocument = {
  chapter: { ...CHAPTER.chapter, revision: REVISION_B },
  content: 'Edited manuscript'
}

const PROPOSAL: WriterProposal = {
  id: 'proposal-1',
  projectId: PROJECT.manifest.id,
  chapterId: CHAPTER.chapter.id,
  baseRevision: REVISION_A,
  operation: 'continue',
  uniqueModelId: 'provider::model',
  mode: 'append',
  content: 'Generated proposal',
  createdAt: NOW,
  status: 'pending',
  contextPacket: {
    projectId: PROJECT.manifest.id,
    chapterId: CHAPTER.chapter.id,
    operation: 'continue',
    generatedAt: NOW,
    budgetChars: 12000,
    usedChars: 100,
    truncated: false,
    sources: [
      {
        kind: 'hard_rule',
        label: 'Promises have a cost.',
        content: 'Promises have a cost.',
        priority: 100,
        truncated: false
      }
    ]
  }
}

const PROPOSAL_SUMMARY = {
  id: PROPOSAL.id,
  chapterId: PROPOSAL.chapterId,
  baseRevision: PROPOSAL.baseRevision,
  operation: PROPOSAL.operation,
  uniqueModelId: PROPOSAL.uniqueModelId,
  mode: PROPOSAL.mode,
  createdAt: PROPOSAL.createdAt,
  status: PROPOSAL.status
} as const

describe('WriterPage', () => {
  beforeEach(() => {
    mocks.recentProjectRoot = null
    mocks.recoveryDrafts = {}
    mocks.activeJobIds = {}
    mocks.quickModel = { id: 'provider::quick-model', name: 'Quick Writer Model', providerId: 'provider' }
    mocks.request.mockReset()
    mocks.selectFolder.mockReset()
    mocks.setRecentProjectRoot.mockReset()
    mocks.setRecoveryDrafts.mockReset()
    mocks.setActiveJobIds.mockReset()
    Object.assign(window.api.file, { selectFolder: mocks.selectFolder })
  })

  it('allows only operation-safe proposal apply modes', () => {
    expect(getProposalApplyModes('draft')).toEqual(['replace'])
    expect(getProposalApplyModes('rewrite')).toEqual(['replace'])
    expect(getProposalApplyModes('continue')).toEqual(['append'])
    expect(getProposalApplyModes('brainstorm')).toEqual([])
    expect(getProposalApplyModes('chapter_plan')).toEqual([])
    expect(getProposalApplyModes('review')).toEqual([])
    expect(getProposalApplyModes('summarize')).toEqual([])
    expect(buildProposalTargetContent('Current', 'Proposal', 'continue')).toBe('Current\n\nProposal')
  })

  it('bounds huge diff previews and includes the changed text in accessible labels', () => {
    const currentContent = `same\n${'a'.repeat(WRITER_DIFF_MAX_TOTAL_CHARS / 2)}`
    const proposalContent = `same\n${'b'.repeat(WRITER_DIFF_MAX_TOTAL_CHARS / 2)}`
    const { container } = render(
      <WriterProposalDiff currentContent={currentContent} operation="rewrite" proposalContent={proposalContent} />
    )

    expect(screen.getByText('writer.copilot.diff_truncated')).toBeInTheDocument()
    const added = container.querySelector('[data-diff-kind="added"]')
    expect(added?.getAttribute('aria-label')).toContain('b')
  })

  it('creates a project with the complete welcome form payload', async () => {
    mocks.selectFolder.mockResolvedValue('/books')
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.create') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    fireEvent.click(screen.getByRole('button', { name: 'writer.create.choose_parent_directory' }))
    await waitFor(() => expect(mocks.selectFolder).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('writer.create.book_title'), { target: { value: 'My Novel' } })
    fireEvent.change(screen.getByLabelText('writer.create.genre'), { target: { value: 'Fantasy' } })
    fireEvent.change(screen.getByLabelText('writer.create.target_word_count'), { target: { value: '120000' } })
    fireEvent.change(screen.getByLabelText('writer.create.premise'), {
      target: { value: 'A promise that cannot be broken.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'writer.create.submit' }))

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.project.create', {
        parentDirectory: '/books',
        title: 'My Novel',
        initialChapterTitle: 'writer.chapter.default_title',
        genre: 'Fantasy',
        premise: 'A promise that cannot be broken.',
        targetWordCount: 120000
      })
    })
  })

  it('auto-reopens the recent project and restores a same-revision recovery draft', async () => {
    const recoveryContent = 'Recovered unsaved manuscript'
    const cacheKey = JSON.stringify([PROJECT.rootPath, CHAPTER.chapter.id])
    mocks.recentProjectRoot = PROJECT.rootPath
    mocks.recoveryDrafts = {
      [cacheKey]: {
        rootPath: PROJECT.rootPath,
        chapterId: CHAPTER.chapter.id,
        baseRevision: REVISION_A,
        content: recoveryContent,
        updatedAt: NOW
      }
    }
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.chapter.save') {
        return { chapter: { ...CHAPTER.chapter, revision: REVISION_B }, content: recoveryContent }
      }
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue(recoveryContent))
    expect(mocks.request).toHaveBeenCalledWith('writer.project.open', { rootPath: PROJECT.rootPath })
    expect(screen.getByText('writer.editor.status.dirty')).toBeInTheDocument()
  })

  it('lets writers collapse side panels and restores their previous layout after focus mode', async () => {
    const user = userEvent.setup()
    mocks.recentProjectRoot = PROJECT.rootPath
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'writer.workspace.chapters' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'writer.copilot.title' })).toBeInTheDocument()

    const instruction = screen.getByRole('textbox', { name: 'writer.copilot.instruction' })
    await user.type(instruction, 'Keep the quiet tension.')
    await user.click(screen.getByRole('button', { name: 'writer.workspace.hide_copilot' }))
    expect(screen.queryByRole('heading', { name: 'writer.copilot.title' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'writer.workspace.show_copilot' }))
    expect(screen.getByRole('textbox', { name: 'writer.copilot.instruction' })).toHaveValue('Keep the quiet tension.')

    await user.click(screen.getByRole('button', { name: 'writer.workspace.hide_chapters' }))
    expect(screen.queryByRole('heading', { name: 'writer.workspace.chapters' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'writer.workspace.enter_focus' }))
    expect(screen.queryByRole('heading', { name: 'writer.copilot.title' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'writer.workspace.exit_focus' }))
    expect(screen.queryByRole('heading', { name: 'writer.workspace.chapters' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'writer.copilot.title' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'writer.workspace.show_chapters' }))
    expect(screen.getByRole('heading', { name: 'writer.workspace.chapters' })).toBeInTheDocument()
  })

  it('keeps a mismatched recovery draft in conflict with explicit copy and discard exits', async () => {
    const cacheKey = JSON.stringify([PROJECT.rootPath, CHAPTER.chapter.id])
    mocks.recentProjectRoot = PROJECT.rootPath
    mocks.recoveryDrafts = {
      [cacheKey]: {
        rootPath: PROJECT.rootPath,
        chapterId: CHAPTER.chapter.id,
        baseRevision: REVISION_B,
        content: 'Conflicting recovered manuscript',
        updatedAt: NOW
      }
    }
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    await waitFor(() => expect(screen.getByText('writer.editor.status.conflict')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'writer.editor.copy_draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'writer.editor.discard_and_reload' })).toBeInTheDocument()
  })

  it('reattaches to the persisted active job for the current project chapter', async () => {
    const cacheKey = JSON.stringify([PROJECT.rootPath, CHAPTER.chapter.id])
    mocks.recentProjectRoot = PROJECT.rootPath
    mocks.activeJobIds = { [cacheKey]: { jobId: 'job-1', updatedAt: NOW } }
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.proposal.read') return PROPOSAL
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    await waitFor(() => expect(screen.getAllByText('Generated proposal').length).toBeGreaterThan(0))
    expect(screen.getByText('writer.copilot.job_status.completed')).toBeInTheDocument()
  })

  it('discovers and reopens a pending proposal persisted on disk', async () => {
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.proposal.list') return { proposals: [PROPOSAL_SUMMARY] }
      if (route === 'writer.proposal.read') return PROPOSAL
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    const { container } = render(<WriterPage />)
    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))

    await waitFor(() => expect(container.querySelector('[data-ui="writer.proposals.load"]')).toBeInTheDocument())
    fireEvent.click(container.querySelector('[data-ui="writer.proposals.load"]')!)

    await waitFor(() => expect(screen.getByRole('button', { name: 'writer.copilot.append' })).toBeInTheDocument())
    expect(mocks.request).toHaveBeenCalledWith('writer.proposal.read', {
      rootPath: PROJECT.rootPath,
      proposalId: PROPOSAL.id
    })
  })

  it('previews active lore and shows included and dropped activation receipts', async () => {
    const projectWithLore: WriterProject = {
      ...PROJECT,
      storyBible: {
        ...PROJECT.storyBible,
        loreEntries: [
          {
            id: 'original-lore',
            title: 'Original lore',
            content: 'The original manuscript is stored in a sealed archive.',
            keys: ['Original'],
            enabled: true,
            alwaysActive: false,
            caseSensitive: false,
            matchWholeWords: false,
            order: 100
          }
        ]
      }
    }
    const proposalWithLore: WriterProposal = {
      ...PROPOSAL,
      contextPacket: {
        ...PROPOSAL.contextPacket,
        loreActivations: [
          {
            entryId: 'original-lore',
            title: 'Original lore',
            activation: 'keyword',
            matchedKeys: ['Original'],
            status: 'included',
            truncated: false
          },
          {
            entryId: 'late-lore',
            title: 'Late lore',
            activation: 'always',
            matchedKeys: [],
            status: 'dropped',
            truncated: false
          }
        ]
      }
    }
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return projectWithLore
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.proposal.list') return { proposals: [PROPOSAL_SUMMARY] }
      if (route === 'writer.proposal.read') return proposalWithLore
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    const { container } = render(<WriterPage />)
    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))

    await waitFor(() => expect(screen.getByText('writer.copilot.source_lorebook').parentElement).toHaveTextContent('1'))
    await waitFor(() => expect(container.querySelector('[data-ui="writer.proposals.load"]')).toBeInTheDocument())
    fireEvent.click(container.querySelector('[data-ui="writer.proposals.load"]')!)

    await waitFor(() => expect(screen.getByText('writer.copilot.lore_receipts')).toBeInTheDocument())
    expect(screen.getByText('Original lore')).toBeInTheDocument()
    expect(screen.getByText('Late lore')).toBeInTheDocument()
    expect(screen.getByText('writer.copilot.lore_status.included')).toBeInTheDocument()
    expect(screen.getByText('writer.copilot.lore_status.dropped')).toBeInTheDocument()
  })

  it('previews the exact generation context and invalidates it when the instruction changes', async () => {
    const user = userEvent.setup()
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.context.preview') {
        return { uniqueModelId: 'provider::quick-model', packet: PROPOSAL.contextPacket }
      }
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)
    await user.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'writer.context.preview' }))

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.context.preview', {
        rootPath: PROJECT.rootPath,
        chapterId: CHAPTER.chapter.id,
        operation: 'continue',
        uniqueModelId: 'provider::quick-model'
      })
    })
    expect(screen.getByRole('progressbar', { name: 'writer.context.budget_usage' })).toBeInTheDocument()
    expect(screen.getAllByText('Promises have a cost.').length).toBeGreaterThan(0)

    await user.type(screen.getByRole('textbox', { name: 'writer.copilot.instruction' }), 'Change direction')
    expect(screen.queryByRole('progressbar', { name: 'writer.context.budget_usage' })).not.toBeInTheDocument()
  })

  it('keeps the active job recovery mapping when proposal read fails transiently', async () => {
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.proposal.list') return { proposals: [PROPOSAL_SUMMARY] }
      if (route === 'writer.generation.start') return { id: 'job-1' }
      if (route === 'writer.proposal.read') throw new Error('transient read failure')
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    const { container } = render(<WriterPage />)
    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.start' }))

    await waitFor(() => expect(screen.getByText('writer.errors.load_proposal')).toBeInTheDocument())
    const mapped = mocks.setActiveJobIds.mock.calls.reduce<Record<string, unknown>>((current, [update]) => {
      return typeof update === 'function' ? update(current) : update
    }, {})
    expect(mapped[JSON.stringify([PROJECT.rootPath, CHAPTER.chapter.id])]).toMatchObject({ jobId: 'job-1' })
    expect(container.querySelector('[data-ui="writer.proposals.load"]')).toBeInTheDocument()
  })

  it('keeps a newly started completed job mapped until its proposal is applied', async () => {
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.generation.start') return { id: 'job-1' }
      if (route === 'writer.proposal.read') return PROPOSAL
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)
    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.start' }))
    await waitFor(() => expect(screen.getAllByText('Generated proposal').length).toBeGreaterThan(0))

    const mapped = mocks.setActiveJobIds.mock.calls.reduce<Record<string, unknown>>((current, [update]) => {
      return typeof update === 'function' ? update(current) : update
    }, {})
    expect(mapped[JSON.stringify([PROJECT.rootPath, CHAPTER.chapter.id])]).toMatchObject({ jobId: 'job-1' })
  })

  it('keeps generation output out of the manuscript until an explicit apply action', async () => {
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.chapter.save') return SAVED_CHAPTER
      if (route === 'writer.generation.start') return { id: 'job-1' }
      if (route === 'writer.proposal.read') return PROPOSAL
      if (route === 'writer.proposal.apply') return APPLIED_CHAPTER
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    const { container } = render(<WriterPage />)

    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue('Original manuscript'))
    expect(screen.getByText('writer.copilot.data_notice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'writer.memory.manage_documents' })).toHaveAttribute(
      'data-ui',
      'writer.memory.manage'
    )
    expect(screen.getByRole('button', { name: 'writer.memory.review_continuity' })).toHaveAttribute(
      'data-ui',
      'writer.continuity-review.open'
    )

    fireEvent.change(screen.getByLabelText('writer.editor.placeholder'), { target: { value: 'Edited manuscript' } })
    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.start' }))
    await waitFor(() => expect(screen.getAllByText('Generated proposal').length).toBeGreaterThan(0))

    expect(mocks.request).toHaveBeenCalledWith('writer.chapter.save', {
      rootPath: PROJECT.rootPath,
      chapterId: CHAPTER.chapter.id,
      content: 'Edited manuscript',
      expectedRevision: REVISION_A
    })
    const requestedRoutes = mocks.request.mock.calls.map(([route]) => route)
    expect(requestedRoutes.indexOf('writer.chapter.save')).toBeLessThan(
      requestedRoutes.indexOf('writer.generation.start')
    )
    expect(mocks.request.mock.calls.find(([route]) => route === 'writer.generation.start')?.[1]).toEqual({
      rootPath: PROJECT.rootPath,
      chapterId: CHAPTER.chapter.id,
      operation: 'continue',
      uniqueModelId: 'provider::quick-model'
    })
    expect(mocks.request).toHaveBeenCalledWith('writer.proposal.read', {
      rootPath: PROJECT.rootPath,
      proposalId: PROPOSAL.id
    })
    expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue('Edited manuscript')
    expect(screen.getByText('writer.copilot.diff')).toBeInTheDocument()
    const addedDiffText = Array.from(container.querySelectorAll('[data-diff-kind="added"]'))
      .map((element) => element.textContent)
      .join('')
    expect(addedDiffText).toContain('Generated proposal')
    expect(mocks.request).not.toHaveBeenCalledWith('writer.proposal.apply', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.append' }))

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.proposal.apply', {
        rootPath: PROJECT.rootPath,
        proposalId: PROPOSAL.id,
        mode: 'append',
        expectedRevision: REVISION_B
      })
    })
  })

  it('lets an explicit model selection override the quick model', async () => {
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.generation.start') return { id: 'job-1' }
      if (route === 'writer.proposal.read') return PROPOSAL
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue('Original manuscript'))
    fireEvent.click(screen.getByRole('button', { name: 'select-test-model' }))
    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.start' }))

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.generation.start', {
        rootPath: PROJECT.rootPath,
        chapterId: CHAPTER.chapter.id,
        operation: 'continue',
        uniqueModelId: 'provider::selected-model'
      })
    })
  })

  it('uses the managed default label and omits model id only when no quick model exists', async () => {
    mocks.quickModel = undefined
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.generation.start') return { id: 'job-1' }
      if (route === 'writer.proposal.read') return PROPOSAL
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)

    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByText('writer.copilot.model_managed_default')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.start' }))

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.generation.start', {
        rootPath: PROJECT.rootPath,
        chapterId: CHAPTER.chapter.id,
        operation: 'continue'
      })
    })
  })

  it('locks manuscript editing while a proposal apply is in flight', async () => {
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    let resolveApply!: (document: WriterChapterDocument) => void
    const applyPending = new Promise<WriterChapterDocument>((resolve) => {
      resolveApply = resolve
    })
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'writer.project.open') return PROJECT
      if (route === 'writer.chapter.read') return CHAPTER
      if (route === 'writer.generation.start') return { id: 'job-1' }
      if (route === 'writer.proposal.read') return PROPOSAL
      if (route === 'writer.proposal.apply') return await applyPending
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)
    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.start' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'writer.copilot.append' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'writer.copilot.append' }))
    await waitFor(() => expect(screen.queryByLabelText('writer.editor.placeholder')).not.toBeInTheDocument())

    await act(async () => resolveApply(APPLIED_CHAPTER))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue(APPLIED_CHAPTER.content))
  })

  it('ignores a stale chapter read that resolves after the latest selection', async () => {
    const chapterTwo = {
      ...CHAPTER.chapter,
      id: 'chapter-2',
      title: 'Chapter Two',
      fileName: 'chapter-2.md',
      order: 1,
      revision: REVISION_B
    }
    const chapterThree = {
      ...CHAPTER.chapter,
      id: 'chapter-3',
      title: 'Chapter Three',
      fileName: 'chapter-3.md',
      order: 2,
      revision: REVISION_C
    }
    const project = {
      ...PROJECT,
      manifest: { ...PROJECT.manifest, chapters: [...PROJECT.manifest.chapters, chapterTwo, chapterThree] }
    }
    const documentTwo = { chapter: chapterTwo, content: 'Second chapter' }
    const documentThree = { chapter: chapterThree, content: 'Third chapter' }
    let resolveSave!: (document: WriterChapterDocument) => void
    let resolveTwo!: (document: WriterChapterDocument) => void
    let resolveThree!: (document: WriterChapterDocument) => void
    const savePending = new Promise<WriterChapterDocument>((resolve) => {
      resolveSave = resolve
    })
    const readTwoPending = new Promise<WriterChapterDocument>((resolve) => {
      resolveTwo = resolve
    })
    const readThreePending = new Promise<WriterChapterDocument>((resolve) => {
      resolveThree = resolve
    })
    mocks.selectFolder.mockResolvedValue(PROJECT.rootPath)
    mocks.request.mockImplementation(async (route: string, input: { chapterId?: string }) => {
      if (route === 'writer.project.open') return project
      if (route === 'writer.chapter.save') return await savePending
      if (route === 'writer.chapter.read' && input.chapterId === CHAPTER.chapter.id) return CHAPTER
      if (route === 'writer.chapter.read' && input.chapterId === chapterTwo.id) return await readTwoPending
      if (route === 'writer.chapter.read' && input.chapterId === chapterThree.id) return await readThreePending
      throw new Error(`Unexpected route: ${route}`)
    })

    const { WriterPage } = await import('../WriterPage')
    render(<WriterPage />)
    fireEvent.click(screen.getByRole('button', { name: 'writer.welcome.open_existing' }))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('writer.editor.placeholder'), { target: { value: 'Dirty first chapter' } })
    fireEvent.click(screen.getByText('Chapter Two').closest('button')!)
    fireEvent.click(screen.getByText('Chapter Three').closest('button')!)

    await act(async () => resolveSave({ ...SAVED_CHAPTER, content: 'Dirty first chapter' }))
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith('writer.chapter.read', {
        rootPath: PROJECT.rootPath,
        chapterId: chapterThree.id
      })
    })
    await act(async () => resolveThree(documentThree))
    await waitFor(() => expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue(documentThree.content))
    await act(async () => resolveTwo(documentTwo))
    expect(screen.getByLabelText('writer.editor.placeholder')).toHaveValue(documentThree.content)
  })
})
