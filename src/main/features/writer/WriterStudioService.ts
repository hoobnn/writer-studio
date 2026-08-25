import { application } from '@application'
import { modelService } from '@data/services/ModelService'
import { providerService } from '@data/services/ProviderService'
import { KeyedMutex } from '@main/core/concurrency/KeyedMutex'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import type {
  WriterChapterDocument,
  WriterContinuityCoverageUpdateInput,
  WriterContinuityReviewReadInput,
  WriterContinuityReviewRunInput,
  WriterContinuityReviewView,
  WriterContinuitySaveInput,
  WriterContinuityUnwaiveInput,
  WriterContinuityWaiveInput,
  WriterGenerationCancelResult,
  WriterGenerationStartInput,
  WriterGenerationStartResult,
  WriterHistoryListInput,
  WriterHistoryListResult,
  WriterHistoryReadInput,
  WriterHistoryRestoreInput,
  WriterHistorySnapshot,
  WriterOutlineSaveInput,
  WriterProject,
  WriterProjectCreateInput,
  WriterProposal,
  WriterProposalApplyInput,
  WriterProposalListInput,
  WriterProposalListResult,
  WriterProposalReadInput,
  WriterStoryBibleSaveInput
} from '@shared/types/writer'

import { buildWriterContinuityReviewView, compileWriterContinuityAudit } from './writerContinuityReview'
import { WriterStudioError } from './writerErrors'
import { createWriterGenerationJobHandler } from './writerGenerationJobHandler'
import { computeWriterContextBudgetChars, resolveWriterGenerationModel } from './writerModelPolicy'
import { WriterProjectRepository } from './WriterProjectRepository'

