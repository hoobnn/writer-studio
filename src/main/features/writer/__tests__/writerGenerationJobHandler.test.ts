import { randomUUID } from 'node:crypto'

import type { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import type { JobContext } from '@main/core/job/types'
import { UniqueModelIdSchema } from '@shared/data/types/model'
import { WriterGenerationOutputSchema, WriterProjectSchema, WriterProposalSchema } from '@shared/types/writer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WriterStudioError } from '../writerErrors'
import { createWriterGenerationJobHandler, type WriterGenerationJobPayload } from '../writerGenerationJobHandler'
import type { WriterProjectRepository } from '../WriterProjectRepository'
import { writerRevision } from '../WriterProjectRepository'

const { appGetMock, generateTextMock } = vi.hoisted(() => ({
  appGetMock: vi.fn(),
  generateTextMock: vi.fn()
}))

vi.mock('@application', () => ({ application: { get: appGetMock } }))

function fixture() {
  const projectId = randomUUID()
  const chapterId = randomUUID()
  const now = '2026-08-24T00:00:00.000Z'
  const content = '已有正文'
  const project = WriterProjectSchema.parse({
    rootPath: '/tmp/writer-generation-fixture',
    manifest: {
      schemaVersion: 1,
      id: projectId,
      title: '生成测试',
      createdAt: now,
      updatedAt: now,
      activeChapterId: chapterId,
      chapters: [
        {
          id: chapterId,
          title: '第一章',
          fileName: `0001-${chapterId}.md`,
          order: 0,
          createdAt: now,
          updatedAt: now,
          revision: writerRevision(content)
        }
      ]
    },
    storyBible: {
      schemaVersion: 1,
      genre: '',
      premise: '',
      authorGoal: '保持因果严谨',
      hardRules: ['主角不能读心'],
      themes: [],
      characters: [],
      worldRules: [],
      styleGuide: []
    },
    outline: { schemaVersion: 1, bookSummary: '', arcs: [], chapterPlans: [] },
    continuity: { schemaVersion: 1, facts: [], foreshadowing: [], chapterSummaries: [] },
    documentRevisions: {
      storyBible: '0'.repeat(64),
      outline: '0'.repeat(64),
      continuity: '0'.repeat(64)
    }
  })
  return { project, chapter: { chapter: project.manifest.chapters[0], content } }
}

describe('createWriterGenerationJobHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appGetMock.mockImplementation((name: string) => {
      if (name === 'AiService') return { generateText: generateTextMock }
      throw new Error(`Unexpected application.get(${name})`)
    })
    generateTextMock.mockResolvedValue({ text: '模型提案' })
  })

  it('revalidates the base revision, passes AbortSignal, and persists only a parseable proposal', async () => {
    const { project, chapter } = fixture()
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(project),
      readChapterFromProject: vi.fn().mockResolvedValue(chapter),
      readProposal: vi
        .fn()
        .mockRejectedValue(new WriterStudioError('WRITER_PROPOSAL_NOT_FOUND', 'Writer proposal not found')),
      writeProposal: vi.fn().mockResolvedValue(undefined)
    }
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => await task())
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const progress = vi.fn()
    const controller = new AbortController()
    const input: WriterGenerationJobPayload = {
      rootPath: project.rootPath,
      chapterId: chapter.chapter.id,
      baseRevision: chapter.chapter.revision,
      documentRevisions: project.documentRevisions,
      uniqueModelId: UniqueModelIdSchema.parse('openai::gpt-4o'),
      contextBudgetChars: 8_000,
      operation: 'continue',
      instruction: '保持悬念'
    }
    const ctx = {
      jobId: 'job-1',
      input,
      attempt: 1,
      parentId: null,
      signal: controller.signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: progress,
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    const output = WriterGenerationOutputSchema.parse(await handler.execute(ctx))

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: input.uniqueModelId,
        contextOwner: 'caller',
        requestOptions: { signal: controller.signal, maxRetries: 0 }
      })
    )
    expect(output).toEqual({ proposalId: ctx.jobId })
    expect(JSON.stringify(output)).not.toContain('模型提案')
    expect(JSON.stringify(output)).not.toContain('contextPacket')
    const persistedProposal = repositoryMock.writeProposal.mock.calls[0][1]
    expect(persistedProposal).toMatchObject({
      id: ctx.jobId,
      baseRevision: input.baseRevision,
      operation: 'continue',
      mode: 'append',
      content: '模型提案',
      status: 'pending'
    })
    expect(persistedProposal.contextPacket.sources.some((source) => source.kind === 'related_history')).toBe(false)
    expect(repositoryMock.writeProposal).toHaveBeenCalledWith(project.rootPath, persistedProposal)
    expect(progress).toHaveBeenLastCalledWith(100, {
      stage: 'completed',
      proposalId: ctx.jobId
    })
  })

  it('fails before calling the model when the chapter changed after enqueue', async () => {
    const { project, chapter } = fixture()
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(project),
      readProposal: vi
        .fn()
        .mockRejectedValue(new WriterStudioError('WRITER_PROPOSAL_NOT_FOUND', 'Writer proposal not found')),
      readChapterFromProject: vi.fn().mockResolvedValue({
        ...chapter,
        chapter: { ...chapter.chapter, revision: writerRevision('外部改动') }
      }),
      writeProposal: vi.fn()
    }
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => await task())
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const input: WriterGenerationJobPayload = {
      rootPath: project.rootPath,
      chapterId: chapter.chapter.id,
      baseRevision: chapter.chapter.revision,
      documentRevisions: project.documentRevisions,
      uniqueModelId: UniqueModelIdSchema.parse('openai::gpt-4o'),
      contextBudgetChars: 8_000,
      operation: 'draft'
    }
    const ctx = {
      jobId: 'job-2',
      input,
      attempt: 1,
      parentId: null,
      signal: new AbortController().signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: vi.fn(),
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    await expect(handler.execute(ctx)).rejects.toMatchObject({ code: 'WRITER_REVISION_CONFLICT' })
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(repositoryMock.writeProposal).not.toHaveBeenCalled()
  })

  it('fails before calling the model when a structured context document changed after enqueue', async () => {
    const { project, chapter } = fixture()
    const changedProject = {
      ...project,
      documentRevisions: { ...project.documentRevisions, storyBible: 'f'.repeat(64) }
    }
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(changedProject),
      readProposal: vi
        .fn()
        .mockRejectedValue(new WriterStudioError('WRITER_PROPOSAL_NOT_FOUND', 'Writer proposal not found')),
      readChapterFromProject: vi.fn(),
      writeProposal: vi.fn()
    }
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => await task())
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const ctx = {
      jobId: 'job-structured-revision',
      input: {
        rootPath: project.rootPath,
        chapterId: chapter.chapter.id,
        baseRevision: chapter.chapter.revision,
        documentRevisions: project.documentRevisions,
        uniqueModelId: UniqueModelIdSchema.parse('openai::gpt-4o'),
        contextBudgetChars: 8_000,
        operation: 'draft'
      },
      attempt: 1,
      parentId: null,
      signal: new AbortController().signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: vi.fn(),
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    await expect(handler.execute(ctx)).rejects.toMatchObject({ code: 'WRITER_REVISION_CONFLICT' })
    expect(repositoryMock.readChapterFromProject).not.toHaveBeenCalled()
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('fails a legacy persisted job without document revisions as a domain conflict instead of throwing a TypeError', async () => {
    const { project, chapter } = fixture()
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(project),
      readProposal: vi
        .fn()
        .mockRejectedValue(new WriterStudioError('WRITER_PROPOSAL_NOT_FOUND', 'Writer proposal not found')),
      readChapterFromProject: vi.fn(),
      writeProposal: vi.fn()
    }
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => await task())
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const ctx = {
      jobId: 'legacy-job-without-document-revisions',
      input: {
        rootPath: project.rootPath,
        chapterId: chapter.chapter.id,
        baseRevision: chapter.chapter.revision,
        uniqueModelId: UniqueModelIdSchema.parse('openai::gpt-4o'),
        contextBudgetChars: 8_000,
        operation: 'draft'
      },
      attempt: 1,
      parentId: null,
      signal: new AbortController().signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: vi.fn(),
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    await expect(handler.execute(ctx)).rejects.toMatchObject({ code: 'WRITER_REVISION_CONFLICT' })
    expect(repositoryMock.readChapterFromProject).not.toHaveBeenCalled()
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('returns the proposal already persisted for the same job without another model call', async () => {
    const { project, chapter } = fixture()
    const existing = WriterProposalSchema.parse({
      id: 'job-recovered',
      projectId: project.manifest.id,
      chapterId: chapter.chapter.id,
      baseRevision: chapter.chapter.revision,
      operation: 'continue',
      instruction: '保持悬念',
      uniqueModelId: 'openai::gpt-4o',
      mode: 'append',
      content: '已经落盘的提案',
      createdAt: '2026-08-24T00:00:00.000Z',
      status: 'pending',
      contextPacket: {
        projectId: project.manifest.id,
        chapterId: chapter.chapter.id,
        operation: 'continue',
        generatedAt: '2026-08-24T00:00:00.000Z',
        budgetChars: 100,
        usedChars: 0,
        truncated: false,
        sources: [],
        documentRevisions: project.documentRevisions
      }
    })
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(project),
      readProposal: vi.fn().mockResolvedValue(existing),
      readChapterFromProject: vi.fn(),
      writeProposal: vi.fn()
    }
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => await task())
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const ctx = {
      jobId: existing.id,
      input: {
        rootPath: project.rootPath,
        chapterId: existing.chapterId,
        baseRevision: existing.baseRevision,
        documentRevisions: project.documentRevisions,
        uniqueModelId: existing.uniqueModelId,
        contextBudgetChars: existing.contextPacket.budgetChars,
        operation: existing.operation,
        instruction: existing.instruction
      },
      attempt: 1,
      parentId: null,
      signal: new AbortController().signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: vi.fn(),
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    await expect(handler.execute(ctx)).resolves.toEqual({ proposalId: existing.id })
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(repositoryMock.readChapterFromProject).not.toHaveBeenCalled()
    expect(repositoryMock.writeProposal).not.toHaveBeenCalled()
  })

  it('rejects a same-id proposal whose identity does not match the recovery payload', async () => {
    const { project, chapter } = fixture()
    const existing = WriterProposalSchema.parse({
      id: 'job-mismatch',
      projectId: project.manifest.id,
      chapterId: chapter.chapter.id,
      baseRevision: writerRevision('different base'),
      operation: 'draft',
      uniqueModelId: 'openai::gpt-4o',
      mode: 'replace',
      content: '不属于当前 job 的提案',
      createdAt: '2026-08-24T00:00:00.000Z',
      status: 'pending',
      contextPacket: {
        projectId: project.manifest.id,
        chapterId: chapter.chapter.id,
        operation: 'draft',
        generatedAt: '2026-08-24T00:00:00.000Z',
        budgetChars: 100,
        usedChars: 0,
        truncated: false,
        sources: [],
        documentRevisions: project.documentRevisions
      }
    })
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(project),
      readProposal: vi.fn().mockResolvedValue(existing),
      readChapterFromProject: vi.fn(),
      writeProposal: vi.fn()
    }
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => await task())
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const ctx = {
      jobId: existing.id,
      input: {
        rootPath: project.rootPath,
        chapterId: chapter.chapter.id,
        baseRevision: chapter.chapter.revision,
        documentRevisions: project.documentRevisions,
        uniqueModelId: existing.uniqueModelId,
        contextBudgetChars: existing.contextPacket.budgetChars,
        operation: 'draft'
      },
      attempt: 1,
      parentId: null,
      signal: new AbortController().signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: vi.fn(),
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    await expect(handler.execute(ctx)).rejects.toMatchObject({ code: 'WRITER_INVALID_PROPOSAL' })
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(repositoryMock.writeProposal).not.toHaveBeenCalled()
  })

  it('rechecks cancellation after acquiring the persistence lock and does not write a proposal', async () => {
    const { project, chapter } = fixture()
    const repositoryMock = {
      openProject: vi.fn().mockResolvedValue(project),
      readProposal: vi
        .fn()
        .mockRejectedValue(new WriterStudioError('WRITER_PROPOSAL_NOT_FOUND', 'Writer proposal not found')),
      readChapterFromProject: vi.fn().mockResolvedValue(chapter),
      writeProposal: vi.fn()
    }
    const controller = new AbortController()
    let lockAcquisitions = 0
    const projectLock = {
      runExclusive: vi.fn(async (_key: string, task: () => Promise<unknown>) => {
        lockAcquisitions += 1
        if (lockAcquisitions === 3) controller.abort(new Error('cancelled while waiting for persist lock'))
        return await task()
      })
    } as unknown as KeyedMutex
    const handler = createWriterGenerationJobHandler(repositoryMock as unknown as WriterProjectRepository, projectLock)
    const ctx = {
      jobId: 'job-cancel-race',
      input: {
        rootPath: project.rootPath,
        chapterId: chapter.chapter.id,
        baseRevision: chapter.chapter.revision,
        documentRevisions: project.documentRevisions,
        uniqueModelId: UniqueModelIdSchema.parse('openai::gpt-4o'),
        contextBudgetChars: 8_000,
        operation: 'continue'
      },
      attempt: 1,
      parentId: null,
      signal: controller.signal,
      metadata: {},
      patchMetadata: vi.fn(),
      reportProgress: vi.fn(),
      logger: {}
    } as unknown as JobContext<WriterGenerationJobPayload>

    await expect(handler.execute(ctx)).rejects.toThrow('cancelled while waiting for persist lock')
    expect(repositoryMock.writeProposal).not.toHaveBeenCalled()
  })
})
