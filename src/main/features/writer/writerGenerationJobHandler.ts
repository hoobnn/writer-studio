import { createHash } from 'node:crypto'

import { application } from '@application'
import type { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import type { JobHandler } from '@main/core/job/types'
import type { UniqueModelId } from '@shared/data/types/model'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import {
  type WriterGenerationOutput,
  WriterGenerationOutputSchema,
  type WriterOperation,
  type WriterProjectDocumentRevisions,
  type WriterProposal
} from '@shared/types/writer'

import { isWriterStudioError, WriterStudioError } from './writerErrors'
import { compileWriterProjectContext } from './writerProjectContext'
import type { WriterProjectRepository } from './WriterProjectRepository'
import { buildWriterGenerationPrompt } from './writerPrompts'
import { writerDocumentRevisionsEqual } from './writerRevisions'

declare module '@main/core/job/jobRegistry' {
  interface JobRegistry {
    'writer.generate-proposal': {
      rootPath: string
      chapterId: string
      baseRevision: string
      documentRevisions: WriterProjectDocumentRevisions
      uniqueModelId: UniqueModelId
      contextBudgetChars: number
      operation: WriterOperation
      instruction?: string
    }
  }
}

export type WriterGenerationJobPayload = {
  rootPath: string
  chapterId: string
  baseRevision: string
  documentRevisions: WriterProjectDocumentRevisions
  uniqueModelId: UniqueModelId
  contextBudgetChars: number
  operation: WriterOperation
  instruction?: string
}

export function writerProjectQueue(rootPath: string): string {
  return `writer.project.${createHash('sha256').update(rootPath).digest('hex').slice(0, 24)}`
}

export function createWriterGenerationJobHandler(
  repository: WriterProjectRepository,
  projectLock: KeyedMutex
): JobHandler<WriterGenerationJobPayload> {
  return {
    recovery: 'retry',
    defaultQueue: (input) => writerProjectQueue(input.rootPath),
    defaultConcurrency: 1,
    defaultRetryPolicy: { maxAttempts: 1, backoff: 'none', baseDelayMs: 0, maxDelayMs: 0 },
    defaultTimeoutMs: 30 * 60_000,

    async execute(ctx): Promise<WriterGenerationOutput> {
      ctx.signal.throwIfAborted()
      const recovered = await projectLock.runExclusive(ctx.input.rootPath, async () => {
        const project = await repository.openProject(ctx.input.rootPath)
        let proposal: WriterProposal
        try {
          proposal = await repository.readProposal(project.rootPath, ctx.jobId)
        } catch (error) {
          if (isWriterStudioError(error) && error.code === writerErrorCodes.PROPOSAL_NOT_FOUND) return undefined
          throw error
        }

        const identityMatches =
          proposal.projectId === project.manifest.id &&
          proposal.chapterId === ctx.input.chapterId &&
          proposal.baseRevision === ctx.input.baseRevision &&
          proposal.uniqueModelId === ctx.input.uniqueModelId &&
          proposal.operation === ctx.input.operation &&
          proposal.instruction === ctx.input.instruction &&
          proposal.contextPacket.projectId === project.manifest.id &&
          proposal.contextPacket.chapterId === ctx.input.chapterId &&
          proposal.contextPacket.operation === ctx.input.operation &&
          proposal.contextPacket.budgetChars === ctx.input.contextBudgetChars &&
          writerDocumentRevisionsEqual(proposal.contextPacket.documentRevisions, ctx.input.documentRevisions)
        if (!identityMatches) {
          throw new WriterStudioError(
            writerErrorCodes.INVALID_PROPOSAL,
            'Persisted writer proposal does not match its recovery job'
          )
        }
        return proposal
      })
      if (recovered) {
        ctx.reportProgress(100, { stage: 'completed', proposalId: recovered.id, recovered: true })
        return WriterGenerationOutputSchema.parse({ proposalId: recovered.id })
      }

      ctx.reportProgress(5, { stage: 'validating-revision' })

      const { project, currentChapter, packet } = await projectLock.runExclusive(ctx.input.rootPath, async () => {
        const project = await repository.openProject(ctx.input.rootPath)
        if (!writerDocumentRevisionsEqual(project.documentRevisions, ctx.input.documentRevisions)) {
          throw new WriterStudioError(
            writerErrorCodes.REVISION_CONFLICT,
            'Writer structured documents changed before generation started',
            {
              expectedRevisions: ctx.input.documentRevisions,
              actualRevisions: project.documentRevisions
            }
          )
        }
        const currentChapter = await repository.readChapterFromProject(project, ctx.input.chapterId)
        if (currentChapter.chapter.revision !== ctx.input.baseRevision) {
          throw new WriterStudioError(
            writerErrorCodes.REVISION_CONFLICT,
            'Writer chapter changed before generation started',
            {
              expectedRevision: ctx.input.baseRevision,
              actualRevision: currentChapter.chapter.revision
            }
          )
        }

        const packet = await compileWriterProjectContext({
          repository,
          project,
          currentChapter,
          instruction: ctx.input.instruction,
          operation: ctx.input.operation,
          budgetChars: ctx.input.contextBudgetChars
        })
        return { project, currentChapter, packet }
      })

      ctx.signal.throwIfAborted()
      ctx.reportProgress(25, {
        stage: 'generating',
        contextSources: packet.sources.length,
        contextChars: packet.usedChars,
        contextTruncated: packet.truncated
      })
      const generationPrompt = buildWriterGenerationPrompt(packet, ctx.input.operation, ctx.input.instruction)
      const result = await application.get('AiService').generateText({
        uniqueModelId: ctx.input.uniqueModelId,
        system: generationPrompt.system,
        prompt: generationPrompt.prompt,
        contextOwner: 'caller',
        requestOptions: { signal: ctx.signal, maxRetries: 0 }
      })

      ctx.signal.throwIfAborted()
      ctx.reportProgress(85, { stage: 'persisting-proposal' })
      const proposal: WriterProposal = {
        id: ctx.jobId,
        projectId: project.manifest.id,
        chapterId: currentChapter.chapter.id,
        baseRevision: ctx.input.baseRevision,
        operation: ctx.input.operation,
        instruction: ctx.input.instruction,
        uniqueModelId: ctx.input.uniqueModelId,
        mode: generationPrompt.suggestedMode,
        content: result.text,
        createdAt: new Date().toISOString(),
        status: 'pending',
        contextPacket: packet
      }
      await projectLock.runExclusive(project.rootPath, async () => {
        ctx.signal.throwIfAborted()
        await repository.writeProposal(project.rootPath, proposal)
      })

      ctx.reportProgress(100, { stage: 'completed', proposalId: proposal.id })
      return WriterGenerationOutputSchema.parse({ proposalId: proposal.id })
    }
  }
}