@Injectable('WriterStudioService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['AiService', 'JobManager'])
export class WriterStudioService extends BaseService {
  private readonly repository = new WriterProjectRepository()
  private readonly projectLock = new KeyedMutex()

  protected onInit(): void {
    application
      .get('JobManager')
      .registerHandler('writer.generate-proposal', createWriterGenerationJobHandler(this.repository, this.projectLock))
  }

  async createProject(input: WriterProjectCreateInput): Promise<WriterProject> {
    return await this.repository.createProject(input)
  }

  async openProject(rootPath: string): Promise<WriterProject> {
    return await this.repository.openProject(rootPath)
  }

  async createChapter(rootPath: string, title?: string): Promise<WriterChapterDocument> {
    const canonicalRoot = await this.repository.resolveProjectRoot(rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () => this.repository.createChapter(canonicalRoot, title))
  }

  async readChapter(rootPath: string, chapterId: string): Promise<WriterChapterDocument> {
    return await this.repository.readChapter(rootPath, chapterId)
  }

  async saveChapter(
    rootPath: string,
    chapterId: string,
    content: string,
    expectedRevision: string
  ): Promise<WriterChapterDocument> {
    const canonicalRoot = await this.repository.resolveProjectRoot(rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () =>
      this.repository.saveChapter(canonicalRoot, chapterId, content, expectedRevision)
    )
  }

  async saveStoryBible(input: WriterStoryBibleSaveInput): Promise<WriterProject> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () =>
      this.repository.saveStoryBible(canonicalRoot, input.storyBible, input.expectedRevision)
    )
  }

  async saveOutline(input: WriterOutlineSaveInput): Promise<WriterProject> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () =>
      this.repository.saveOutline(canonicalRoot, input.outline, input.expectedRevision)
    )
  }

  async saveContinuity(input: WriterContinuitySaveInput): Promise<WriterProject> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () =>
      this.repository.saveContinuity(canonicalRoot, input.continuity, input.expectedRevision)
    )
  }

  async readContinuityReview(input: WriterContinuityReviewReadInput): Promise<WriterContinuityReviewView> {
    const project = await this.hydrateContinuityReviewProject(
      await this.repository.openProject(input.rootPath),
      input.targetChapterId
    )
    const review = await this.repository.readContinuityReview(project.rootPath)
    return buildWriterContinuityReviewView({
      project,
      targetChapterId: input.targetChapterId,
      document: review.document,
      revision: review.revision
    })
  }

  async runContinuityReview(input: WriterContinuityReviewRunInput): Promise<WriterContinuityReviewView> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, async () => {
      const project = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      const current = await this.repository.readContinuityReview(canonicalRoot)
      this.assertContinuityReviewRevision(input.expectedRevision, current.revision)
      const now = new Date()
      const document = {
        schemaVersion: 1 as const,
        updatedAt: now.toISOString(),
        report: compileWriterContinuityAudit({
          project,
          targetChapterId: input.targetChapterId,
          now
        }),
        coverageDeclarations: current.document?.coverageDeclarations ?? [],
        waivers: current.document?.waivers ?? []
      }
      const saved = await this.repository.writeContinuityReview(canonicalRoot, document, current.revision)
      const refreshedProject = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      return buildWriterContinuityReviewView({
        project: refreshedProject,
        targetChapterId: input.targetChapterId,
        document: saved.document,
        revision: saved.revision
      })
    })
  }

  async waiveContinuityFinding(input: WriterContinuityWaiveInput): Promise<WriterContinuityReviewView> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, async () => {
      const project = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      const current = await this.repository.readContinuityReview(canonicalRoot)
      this.assertContinuityReviewRevision(input.expectedRevision, current.revision)
      const view = buildWriterContinuityReviewView({
        project,
        targetChapterId: input.targetChapterId,
        document: current.document,
        revision: current.revision
      })
      if (view.stale || !current.document?.report) {
        throw new WriterStudioError(writerErrorCodes.REVISION_CONFLICT, 'Writer continuity review is stale')
      }
      const currentFinding = view.findings.find(
        (item) => item.key === input.findingKey && item.fingerprint === input.findingFingerprint
      )
      if (!currentFinding) {
        throw new WriterStudioError(
          writerErrorCodes.CONTINUITY_FINDING_NOT_FOUND,
          'Writer continuity finding is missing or changed'
        )
      }
      if (!currentFinding.exemptible) {
        throw new WriterStudioError(
          writerErrorCodes.CONTINUITY_FINDING_NOT_EXEMPTIBLE,
          'Writer continuity finding cannot be marked intentional'
        )
      }
      const now = new Date().toISOString()
      const previous = current.document.waivers.find((waiver) => waiver.findingKey === input.findingKey)
      const waiver = {
        findingKey: input.findingKey,
        findingFingerprint: input.findingFingerprint,
        reason: input.reason,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      }
      const document = {
        ...current.document,
        updatedAt: now,
        waivers: [...current.document.waivers.filter((item) => item.findingKey !== input.findingKey), waiver]
      }
      const saved = await this.repository.writeContinuityReview(canonicalRoot, document, current.revision)
      const refreshedProject = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      return buildWriterContinuityReviewView({
        project: refreshedProject,
        targetChapterId: input.targetChapterId,
        document: saved.document,
        revision: saved.revision
      })
    })
  }

  async unwaiveContinuityFinding(input: WriterContinuityUnwaiveInput): Promise<WriterContinuityReviewView> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, async () => {
      const project = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      const current = await this.repository.readContinuityReview(canonicalRoot)
      this.assertContinuityReviewRevision(input.expectedRevision, current.revision)
      if (!current.document) {
        return buildWriterContinuityReviewView({ project, targetChapterId: input.targetChapterId })
      }
      const nextWaivers = current.document.waivers.filter((item) => item.findingKey !== input.findingKey)
      if (nextWaivers.length === current.document.waivers.length) {
        return buildWriterContinuityReviewView({
          project,
          targetChapterId: input.targetChapterId,
          document: current.document,
          revision: current.revision
        })
      }
      const document = { ...current.document, updatedAt: new Date().toISOString(), waivers: nextWaivers }
      const saved = await this.repository.writeContinuityReview(canonicalRoot, document, current.revision)
      const refreshedProject = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      return buildWriterContinuityReviewView({
        project: refreshedProject,
        targetChapterId: input.targetChapterId,
        document: saved.document,
        revision: saved.revision
      })
    })
  }

  async updateContinuityCoverage(input: WriterContinuityCoverageUpdateInput): Promise<WriterContinuityReviewView> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, async () => {
      const project = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      const current = await this.repository.readContinuityReview(canonicalRoot)
      this.assertContinuityReviewRevision(input.expectedRevision, current.revision)
      if (!current.document) {
        throw new WriterStudioError(writerErrorCodes.REVISION_CONFLICT, 'Writer continuity review has not run')
      }
      const view = buildWriterContinuityReviewView({
        project,
        targetChapterId: input.targetChapterId,
        document: current.document,
        revision: current.revision
      })
      if (input.covered && (view.stale || !current.document.report)) {
        throw new WriterStudioError(writerErrorCodes.REVISION_CONFLICT, 'Writer continuity review is stale')
      }
      const nextDeclarations = current.document.coverageDeclarations.filter((item) => item.rule !== input.rule)
      if (input.covered) {
        const stat = current.document.report?.ruleStats.find((item) => item.rule === input.rule)
        if (!stat) {
          throw new WriterStudioError(writerErrorCodes.REVISION_CONFLICT, 'Writer continuity rule data is unavailable')
        }
        if (stat.staleItems > 0) {
          throw new WriterStudioError(
            writerErrorCodes.REVISION_CONFLICT,
            'Writer continuity rule data must be refreshed before coverage can be confirmed'
          )
        }
        nextDeclarations.push({
          rule: input.rule,
          throughChapterId: view.targetChapterId,
          basisFingerprint: stat.basisFingerprint,
          updatedAt: new Date().toISOString(),
          note: input.note ?? ''
        })
      }
      const document = {
        ...current.document,
        updatedAt: new Date().toISOString(),
        coverageDeclarations: nextDeclarations
      }
      const saved = await this.repository.writeContinuityReview(canonicalRoot, document, current.revision)
      const refreshedProject = await this.hydrateContinuityReviewProject(
        await this.repository.openProject(canonicalRoot),
        input.targetChapterId
      )
      return buildWriterContinuityReviewView({
        project: refreshedProject,
        targetChapterId: input.targetChapterId,
        document: saved.document,
        revision: saved.revision
      })
    })
  }

  async startGeneration(input: WriterGenerationStartInput): Promise<WriterGenerationStartResult> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, async () => {
      const project = await this.repository.openProject(canonicalRoot)
      const chapterId = input.chapterId ?? project.manifest.activeChapterId
      const chapter = await this.repository.readChapterFromProject(project, chapterId)
      const model = this.resolveModel(input.uniqueModelId)
      const contextBudgetChars = computeWriterContextBudgetChars({
        contextWindow: model.contextWindow,
        instructionChars: input.instruction?.length ?? 0
      })
      if (contextBudgetChars <= 0) {
        throw new WriterStudioError(
          writerErrorCodes.CONTEXT_BUDGET_EXHAUSTED,
          'Writer instruction leaves no safe context room for the selected model'
        )
      }
      const handle = application.get('JobManager').enqueue('writer.generate-proposal', {
        rootPath: project.rootPath,
        chapterId,
        baseRevision: chapter.chapter.revision,
        documentRevisions: project.documentRevisions,
        uniqueModelId: model.uniqueModelId,
        contextBudgetChars,
        operation: input.operation,
        instruction: input.instruction
      })
      return handle.snapshot
    })
  }

  async cancelGeneration(jobId: string): Promise<WriterGenerationCancelResult> {
    const jobManager = application.get('JobManager')
    const snapshot = await jobManager.get(jobId)
    if (!snapshot || snapshot.type !== 'writer.generate-proposal') return { cancelled: false }
    const result = await jobManager.cancel(jobId, 'Cancelled by writer')
    return { cancelled: result.outcome === 'cancelled' }
  }

  async applyProposal(input: WriterProposalApplyInput): Promise<WriterChapterDocument> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () =>
      this.repository.applyProposal({ ...input, rootPath: canonicalRoot })
    )
  }

  async listProposals(input: WriterProposalListInput): Promise<WriterProposalListResult> {
    return {
      proposals: await this.repository.listProposals(input.rootPath, input.chapterId, input.limit)
    }
  }

  async readProposal(input: WriterProposalReadInput): Promise<WriterProposal> {
    return await this.repository.readProposal(input.rootPath, input.proposalId)
  }

  async listHistory(input: WriterHistoryListInput): Promise<WriterHistoryListResult> {
    return { history: await this.repository.listHistory(input.rootPath, input.chapterId, input.limit) }
  }

  async readHistory(input: WriterHistoryReadInput): Promise<WriterHistorySnapshot> {
    return await this.repository.readHistorySnapshot(input.rootPath, input.chapterId, input.fileName)
  }

  async restoreHistory(input: WriterHistoryRestoreInput): Promise<WriterChapterDocument> {
    const canonicalRoot = await this.repository.resolveProjectRoot(input.rootPath)
    return await this.projectLock.runExclusive(canonicalRoot, () =>
      this.repository.restoreHistorySnapshot(canonicalRoot, input.chapterId, input.fileName, input.expectedRevision)
    )
  }

  private async hydrateContinuityReviewProject(
    project: WriterProject,
    requestedTargetChapterId?: string
  ): Promise<WriterProject> {
    const targetChapterId = requestedTargetChapterId ?? project.manifest.activeChapterId
    const target = project.manifest.chapters.find((chapter) => chapter.id === targetChapterId)
    if (!target) {
      throw new WriterStudioError(writerErrorCodes.CHAPTER_NOT_FOUND, 'Writer audit target chapter not found')
    }
    const orderByChapterId = new Map(project.manifest.chapters.map((chapter) => [chapter.id, chapter.order]))
    const chapterIds = new Set<string>([targetChapterId])
    for (const summary of project.continuity.chapterSummaries) {
      if (
        (summary.requirementAssessments?.length ?? 0) > 0 &&
        (orderByChapterId.get(summary.chapterId) ?? Number.MAX_SAFE_INTEGER) <= target.order
      ) {
        chapterIds.add(summary.chapterId)
      }
    }
    const actualRevisions = new Map<string, string>()
    const ids = [...chapterIds]
    for (let offset = 0; offset < ids.length; offset += 16) {
      const documents = await Promise.all(
        ids
          .slice(offset, offset + 16)
          .filter((chapterId) => orderByChapterId.has(chapterId))
          .map((chapterId) => this.repository.readChapterFromProject(project, chapterId))
      )
      for (const document of documents) actualRevisions.set(document.chapter.id, document.chapter.revision)
    }
    return {
      ...project,
      manifest: {
        ...project.manifest,
        chapters: project.manifest.chapters.map((chapter) => ({
          ...chapter,
          revision: actualRevisions.get(chapter.id) ?? chapter.revision
        }))
      }
    }
  }

  private resolveModel(explicit?: string) {
    const configuredDefault = explicit
      ? undefined
      : (application.get('PreferenceService').get('feature.quick_assistant.model_id') ??
        application.get('PreferenceService').get('chat.default_model_id'))
    return resolveWriterGenerationModel(
      { explicit, configuredDefault },
      {
        getProvider: (providerId) => providerService.getByProviderId(providerId),
        getModel: (providerId, modelId) => modelService.getByKey(providerId, modelId)
      }
    )
  }

  private assertContinuityReviewRevision(expected: string, actual: string): void {
    if (expected !== actual) {
      throw new WriterStudioError(writerErrorCodes.REVISION_CONFLICT, 'Writer continuity review revision conflict', {
        expectedRevision: expected,
        actualRevision: actual
      })
    }
  }
}
