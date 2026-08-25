import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writerErrorCodes } from '@shared/ipc/errors/writer'
import {
  WRITER_MAX_CHAPTER_CHARS,
  WRITER_MISSING_CONTINUITY_REVIEW_REVISION,
  type WriterOperation,
  type WriterProject,
  type WriterProposal,
  WriterProposalSchema
} from '@shared/types/writer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WriterProjectRepository, writerRevision } from '../WriterProjectRepository'

describe('WriterProjectRepository', () => {
  let parentDirectory: string
  let nowMs: number
  let repository: WriterProjectRepository

  beforeEach(async () => {
    parentDirectory = await mkdtemp(path.join(tmpdir(), 'cherry-writer-repository-'))
    nowMs = Date.parse('2026-08-24T00:00:00.000Z')
    repository = new WriterProjectRepository({ now: () => new Date(nowMs) })
  })

  afterEach(async () => {
    await rm(parentDirectory, { recursive: true, force: true })
  })

  async function createProject(targetRepository = repository): Promise<WriterProject> {
    return await targetRepository.createProject({
      parentDirectory,
      title: '测试 小说',
      genre: '悬疑',
      premise: '一条可核验的故事前提',
      targetWordCount: 300_000
    })
  }

  function makeProposal(
    project: WriterProject,
    baseRevision: string,
    operation: WriterOperation,
    content: string
  ): WriterProposal {
    return WriterProposalSchema.parse({
      id: randomUUID(),
      projectId: project.manifest.id,
      chapterId: project.manifest.activeChapterId,
      baseRevision,
      operation,
      uniqueModelId: 'openai::gpt-4o',
      mode: operation === 'continue' ? 'append' : 'replace',
      content,
      createdAt: new Date(nowMs).toISOString(),
      status: 'pending',
      contextPacket: {
        projectId: project.manifest.id,
        chapterId: project.manifest.activeChapterId,
        operation,
        generatedAt: new Date(nowMs).toISOString(),
        budgetChars: 100,
        usedChars: 0,
        truncated: false,
        sources: [],
        documentRevisions: project.documentRevisions
      }
    })
  }

  it('creates and reopens the complete file-first project with an initial chapter', async () => {
    const created = await createProject()

    expect(path.basename(created.rootPath)).toBe('测试-小说')
    expect(created.manifest).toMatchObject({
      title: '测试 小说',
      genre: '悬疑',
      premise: '一条可核验的故事前提',
      targetWordCount: 300_000
    })
    expect(created.manifest.chapters).toHaveLength(1)
    expect(created.manifest.activeChapterId).toBe(created.manifest.chapters[0].id)
    expect(created.storyBible).toMatchObject({ genre: '悬疑', premise: '一条可核验的故事前提' })
    expect(created.storyBible.loreEntries).toEqual([])

    const metadataEntries = await readdir(path.join(created.rootPath, '.cherry-writer'))
    expect(metadataEntries).toEqual(
      expect.arrayContaining([
        'project.json',
        'story-bible.json',
        'outline.json',
        'continuity.json',
        'continuity-review.json',
        'proposals',
        'history'
      ])
    )
    expect(await readdir(path.join(created.rootPath, 'manuscript'))).toEqual([created.manifest.chapters[0].fileName])

    const reopened = await repository.openProject(created.rootPath)
    const chapter = await repository.readChapter(reopened.rootPath, reopened.manifest.activeChapterId)
    expect(reopened).toEqual(created)
    expect(chapter.content).toBe('')
    expect(chapter.chapter.revision).toMatch(/^[a-f0-9]{64}$/)
  })

  it('persists continuity review artifacts behind an independent semantic revision', async () => {
    const project = await createProject()
    const initial = await repository.readContinuityReview(project.rootPath)
    expect(initial.document).toMatchObject({ schemaVersion: 1, waivers: [] })
    expect(initial.revision).toMatch(/^[a-f0-9]{64}$/)
    nowMs += 1_000
    const updated = {
      ...initial.document!,
      updatedAt: new Date(nowMs).toISOString()
    }

    const saved = await repository.writeContinuityReview(project.rootPath, updated, initial.revision)

    expect(saved.document).toEqual(updated)
    expect(saved.revision).not.toBe(initial.revision)
    await expect(
      repository.writeContinuityReview(project.rootPath, { ...updated, waivers: [] }, initial.revision)
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
  })

  it('opens old projects without a continuity review artifact and rejects review symlinks', async () => {
    const project = await createProject()
    const reviewPath = path.join(project.rootPath, '.cherry-writer', 'continuity-review.json')
    await unlink(reviewPath)

    await expect(repository.openProject(project.rootPath)).resolves.toMatchObject({ rootPath: project.rootPath })
    await expect(repository.readContinuityReview(project.rootPath)).resolves.toEqual({
      revision: WRITER_MISSING_CONTINUITY_REVIEW_REVISION
    })

    const outside = path.join(parentDirectory, 'outside-review.json')
    await writeFile(
      outside,
      JSON.stringify({ schemaVersion: 1, updatedAt: new Date(nowMs).toISOString(), waivers: [] })
    )
    await symlink(outside, reviewPath)
    await expect(repository.readContinuityReview(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.PATH_OUTSIDE_PROJECT
    })
  })

  it('atomically saves a chapter and rejects a stale optimistic revision without changing content', async () => {
    const project = await createProject()
    const initial = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const saved = await repository.saveChapter(
      project.rootPath,
      initial.chapter.id,
      '# 第一章\n\n新的正文',
      initial.chapter.revision
    )

    expect(saved.chapter.revision).not.toBe(initial.chapter.revision)
    await expect(
      repository.saveChapter(project.rootPath, initial.chapter.id, '会被拒绝', initial.chapter.revision)
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
    await expect(repository.readChapter(project.rootPath, initial.chapter.id)).resolves.toMatchObject({
      content: '# 第一章\n\n新的正文'
    })
    expect((await readdir(path.join(project.rootPath, 'manuscript'))).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('saves one chapter without reading any other manuscript file', async () => {
    const manuscriptReads: string[] = []
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      onManuscriptRead: (filePath) => manuscriptReads.push(path.basename(filePath))
    })
    const project = await createProject()
    await repository.createChapter(project.rootPath, '第二章')
    const target = await repository.createChapter(project.rootPath, '第三章')
    const current = await repository.readChapter(project.rootPath, target.chapter.id)
    manuscriptReads.length = 0

    await repository.saveChapter(project.rootPath, target.chapter.id, '只修改第三章', current.chapter.revision)

    expect(manuscriptReads).toEqual([target.chapter.fileName])
  })

  it('opens a normal project by stat inventory without reading chapters and still rejects a missing chapter', async () => {
    const manuscriptReads: string[] = []
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      onManuscriptRead: (filePath) => manuscriptReads.push(path.basename(filePath))
    })
    const project = await createProject()
    const second = await repository.createChapter(project.rootPath, '第二章')
    manuscriptReads.length = 0

    await repository.openProject(project.rootPath)
    expect(manuscriptReads).toEqual([])

    const missingChapterPath = path.join(project.rootPath, 'manuscript', second.chapter.fileName)
    await unlink(missingChapterPath)
    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.CHAPTER_NOT_FOUND
    })
    expect(manuscriptReads).toEqual([])

    const outsideChapterPath = path.join(parentDirectory, 'outside-chapter.md')
    await writeFile(outsideChapterPath, '项目外正文', 'utf8')
    await symlink(outsideChapterPath, missingChapterPath, 'file')
    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.PATH_OUTSIDE_PROJECT
    })
    expect(manuscriptReads).toEqual([])
  })

  it('saves story-bible by semantic revision and leaves a stale retry unchanged', async () => {
    const project = await createProject()
    const initialRevision = project.documentRevisions.storyBible
    const updatedBible = {
      ...project.storyBible,
      authorGoal: '让每次选择都有可见代价',
      themes: ['选择与代价']
    }

    const saved = await repository.saveStoryBible(project.rootPath, updatedBible, initialRevision)

    expect(saved.storyBible).toEqual(updatedBible)
    expect(saved.documentRevisions.storyBible).toMatch(/^[a-f0-9]{64}$/)
    expect(saved.documentRevisions.storyBible).not.toBe(initialRevision)
    const storyBiblePath = path.join(project.rootPath, '.cherry-writer', 'story-bible.json')
    const persistedBeforeStaleRetry = await readFile(storyBiblePath, 'utf8')
    expect(JSON.parse(persistedBeforeStaleRetry)).not.toHaveProperty('revision')

    await expect(
      repository.saveStoryBible(
        project.rootPath,
        { ...saved.storyBible, authorGoal: '会被 stale revision 拒绝' },
        initialRevision
      )
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
    await expect(readFile(storyBiblePath, 'utf8')).resolves.toBe(persistedBeforeStaleRetry)
  })

  it('keeps semantic revisions stable across JSON formatting and key order changes', async () => {
    const project = await createProject()
    const storyBiblePath = path.join(project.rootPath, '.cherry-writer', 'story-bible.json')
    const storyBible = JSON.parse(await readFile(storyBiblePath, 'utf8'))
    const reversedKeys = Object.fromEntries(Object.entries(storyBible).reverse())
    await writeFile(storyBiblePath, JSON.stringify(reversedKeys), 'utf8')

    const reopened = await repository.openProject(project.rootPath)

    expect(reopened.documentRevisions.storyBible).toBe(project.documentRevisions.storyBible)
  })

  it('rejects an oversized schema-valid Story Bible before replacing the readable file', async () => {
    const project = await createProject()
    const storyBiblePath = path.join(project.rootPath, '.cherry-writer', 'story-bible.json')
    const originalContent = await readFile(storyBiblePath, 'utf8')
    const loreEntries = Array.from({ length: 500 }, (_, index) => ({
      id: `lore-${index}`,
      title: `Lore ${index}`,
      content: 'x'.repeat(20_000),
      keys: [`key-${index}`],
      enabled: true,
      alwaysActive: false,
      caseSensitive: false,
      matchWholeWords: false,
      order: index
    }))

    await expect(
      repository.saveStoryBible(
        project.rootPath,
        { ...project.storyBible, loreEntries },
        project.documentRevisions.storyBible
      )
    ).rejects.toMatchObject({ code: writerErrorCodes.INVALID_PROJECT })

    await expect(readFile(storyBiblePath, 'utf8')).resolves.toBe(originalContent)
    await expect(repository.openProject(project.rootPath)).resolves.toMatchObject({
      storyBible: { loreEntries: [] }
    })
  })

  it('rejects duplicate lore entry ids without changing the Story Bible', async () => {
    const project = await createProject()
    const storyBiblePath = path.join(project.rootPath, '.cherry-writer', 'story-bible.json')
    const originalContent = await readFile(storyBiblePath, 'utf8')
    const duplicateEntry = {
      id: 'duplicate-lore',
      title: 'Duplicate lore',
      content: 'The same identifier must not address two entries.',
      keys: ['duplicate'],
      enabled: true,
      alwaysActive: false,
      caseSensitive: false,
      matchWholeWords: false,
      order: 100
    }

    await expect(
      repository.saveStoryBible(
        project.rootPath,
        { ...project.storyBible, loreEntries: [duplicateEntry, { ...duplicateEntry, title: 'Second entry' }] },
        project.documentRevisions.storyBible
      )
    ).rejects.toMatchObject({ code: writerErrorCodes.INVALID_PROJECT })
    await expect(readFile(storyBiblePath, 'utf8')).resolves.toBe(originalContent)
  })

  it('opens schema-version-one projects created before lorebook entries were added', async () => {
    const project = await createProject()
    const storyBiblePath = path.join(project.rootPath, '.cherry-writer', 'story-bible.json')
    const storyBible = JSON.parse(await readFile(storyBiblePath, 'utf8'))
    Reflect.deleteProperty(storyBible, 'loreEntries')
    await writeFile(storyBiblePath, JSON.stringify(storyBible), 'utf8')

    const reopened = await repository.openProject(project.rootPath)

    expect(reopened.storyBible.loreEntries).toEqual([])
  })

  it('saves outline by semantic revision and leaves a stale retry unchanged', async () => {
    const project = await createProject()
    const initialRevision = project.documentRevisions.outline
    const updatedOutline = {
      ...project.outline,
      bookSummary: '主角必须在三天内找到出口。',
      chapterPlans: project.outline.chapterPlans.map((plan) => ({ ...plan, goal: '找到第一条线索' }))
    }

    const saved = await repository.saveOutline(project.rootPath, updatedOutline, initialRevision)
    const outlinePath = path.join(project.rootPath, '.cherry-writer', 'outline.json')
    const persistedBeforeStaleRetry = await readFile(outlinePath, 'utf8')

    expect(saved.outline).toEqual(updatedOutline)
    expect(saved.documentRevisions.outline).not.toBe(initialRevision)
    await expect(
      repository.saveOutline(
        project.rootPath,
        { ...saved.outline, bookSummary: '会被 stale revision 拒绝' },
        initialRevision
      )
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
    await expect(readFile(outlinePath, 'utf8')).resolves.toBe(persistedBeforeStaleRetry)
  })

  it('saves continuity by semantic revision and leaves a stale retry unchanged', async () => {
    const project = await createProject()
    const initialRevision = project.documentRevisions.continuity
    const updatedContinuity = {
      ...project.continuity,
      facts: [
        {
          id: randomUUID(),
          subject: '密室门',
          predicate: '保持上锁',
          detail: '钥匙仍在守卫手中',
          sourceChapterId: project.manifest.activeChapterId
        }
      ]
    }

    const saved = await repository.saveContinuity(project.rootPath, updatedContinuity, initialRevision)
    const continuityPath = path.join(project.rootPath, '.cherry-writer', 'continuity.json')
    const persistedBeforeStaleRetry = await readFile(continuityPath, 'utf8')

    expect(saved.continuity).toEqual(updatedContinuity)
    expect(saved.documentRevisions.continuity).not.toBe(initialRevision)
    await expect(
      repository.saveContinuity(project.rootPath, { ...saved.continuity, facts: [] }, initialRevision)
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
    await expect(readFile(continuityPath, 'utf8')).resolves.toBe(persistedBeforeStaleRetry)
  })

  it('throttles autosave snapshots and bounds retained history per chapter', async () => {
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      historySnapshotThrottleMs: 1_000,
      maxHistorySnapshotsPerChapter: 2
    })
    const project = await createProject()
    const chapterId = project.manifest.activeChapterId
    const initial = await repository.readChapter(project.rootPath, chapterId)

    const first = await repository.saveChapter(project.rootPath, chapterId, '版本一', initial.chapter.revision)
    nowMs += 100
    const second = await repository.saveChapter(project.rootPath, chapterId, '版本二', first.chapter.revision)
    expect(await repository.readRecentHistory(project.rootPath, chapterId, 10)).toHaveLength(1)

    nowMs += 1_000
    const third = await repository.saveChapter(project.rootPath, chapterId, '版本三', second.chapter.revision)
    nowMs += 1_000
    await repository.saveChapter(project.rootPath, chapterId, '版本四', third.chapter.revision)

    const snapshots = await repository.readRecentHistory(project.rootPath, chapterId, 10)
    expect(snapshots).toHaveLength(2)
    expect(snapshots.map((snapshot) => snapshot.content)).toEqual(['版本三', '版本二'])
  })

  it('lists, reads, and restores portable history while snapshotting the displaced current text', async () => {
    const project = await createProject()
    const chapterId = project.manifest.activeChapterId
    const initial = await repository.readChapter(project.rootPath, chapterId)
    const versionOne = await repository.saveChapter(project.rootPath, chapterId, '版本一', initial.chapter.revision)
    nowMs += 31_000
    const versionTwo = await repository.saveChapter(
      project.rootPath,
      chapterId,
      '版本二的正文',
      versionOne.chapter.revision
    )

    const beforeRestore = await repository.listHistory(project.rootPath, chapterId, 20)
    const versionOneSnapshot = beforeRestore.find((snapshot) => snapshot.revision === writerRevision('版本一'))
    expect(versionOneSnapshot).toMatchObject({
      createdAt: new Date(nowMs).toISOString(),
      characterCount: 3
    })
    await expect(
      repository.readHistorySnapshot(project.rootPath, chapterId, versionOneSnapshot!.fileName)
    ).resolves.toMatchObject({ content: '版本一', revision: writerRevision('版本一') })

    const restored = await repository.restoreHistorySnapshot(
      project.rootPath,
      chapterId,
      versionOneSnapshot!.fileName,
      versionTwo.chapter.revision
    )

    expect(restored.content).toBe('版本一')
    const afterRestore = await repository.listHistory(project.rootPath, chapterId, 20)
    expect(afterRestore.some((snapshot) => snapshot.revision === writerRevision('版本二的正文'))).toBe(true)

    const historyCountBeforeStaleRetry = afterRestore.length
    await expect(
      repository.restoreHistorySnapshot(
        project.rootPath,
        chapterId,
        versionOneSnapshot!.fileName,
        versionTwo.chapter.revision
      )
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
    await expect(repository.readChapter(project.rootPath, chapterId)).resolves.toMatchObject({ content: '版本一' })
    await expect(repository.listHistory(project.rootPath, chapterId, 20)).resolves.toHaveLength(
      historyCountBeforeStaleRetry
    )
  })

  it('rejects an over-contract history snapshot before read or restore can expose it', async () => {
    const project = await createProject()
    const chapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const oversized = 'x'.repeat(1_000_001)
    const fileName = `${String(nowMs).padStart(13, '0')}-${writerRevision(oversized).slice(0, 12)}-${randomUUID()}.md`
    const historyDirectory = path.join(project.rootPath, '.cherry-writer', 'history', chapter.chapter.id)
    await mkdir(historyDirectory, { recursive: true })
    await writeFile(path.join(historyDirectory, fileName), oversized, 'utf8')

    await expect(repository.readHistorySnapshot(project.rootPath, chapter.chapter.id, fileName)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROJECT
    })
    await expect(
      repository.restoreHistorySnapshot(project.rootPath, chapter.chapter.id, fileName, chapter.chapter.revision)
    ).rejects.toMatchObject({ code: writerErrorCodes.INVALID_PROJECT })
    await expect(repository.readChapter(project.rootPath, chapter.chapter.id)).resolves.toEqual(chapter)
  })

  it('rejects identifier and symlink path escapes', async () => {
    const project = await createProject()
    await expect(repository.readChapter(project.rootPath, '../outside')).rejects.toMatchObject({
      code: writerErrorCodes.PATH_OUTSIDE_PROJECT
    })

    const manuscript = path.join(project.rootPath, 'manuscript')
    await rename(manuscript, path.join(project.rootPath, 'manuscript-original'))
    const outside = path.join(parentDirectory, 'outside-manuscript')
    await mkdir(outside)
    await symlink(outside, manuscript, 'dir')

    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.PATH_OUTSIDE_PROJECT
    })
  })

  it('rejects a nested history symlink before reading or writing outside the project', async () => {
    const project = await createProject()
    const chapterId = project.manifest.activeChapterId
    const outside = path.join(parentDirectory, 'outside-history')
    await mkdir(outside)
    await symlink(outside, path.join(project.rootPath, '.cherry-writer', 'history', chapterId), 'dir')

    await expect(repository.readRecentHistory(project.rootPath, chapterId, 10)).rejects.toMatchObject({
      code: writerErrorCodes.PATH_OUTSIDE_PROJECT
    })

    const initial = await repository.readChapter(project.rootPath, chapterId)
    await expect(
      repository.saveChapter(project.rootPath, chapterId, '不得写到项目外', initial.chapter.revision)
    ).rejects.toMatchObject({ code: writerErrorCodes.PATH_OUTSIDE_PROJECT })
    await expect(readdir(outside)).resolves.toEqual([])
  })

  it('reports an existing project path with the public PROJECT_ALREADY_EXISTS code and a human message', async () => {
    await createProject()

    await expect(createProject()).rejects.toMatchObject({
      code: writerErrorCodes.PROJECT_ALREADY_EXISTS,
      message: 'A file or directory already exists at the writer project path'
    })
  })

  it('avoids Windows reserved device names when deriving a project directory', async () => {
    const project = await repository.createProject({ parentDirectory, title: 'CON' })

    expect(path.basename(project.rootPath)).toBe('CON-project')
  })

  it('rejects chapter filenames that collide under case-insensitive filesystems', async () => {
    const project = await createProject()
    const manifestPath = path.join(project.rootPath, '.cherry-writer', 'project.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const original = manifest.chapters[0]
    manifest.chapters.push({
      ...original,
      id: randomUUID(),
      fileName: `${original.fileName.slice(0, -3).toUpperCase()}.md`,
      order: 1
    })
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')

    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROJECT,
      message: 'Writer project contains duplicate chapter metadata'
    })
  })

  it('rejects a proposal file symlink that resolves outside the project', async () => {
    const project = await createProject()
    const chapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const proposal = makeProposal(project, chapter.chapter.revision, 'review', '外部文件里的审稿')
    const outsideProposal = path.join(parentDirectory, 'outside-proposal.json')
    await writeFile(outsideProposal, JSON.stringify(proposal), 'utf8')
    await symlink(
      outsideProposal,
      path.join(project.rootPath, '.cherry-writer', 'proposals', `${proposal.id}.json`),
      'file'
    )

    await expect(repository.readProposal(project.rootPath, proposal.id)).rejects.toMatchObject({
      code: writerErrorCodes.PATH_OUTSIDE_PROJECT
    })
  })

  it('lists portable proposal summaries newest-first and reads the selected full proposal', async () => {
    const project = await createProject()
    const firstChapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const secondChapter = await repository.createChapter(project.rootPath, '第二章')
    const first = makeProposal(project, firstChapter.chapter.revision, 'review', '第一份完整正文')
    await repository.writeProposal(project.rootPath, first)

    nowMs += 1_000
    const second = WriterProposalSchema.parse({
      ...makeProposal(project, secondChapter.chapter.revision, 'draft', '第二份完整正文'),
      chapterId: secondChapter.chapter.id,
      createdAt: new Date(nowMs).toISOString(),
      contextPacket: {
        ...first.contextPacket,
        chapterId: secondChapter.chapter.id,
        operation: 'draft',
        generatedAt: new Date(nowMs).toISOString()
      }
    })
    await repository.writeProposal(project.rootPath, second)

    nowMs += 1_000
    const latest = WriterProposalSchema.parse({
      ...makeProposal(project, firstChapter.chapter.revision, 'rewrite', '最新完整正文'),
      createdAt: new Date(nowMs).toISOString()
    })
    await repository.writeProposal(project.rootPath, latest)
    const proposalsDir = path.join(project.rootPath, '.cherry-writer', 'proposals')
    await writeFile(path.join(proposalsDir, '.proposal.partial.tmp'), 'ignored', 'utf8')
    await writeFile(path.join(proposalsDir, 'unsafe name.json'), JSON.stringify(first), 'utf8')

    const all = await repository.listProposals(project.rootPath, undefined, 10)
    const firstChapterOnly = await repository.listProposals(project.rootPath, firstChapter.chapter.id, 1)

    expect(all.map((summary) => summary.id)).toEqual([latest.id, second.id, first.id])
    expect(all[0]).not.toHaveProperty('content')
    expect(all[0]).not.toHaveProperty('contextPacket')
    expect(firstChapterOnly.map((summary) => summary.id)).toEqual([latest.id])
    await expect(repository.readProposal(project.rootPath, second.id)).resolves.toEqual(second)
  })

  it('rejects an excessive safe proposal scan before reading any proposal body', async () => {
    const proposalReads: string[] = []
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      onProposalRead: (filePath) => proposalReads.push(path.basename(filePath))
    })
    const project = await createProject()
    const proposalsDir = path.join(project.rootPath, '.cherry-writer', 'proposals')
    await Promise.all(
      Array.from({ length: 257 }, (_, index) =>
        writeFile(path.join(proposalsDir, `proposal-${index}.json`), '{}', 'utf8')
      )
    )

    await expect(repository.listProposals(project.rootPath, undefined, 1)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROPOSAL,
      message: 'Writer proposal scan exceeds the safe file limit'
    })
    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROPOSAL,
      message: 'Writer proposal scan exceeds the safe file limit'
    })
    expect(proposalReads).toEqual([])
  })

  it('rejects foreign-project and dangling-chapter proposals from read, list, and apply', async () => {
    const firstProject = await createProject()
    const secondParent = await mkdtemp(path.join(tmpdir(), 'cherry-writer-foreign-proposal-'))
    try {
      const secondProject = await repository.createProject({ parentDirectory: secondParent, title: '第二项目' })
      const firstChapter = await repository.readChapter(firstProject.rootPath, firstProject.manifest.activeChapterId)
      const secondChapter = await repository.readChapter(secondProject.rootPath, secondProject.manifest.activeChapterId)
      const proposalDirectory = path.join(secondProject.rootPath, '.cherry-writer', 'proposals')
      const foreign = makeProposal(firstProject, firstChapter.chapter.revision, 'rewrite', '外项目提案')
      await writeFile(path.join(proposalDirectory, `${foreign.id}.json`), JSON.stringify(foreign), 'utf8')

      await expect(repository.readProposal(secondProject.rootPath, foreign.id)).rejects.toMatchObject({
        code: writerErrorCodes.INVALID_PROPOSAL
      })
      await expect(
        repository.applyProposal({
          rootPath: secondProject.rootPath,
          proposalId: foreign.id,
          mode: 'replace',
          expectedRevision: secondChapter.chapter.revision
        })
      ).rejects.toMatchObject({ code: writerErrorCodes.INVALID_PROPOSAL })
      await unlink(path.join(proposalDirectory, `${foreign.id}.json`))

      const dangling = WriterProposalSchema.parse({
        ...makeProposal(secondProject, secondChapter.chapter.revision, 'rewrite', '悬空章节提案'),
        chapterId: 'missing-chapter',
        contextPacket: {
          ...foreign.contextPacket,
          projectId: secondProject.manifest.id,
          chapterId: 'missing-chapter',
          operation: 'rewrite'
        }
      })
      await writeFile(path.join(proposalDirectory, `${dangling.id}.json`), JSON.stringify(dangling), 'utf8')

      await expect(repository.listProposals(secondProject.rootPath, undefined, 10)).rejects.toMatchObject({
        code: writerErrorCodes.CHAPTER_NOT_FOUND
      })
    } finally {
      await rm(secondParent, { recursive: true, force: true })
    }
  })

  it('rejects oversized project JSON before parsing it', async () => {
    const project = await createProject()
    const storyBiblePath = path.join(project.rootPath, '.cherry-writer', 'story-bible.json')
    const validJson = await readFile(storyBiblePath, 'utf8')
    await writeFile(storyBiblePath, `${validJson}${' '.repeat(8 * 1024 * 1024)}`, 'utf8')

    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROJECT,
      message: 'Writer project data exceeds the safe read limit'
    })
  })

  it('rejects an oversized chapter before loading it into the project view', async () => {
    const manuscriptReads: string[] = []
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      onManuscriptRead: (filePath) => manuscriptReads.push(path.basename(filePath))
    })
    const project = await createProject()
    const chapter = project.manifest.chapters[0]
    await writeFile(path.join(project.rootPath, 'manuscript', chapter.fileName), '字'.repeat(1_500_000), 'utf8')

    await expect(repository.openProject(project.rootPath)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROJECT,
      message: 'Writer chapter exceeds the safe read limit'
    })
    expect(manuscriptReads).toEqual([])
  })

  it('rejects an externally oversized character count before reading or snapshotting the chapter', async () => {
    const project = await createProject()
    const chapter = project.manifest.chapters[0]
    await writeFile(
      path.join(project.rootPath, 'manuscript', chapter.fileName),
      'x'.repeat(WRITER_MAX_CHAPTER_CHARS + 1),
      'utf8'
    )

    await expect(repository.openProject(project.rootPath)).resolves.toMatchObject({ rootPath: project.rootPath })
    await expect(repository.readChapter(project.rootPath, chapter.id)).rejects.toMatchObject({
      code: writerErrorCodes.INVALID_PROJECT,
      message: 'Writer chapter exceeds the safe content limit'
    })
    await expect(repository.saveChapter(project.rootPath, chapter.id, 'short', chapter.revision)).rejects.toMatchObject(
      { code: writerErrorCodes.INVALID_PROJECT }
    )
    await expect(repository.listHistory(project.rootPath, chapter.id, 10)).resolves.toEqual([])
  })

  it('gates proposal apply by base revision, operation and mode, while forcing a history snapshot', async () => {
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      historySnapshotThrottleMs: 60_000,
      maxHistorySnapshotsPerChapter: 10
    })
    const project = await createProject()
    const chapterId = project.manifest.activeChapterId
    const initial = await repository.readChapter(project.rootPath, chapterId)
    const seeded = await repository.saveChapter(project.rootPath, chapterId, '第一段', initial.chapter.revision)

    const review = makeProposal(project, seeded.chapter.revision, 'review', '审稿意见')
    await repository.writeProposal(project.rootPath, review)
    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: review.id,
        mode: 'replace',
        expectedRevision: seeded.chapter.revision
      })
    ).rejects.toMatchObject({ code: writerErrorCodes.PROPOSAL_MODE_NOT_ALLOWED })

    const continuation = makeProposal(project, seeded.chapter.revision, 'continue', '第二段')
    await repository.writeProposal(project.rootPath, continuation)
    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: continuation.id,
        mode: 'replace',
        expectedRevision: seeded.chapter.revision
      })
    ).rejects.toMatchObject({ code: writerErrorCodes.PROPOSAL_MODE_NOT_ALLOWED })

    const applied = await repository.applyProposal({
      rootPath: project.rootPath,
      proposalId: continuation.id,
      mode: 'append',
      expectedRevision: seeded.chapter.revision
    })
    expect(applied.content).toBe('第一段\n\n第二段')
    expect(await repository.readRecentHistory(project.rootPath, chapterId, 10)).toHaveLength(2)
    await expect(repository.readProposal(project.rootPath, continuation.id)).resolves.toMatchObject({
      status: 'applied',
      appliedMode: 'append',
      appliedRevision: applied.chapter.revision
    })
    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: continuation.id,
        mode: 'append',
        expectedRevision: seeded.chapter.revision
      })
    ).resolves.toEqual(applied)
    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: continuation.id,
        mode: 'replace',
        expectedRevision: applied.chapter.revision
      })
    ).rejects.toMatchObject({ code: writerErrorCodes.PROPOSAL_ALREADY_APPLIED })

    const stale = makeProposal(project, seeded.chapter.revision, 'rewrite', '过期改写')
    await repository.writeProposal(project.rootPath, stale)
    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: stale.id,
        mode: 'replace',
        expectedRevision: applied.chapter.revision
      })
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })

    const proposalFile = path.join(project.rootPath, '.cherry-writer', 'proposals', `${continuation.id}.json`)
    expect(JSON.parse(await readFile(proposalFile, 'utf8'))).toMatchObject({ status: 'applied' })
  })

  it('rejects an append whose final chapter would exceed the write contract without journaling or snapshotting', async () => {
    const project = await createProject()
    const chapterId = project.manifest.activeChapterId
    const initial = await repository.readChapter(project.rootPath, chapterId)
    const seeded = await repository.saveChapter(
      project.rootPath,
      chapterId,
      'x'.repeat(WRITER_MAX_CHAPTER_CHARS - 1),
      initial.chapter.revision
    )
    const historyBefore = await repository.listHistory(project.rootPath, chapterId, 10)
    const proposal = makeProposal(project, seeded.chapter.revision, 'continue', 'y')
    await repository.writeProposal(project.rootPath, proposal)

    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: proposal.id,
        mode: 'append',
        expectedRevision: seeded.chapter.revision
      })
    ).rejects.toMatchObject({ code: writerErrorCodes.INVALID_PROPOSAL })

    await expect(repository.readChapter(project.rootPath, chapterId)).resolves.toEqual(seeded)
    await expect(repository.readProposal(project.rootPath, proposal.id)).resolves.toMatchObject({ status: 'pending' })
    await expect(repository.listHistory(project.rootPath, chapterId, 10)).resolves.toEqual(historyBefore)
  })

  it('rejects a pending proposal after its structured context documents change', async () => {
    const project = await createProject()
    const chapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const proposal = makeProposal(project, chapter.chapter.revision, 'rewrite', '基于旧设定的正文')
    await repository.writeProposal(project.rootPath, proposal)
    await repository.saveStoryBible(
      project.rootPath,
      { ...project.storyBible, hardRules: ['新规则覆盖了生成时的旧设定'] },
      project.documentRevisions.storyBible
    )

    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: proposal.id,
        mode: 'replace',
        expectedRevision: chapter.chapter.revision
      })
    ).rejects.toMatchObject({ code: writerErrorCodes.REVISION_CONFLICT })
    await expect(repository.readChapter(project.rootPath, chapter.chapter.id)).resolves.toMatchObject({ content: '' })
  })

  it('reads each applying target chapter once and does not read unrelated chapters during recovery', async () => {
    const manuscriptReads: string[] = []
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      onManuscriptRead: (filePath) => manuscriptReads.push(path.basename(filePath))
    })
    const project = await createProject()
    await repository.createChapter(project.rootPath, '第二章')
    await repository.createChapter(project.rootPath, '第三章')
    const chapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const first = makeProposal(project, chapter.chapter.revision, 'rewrite', '候选一')
    const second = WriterProposalSchema.parse({
      ...makeProposal(project, chapter.chapter.revision, 'rewrite', '候选二'),
      id: randomUUID()
    })
    await repository.writeProposal(project.rootPath, first)
    await repository.writeProposal(project.rootPath, second)
    const proposalDirectory = path.join(project.rootPath, '.cherry-writer', 'proposals')
    for (const proposal of [first, second]) {
      await writeFile(
        path.join(proposalDirectory, `${proposal.id}.json`),
        JSON.stringify({
          ...proposal,
          status: 'applying',
          targetRevision: writerRevision(proposal.content),
          appliedMode: 'replace'
        }),
        'utf8'
      )
    }
    manuscriptReads.length = 0

    await repository.openProject(project.rootPath)

    expect(manuscriptReads).toEqual([chapter.chapter.fileName])
  })

  it('rolls an applying proposal back to pending when the manuscript still has the base revision', async () => {
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      applyFaultHook: (stage) => {
        if (stage === 'after-journal') throw new Error('simulated crash after journal')
      }
    })
    const project = await createProject()
    const chapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const seeded = await repository.saveChapter(
      project.rootPath,
      chapter.chapter.id,
      '旧正文',
      chapter.chapter.revision
    )
    const proposal = makeProposal(project, seeded.chapter.revision, 'rewrite', '新正文')
    await repository.writeProposal(project.rootPath, proposal)

    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: proposal.id,
        mode: 'replace',
        expectedRevision: seeded.chapter.revision
      })
    ).rejects.toThrow('simulated crash after journal')
    await expect(repository.readProposal(project.rootPath, proposal.id)).resolves.toMatchObject({
      status: 'applying',
      targetRevision: expect.stringMatching(/^[a-f0-9]{64}$/)
    })

    await repository.openProject(project.rootPath)

    await expect(repository.readProposal(project.rootPath, proposal.id)).resolves.toMatchObject({ status: 'pending' })
    await expect(repository.readChapter(project.rootPath, chapter.chapter.id)).resolves.toMatchObject({
      content: '旧正文'
    })
  })

  it('finishes an applying proposal when the manuscript already has its target revision', async () => {
    repository = new WriterProjectRepository({
      now: () => new Date(nowMs),
      applyFaultHook: (stage) => {
        if (stage === 'after-content') throw new Error('simulated crash after content')
      }
    })
    const project = await createProject()
    const chapter = await repository.readChapter(project.rootPath, project.manifest.activeChapterId)
    const seeded = await repository.saveChapter(
      project.rootPath,
      chapter.chapter.id,
      '旧正文',
      chapter.chapter.revision
    )
    const proposal = makeProposal(project, seeded.chapter.revision, 'rewrite', '新正文')
    await repository.writeProposal(project.rootPath, proposal)

    await expect(
      repository.applyProposal({
        rootPath: project.rootPath,
        proposalId: proposal.id,
        mode: 'replace',
        expectedRevision: seeded.chapter.revision
      })
    ).rejects.toThrow('simulated crash after content')
    await expect(repository.readProposal(project.rootPath, proposal.id)).resolves.toMatchObject({
      status: 'applying',
      targetRevision: writerRevision('新正文')
    })

    await repository.openProject(project.rootPath)

    await expect(repository.readProposal(project.rootPath, proposal.id)).resolves.toMatchObject({
      status: 'applied',
      appliedMode: 'replace',
      appliedRevision: writerRevision('新正文')
    })
    await expect(repository.readChapter(project.rootPath, chapter.chapter.id)).resolves.toMatchObject({
      content: '新正文'
    })
  })
})
