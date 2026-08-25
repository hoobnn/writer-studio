import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { application } from '@application'
import { modelService } from '@data/services/ModelService'
import { providerService } from '@data/services/ProviderService'
import { BaseService } from '@main/core/lifecycle/BaseService'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WriterProjectRepository } from '../WriterProjectRepository'
import { WriterStudioService } from '../WriterStudioService'

vi.mock('@application', async () => {
  const mod = await import('@test-mocks/main/application')
  return mod.mockApplicationFactory()
})

describe('WriterStudioService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BaseService.resetInstances()
  })

  it('reports cancellation only after JobManager reaches the cancelled outcome', async () => {
    const cancel = vi
      .fn()
      .mockResolvedValueOnce({ outcome: 'timed-out' })
      .mockResolvedValueOnce({ outcome: 'cancelled' })
    ;(application.get as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'JobManager') {
        return {
          get: vi.fn().mockResolvedValue({ type: 'writer.generate-proposal' }),
          cancel
        }
      }
      throw new Error(`Unexpected application.get(${name})`)
    })
    const service = new WriterStudioService()

    await expect(service.cancelGeneration('writer-job')).resolves.toEqual({ cancelled: false })
    await expect(service.cancelGeneration('writer-job')).resolves.toEqual({ cancelled: true })
  })

  it('rejects an exhausted small-model context budget before enqueueing a job', async () => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'writer-service-model-'))
    const enqueue = vi.fn()
    vi.spyOn(providerService, 'getByProviderId').mockReturnValue({
      isEnabled: true,
      authMethods: ['api-key']
    } as never)
    vi.spyOn(modelService, 'getByKey').mockReturnValue({
      id: 'provider::small',
      providerId: 'provider',
      name: 'Small chat model',
      capabilities: [],
      isEnabled: true,
      contextWindow: 8_000
    } as never)
    ;(application.get as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'JobManager') return { enqueue }
      throw new Error(`Unexpected application.get(${name})`)
    })
    const service = new WriterStudioService()

    try {
      const project = await service.createProject({ parentDirectory, title: '小窗口测试' })
      await expect(
        service.startGeneration({
          rootPath: project.rootPath,
          operation: 'draft',
          instruction: '要求'.repeat(4_000),
          uniqueModelId: 'provider::small'
        })
      ).rejects.toMatchObject({ code: 'WRITER_CONTEXT_BUDGET_EXHAUSTED' })
      expect(enqueue).not.toHaveBeenCalled()
    } finally {
      await rm(parentDirectory, { recursive: true, force: true })
    }
  })

  it('serializes structured document saves so concurrent stale writers cannot both win', async () => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'writer-service-structured-'))
    const service = new WriterStudioService()

    try {
      const project = await service.createProject({ parentDirectory, title: '结构化保存测试' })
      const expectedRevision = project.documentRevisions.storyBible
      const results = await Promise.allSettled([
        service.saveStoryBible({
          rootPath: project.rootPath,
          storyBible: { ...project.storyBible, authorGoal: '版本甲' },
          expectedRevision
        }),
        service.saveStoryBible({
          rootPath: project.rootPath,
          storyBible: { ...project.storyBible, authorGoal: '版本乙' },
          expectedRevision
        })
      ])

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((result) => result.status === 'rejected')
      expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'WRITER_REVISION_CONFLICT' } })
    } finally {
      await rm(parentDirectory, { recursive: true, force: true })
    }
  })

  it('runs continuity review and persists, invalidates, and removes an intentional waiver', async () => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'writer-service-continuity-review-'))
    const service = new WriterStudioService()

    try {
      let project = await service.createProject({ parentDirectory, title: '连续性审查测试' })
      const chapterId = project.manifest.activeChapterId
      project = await service.saveOutline({
        rootPath: project.rootPath,
        expectedRevision: project.documentRevisions.outline,
        outline: {
          ...project.outline,
          chapterPlans: project.outline.chapterPlans.map((plan) => ({
            ...plan,
            requirements: [{ id: 'required-door', description: '主角必须打开封门。' }]
          }))
        }
      })
      project = await service.saveContinuity({
        rootPath: project.rootPath,
        expectedRevision: project.documentRevisions.continuity,
        continuity: {
          ...project.continuity,
          chapterSummaries: [
            {
              chapterId,
              summary: '主角在门前退缩。',
              assessmentRevision: project.manifest.chapters[0].revision,
              requirementAssessments: [
                {
                  requirementId: 'required-door',
                  status: 'deviated',
                  evidence: '本章没有开门。'
                }
              ],
              updatedAt: '2026-08-25T00:00:00.000Z'
            }
          ]
        }
      })
      const initial = await service.readContinuityReview({ rootPath: project.rootPath, targetChapterId: chapterId })
      expect(initial.status).toBe('not_run')

      const reviewed = await service.runContinuityReview({
        rootPath: project.rootPath,
        targetChapterId: chapterId,
        expectedRevision: initial.revision
      })
      const finding = reviewed.findings.find((item) => item.rule === 'chapter_plan_deviation')!
      expect(finding.state).toBe('open')
      const covered = await service.updateContinuityCoverage({
        rootPath: project.rootPath,
        targetChapterId: chapterId,
        rule: 'chapter_plan',
        covered: true,
        note: '已核对本章计划要求。',
        expectedRevision: reviewed.revision
      })
      expect(covered.coverage.find((item) => item.rule === 'chapter_plan')?.status).toBe('checked')

      const waived = await service.waiveContinuityFinding({
        rootPath: project.rootPath,
        targetChapterId: chapterId,
        findingKey: finding.key,
        findingFingerprint: finding.fingerprint,
        reason: '主角退缩是有意安排的转折。',
        expectedRevision: covered.revision
      })
      expect(waived.findings.find((item) => item.key === finding.key)?.state).toBe('exempted')
      await expect(
        service.waiveContinuityFinding({
          rootPath: project.rootPath,
          targetChapterId: chapterId,
          findingKey: finding.key,
          findingFingerprint: finding.fingerprint,
          reason: '旧请求不能覆盖。',
          expectedRevision: covered.revision
        })
      ).rejects.toMatchObject({ code: 'WRITER_REVISION_CONFLICT' })

      const reopened = await service.readContinuityReview({ rootPath: project.rootPath, targetChapterId: chapterId })
      expect(reopened.findings.find((item) => item.key === finding.key)?.waiver?.reason).toBe(
        '主角退缩是有意安排的转折。'
      )
      const rerun = await service.runContinuityReview({
        rootPath: project.rootPath,
        targetChapterId: chapterId,
        expectedRevision: reopened.revision
      })
      expect(rerun.findings.find((item) => item.key === finding.key)?.state).toBe('exempted')
      const unwaived = await service.unwaiveContinuityFinding({
        rootPath: project.rootPath,
        targetChapterId: chapterId,
        findingKey: finding.key,
        expectedRevision: rerun.revision
      })
      expect(unwaived.findings.find((item) => item.key === finding.key)?.state).toBe('open')
    } finally {
      await rm(parentDirectory, { recursive: true, force: true })
    }
  })

  it('refuses to waive a hard reference finding', async () => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'writer-service-hard-finding-'))
    const service = new WriterStudioService()

    try {
      let project = await service.createProject({ parentDirectory, title: '硬错误测试' })
      project = await service.saveContinuity({
        rootPath: project.rootPath,
        expectedRevision: project.documentRevisions.continuity,
        continuity: {
          ...project.continuity,
          facts: [
            {
              id: 'bad-reference',
              subject: '守卫',
              predicate: '身份',
              detail: '引用不存在章节',
              sourceChapterId: 'missing-chapter'
            }
          ]
        }
      })
      const initial = await service.readContinuityReview({ rootPath: project.rootPath })
      const reviewed = await service.runContinuityReview({
        rootPath: project.rootPath,
        expectedRevision: initial.revision
      })
      const finding = reviewed.findings.find((item) => item.rule === 'invalid_reference')!

      await expect(
        service.waiveContinuityFinding({
          rootPath: project.rootPath,
          findingKey: finding.key,
          findingFingerprint: finding.fingerprint,
          reason: '硬错误不能豁免',
          expectedRevision: reviewed.revision
        })
      ).rejects.toMatchObject({ code: 'WRITER_CONTINUITY_FINDING_NOT_EXEMPTIBLE' })
    } finally {
      await rm(parentDirectory, { recursive: true, force: true })
    }
  })

  it('marks a persisted review stale after an external target manuscript edit', async () => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'writer-service-review-stale-'))
    const service = new WriterStudioService()

    try {
      const project = await service.createProject({ parentDirectory, title: '外部正文变更测试' })
      const initial = await service.readContinuityReview({ rootPath: project.rootPath })
      const reviewed = await service.runContinuityReview({
        rootPath: project.rootPath,
        expectedRevision: initial.revision
      })
      expect(reviewed.stale).toBe(false)
      const chapter = project.manifest.chapters[0]
      await writeFile(path.join(project.rootPath, 'manuscript', chapter.fileName), '外部直接修改正文', 'utf8')

      const reopened = await service.readContinuityReview({ rootPath: project.rootPath })

      expect(reopened.stale).toBe(true)
      expect(reopened.status).toBe('stale')
    } finally {
      await rm(parentDirectory, { recursive: true, force: true })
    }
  })

  it('returns a stale review when the manuscript changes after hydration but before the review artifact rename', async () => {
    const parentDirectory = await mkdtemp(path.join(tmpdir(), 'writer-service-review-race-'))
    const service = new WriterStudioService()
    const originalWrite = WriterProjectRepository.prototype.writeContinuityReview
    let writeSpy: { mockRestore: () => void } | undefined

    try {
      const project = await service.createProject({ parentDirectory, title: '审查竞态测试' })
      const initial = await service.readContinuityReview({ rootPath: project.rootPath })
      const chapter = project.manifest.chapters[0]
      writeSpy = vi
        .spyOn(WriterProjectRepository.prototype, 'writeContinuityReview')
        .mockImplementation(async function (this: WriterProjectRepository, rootPath, document, expectedRevision) {
          await writeFile(path.join(project.rootPath, 'manuscript', chapter.fileName), '竞态窗口中的外部修改', 'utf8')
          return await originalWrite.call(this, rootPath, document, expectedRevision)
        })

      const reviewed = await service.runContinuityReview({
        rootPath: project.rootPath,
        expectedRevision: initial.revision
      })

      expect(reviewed.stale).toBe(true)
      expect(reviewed.status).toBe('stale')
    } finally {
      writeSpy?.mockRestore()
      await rm(parentDirectory, { recursive: true, force: true })
    }
  })

  it('resolves the mutex key without opening and scanning the project', async () => {
    const revision = 'a'.repeat(64)
    const savedDocument = {
      chapter: {
        id: 'chapter-1',
        title: '第一章',
        fileName: '0001-chapter-1.md',
        order: 0,
        createdAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
        revision
      },
      content: '正文'
    }
    const resolveRoot = vi
      .spyOn(WriterProjectRepository.prototype, 'resolveProjectRoot')
      .mockResolvedValue('/canonical/project')
    const openProject = vi.spyOn(WriterProjectRepository.prototype, 'openProject')
    const saveChapter = vi.spyOn(WriterProjectRepository.prototype, 'saveChapter').mockResolvedValue(savedDocument)
    const service = new WriterStudioService()

    try {
      await expect(service.saveChapter('/alias/project', 'chapter-1', '正文', revision)).resolves.toEqual(savedDocument)
      expect(resolveRoot).toHaveBeenCalledWith('/alias/project')
      expect(openProject).not.toHaveBeenCalled()
      expect(saveChapter).toHaveBeenCalledWith('/canonical/project', 'chapter-1', '正文', revision)
    } finally {
      resolveRoot.mockRestore()
      openProject.mockRestore()
      saveChapter.mockRestore()
    }
  })
})
