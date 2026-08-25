import { createHash, randomUUID } from 'node:crypto'
import { access, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

import { writerErrorCodes } from '@shared/ipc/errors/writer'
import {
  WRITER_MAX_CHAPTER_CHARS,
  WRITER_MISSING_CONTINUITY_REVIEW_REVISION,
  WRITER_PROJECT_SCHEMA_VERSION,
  type WriterChapterDocument,
  type WriterChapterMetadata,
  WriterChapterMetadataSchema,
  type WriterContinuityLedger,
  WriterContinuityLedgerSchema,
  type WriterContinuityReviewDocument,
  WriterContinuityReviewDocumentSchema,
  type WriterContinuityReviewRevision,
  WriterEntityIdSchema,
  WriterHistoryFileNameSchema,
  type WriterHistorySnapshot,
  WriterHistorySnapshotSchema,
  type WriterHistorySummary,
  type WriterOutline,
  WriterOutlineSchema,
  type WriterProject,
  type WriterProjectCreateInput,
  type WriterProjectManifest,
  WriterProjectManifestSchema,
  type WriterProposal,
  type WriterProposalApplyInput,
  WriterProposalSchema,
  type WriterProposalSummary,
  type WriterStoryBible,
  WriterStoryBibleSchema
} from '@shared/types/writer'
import type { ZodType } from 'zod'

import { isWriterStudioError, WriterStudioError } from './writerErrors'
import { writerDocumentRevisionsEqual } from './writerRevisions'

const WRITER_DIRECTORY = '.cherry-writer'
const PROJECT_FILE = 'project.json'
const STORY_BIBLE_FILE = 'story-bible.json'
const OUTLINE_FILE = 'outline.json'
const CONTINUITY_FILE = 'continuity.json'
const CONTINUITY_REVIEW_FILE = 'continuity-review.json'
const MANUSCRIPT_DIRECTORY = 'manuscript'
const PROPOSALS_DIRECTORY = 'proposals'
const HISTORY_DIRECTORY = 'history'
const DEFAULT_HISTORY_SNAPSHOT_THROTTLE_MS = 30_000
const DEFAULT_MAX_HISTORY_SNAPSHOTS_PER_CHAPTER = 100
const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024
const MAX_PROPOSAL_JSON_BYTES = 4 * 1024 * 1024
const MAX_CHAPTER_BYTES = 4 * 1024 * 1024
const MAX_MANUSCRIPT_BYTES = 256 * 1024 * 1024
const MAX_PROPOSAL_DIRECTORY_ENTRIES = 1_000
const MAX_PROPOSAL_SCAN_FILES = 256
const MAX_PROPOSAL_SCAN_BYTES = 64 * 1024 * 1024
const DEFAULT_PROPOSAL_LIST_LIMIT = 50
const MAX_PROPOSAL_LIST_LIMIT = 200
const MAX_HISTORY_DIRECTORY_ENTRIES = 1_000
const DEFAULT_HISTORY_LIST_LIMIT = 50
const MAX_HISTORY_LIST_LIMIT = 200
const WINDOWS_FORBIDDEN_FILENAME_CHARS = /[<>:"/\\|?*]|\p{Cc}/gu

interface WriterProjectPaths {
  root: string
  metadata: string
  manifest: string
  storyBible: string
  outline: string
  continuity: string
  continuityReview: string
  manuscript: string
  proposals: string
  history: string
}

interface LoadedProjectDocuments {
  paths: WriterProjectPaths
  project: WriterProject
}

interface WriterChapterFileStat {
  filePath: string
  size: number
}

export interface WriterProjectRepositoryOptions {
  historySnapshotThrottleMs?: number
  maxHistorySnapshotsPerChapter?: number
  now?: () => Date
  applyFaultHook?: (stage: WriterApplyFaultStage) => void | Promise<void>
  onManuscriptRead?: (filePath: string) => void
  onProposalRead?: (filePath: string) => void
}

export type WriterApplyFaultStage = 'after-journal' | 'after-content'

export interface WriterContinuityReviewSnapshot {
  document?: WriterContinuityReviewDocument
  revision: WriterContinuityReviewRevision
}

function projectPaths(root: string): WriterProjectPaths {
  const metadata = path.join(root, WRITER_DIRECTORY)
  return {
    root,
    metadata,
    manifest: path.join(metadata, PROJECT_FILE),
    storyBible: path.join(metadata, STORY_BIBLE_FILE),
    outline: path.join(metadata, OUTLINE_FILE),
    continuity: path.join(metadata, CONTINUITY_FILE),
    continuityReview: path.join(metadata, CONTINUITY_REVIEW_FILE),
    manuscript: path.join(root, MANUSCRIPT_DIRECTORY),
    proposals: path.join(metadata, PROPOSALS_DIRECTORY),
    history: path.join(metadata, HISTORY_DIRECTORY)
  }
}

export function writerRevision(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function writerSemanticRevision(value: unknown): string {
  return writerRevision(canonicalJson(value))
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`
}

function isContained(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function resolveContained(base: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(base)
  const candidate = path.resolve(resolvedBase, ...segments)
  if (!isContained(resolvedBase, candidate)) {
    throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, 'Writer path escapes the project boundary')
  }
  return candidate
}

function requireEntityId(value: string, kind: 'chapter' | 'proposal'): string {
  if (!WriterEntityIdSchema.safeParse(value).success) {
    throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, `Invalid ${kind} identifier`)
  }
  return value
}

function sanitizeProjectDirectory(title: string): string {
  const candidate = title
    .normalize('NFKC')
    .replace(WINDOWS_FORBIDDEN_FILENAME_CHARS, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 80)
  const safeCandidate = candidate || 'untitled-project'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safeCandidate)
    ? `${safeCandidate}-project`
    : safeCandidate
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === code
  )
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return false
    throw error
  }
}

async function atomicWriteFile(target: string, content: string): Promise<void> {
  const directory = path.dirname(target)
  const tempPath = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(tempPath, 'wx', 0o600)
    await handle.writeFile(content, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(tempPath, target)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(tempPath, { force: true }).catch(() => undefined)
  }
}

function assertChapterContentWithinLimits(
  content: string,
  invalidCode: typeof writerErrorCodes.INVALID_PROJECT | typeof writerErrorCodes.INVALID_PROPOSAL
): void {
  const actualChars = content.length
  const actualBytes = Buffer.byteLength(content, 'utf8')
  if (actualChars > WRITER_MAX_CHAPTER_CHARS || actualBytes > MAX_CHAPTER_BYTES) {
    throw new WriterStudioError(invalidCode, 'Writer chapter exceeds the safe content limit', {
      actualChars,
      maxChars: WRITER_MAX_CHAPTER_CHARS,
      actualBytes,
      maxBytes: MAX_CHAPTER_BYTES
    })
  }
}

async function atomicWriteBoundedJson(
  target: string,
  value: unknown,
  maxBytes: number,
  invalidCode: typeof writerErrorCodes.INVALID_PROJECT | typeof writerErrorCodes.INVALID_PROPOSAL
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`
  const actualBytes = Buffer.byteLength(content, 'utf8')
  if (actualBytes > maxBytes) {
    throw new WriterStudioError(invalidCode, 'Writer JSON exceeds the safe write limit', { actualBytes, maxBytes })
  }
  await atomicWriteFile(target, content)
}

async function atomicWriteProjectJson(target: string, value: unknown): Promise<void> {
  await atomicWriteBoundedJson(target, value, MAX_PROJECT_JSON_BYTES, writerErrorCodes.INVALID_PROJECT)
}

async function atomicWriteProposalJson(target: string, value: unknown): Promise<void> {
  await atomicWriteBoundedJson(target, value, MAX_PROPOSAL_JSON_BYTES, writerErrorCodes.INVALID_PROPOSAL)
}

async function readValidatedJson<T>(
  target: string,
  schema: ZodType<T>,
  missingCode: typeof writerErrorCodes.PROJECT_NOT_FOUND | typeof writerErrorCodes.PROPOSAL_NOT_FOUND,
  invalidCode: typeof writerErrorCodes.INVALID_PROJECT | typeof writerErrorCodes.INVALID_PROPOSAL,
  maxBytes = MAX_PROJECT_JSON_BYTES
): Promise<T> {
  let raw: string
  try {
    const fileStat = await stat(target)
    if (fileStat.size > maxBytes) {
      throw new WriterStudioError(
        invalidCode,
        invalidCode === writerErrorCodes.INVALID_PROJECT
          ? 'Writer project data exceeds the safe read limit'
          : 'Writer proposal data exceeds the safe read limit',
        { actualBytes: fileStat.size, maxBytes }
      )
    }
    raw = await readFile(target, 'utf8')
  } catch (error) {
    if (isWriterStudioError(error)) throw error
    if (isErrno(error, 'ENOENT')) {
      throw new WriterStudioError(
        missingCode,
        missingCode === writerErrorCodes.PROJECT_NOT_FOUND ? 'Writer project not found' : 'Writer proposal not found'
      )
    }
    throw error
  }

  try {
    return schema.parse(JSON.parse(raw))
  } catch (error) {
    throw new WriterStudioError(
      invalidCode,
      invalidCode === writerErrorCodes.INVALID_PROJECT
        ? 'Writer project data is invalid'
        : 'Writer proposal data is invalid',
      {
        cause: error instanceof Error ? error.message : String(error)
      }
    )
  }
}

async function assertRealPathContained(base: string, candidate: string): Promise<string> {
  const resolved = await realpath(candidate)
  if (!isContained(base, resolved)) {
    throw new WriterStudioError(
      writerErrorCodes.PATH_OUTSIDE_PROJECT,
      'Writer path resolves outside the project boundary'
    )
  }
  return resolved
}

function validateManifestInvariants(manifest: WriterProjectManifest): void {
  if (manifest.chapters.length === 0) {
    throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer project has no chapters')
  }
  const chapterIds = new Set<string>()
  const fileNames = new Set<string>()
  const orders = new Set<number>()
  for (const chapter of manifest.chapters) {
    const caseFoldedFileName = chapter.fileName.normalize('NFKC').toLocaleLowerCase('en-US')
    if (chapterIds.has(chapter.id) || fileNames.has(caseFoldedFileName) || orders.has(chapter.order)) {
      throw new WriterStudioError(
        writerErrorCodes.INVALID_PROJECT,
        'Writer project contains duplicate chapter metadata'
      )
    }
    chapterIds.add(chapter.id)
    fileNames.add(caseFoldedFileName)
    orders.add(chapter.order)
  }
  if (!chapterIds.has(manifest.activeChapterId)) {
    throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer project active chapter does not exist')
  }
}

function parseStoryBibleForWrite(storyBible: WriterStoryBible): WriterStoryBible {
  const parsed = WriterStoryBibleSchema.safeParse(storyBible)
  if (!parsed.success) {
    throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer Story Bible is invalid', {
      cause: parsed.error.message
    })
  }
  return parsed.data
}

export class WriterProjectRepository {
  private readonly historySnapshotThrottleMs: number
  private readonly maxHistorySnapshotsPerChapter: number
  private readonly now: () => Date
  private readonly applyFaultHook?: WriterProjectRepositoryOptions['applyFaultHook']
  private readonly onManuscriptRead?: WriterProjectRepositoryOptions['onManuscriptRead']
  private readonly onProposalRead?: WriterProjectRepositoryOptions['onProposalRead']

  constructor(options: WriterProjectRepositoryOptions = {}) {
    this.historySnapshotThrottleMs = Math.max(
      0,
      options.historySnapshotThrottleMs ?? DEFAULT_HISTORY_SNAPSHOT_THROTTLE_MS
    )
    this.maxHistorySnapshotsPerChapter = Math.max(
      1,
      Math.floor(options.maxHistorySnapshotsPerChapter ?? DEFAULT_MAX_HISTORY_SNAPSHOTS_PER_CHAPTER)
    )
    this.now = options.now ?? (() => new Date())
    this.applyFaultHook = options.applyFaultHook
    this.onManuscriptRead = options.onManuscriptRead
    this.onProposalRead = options.onProposalRead
  }

  private async loadProjectDocuments(rootPath: string): Promise<LoadedProjectDocuments> {
    const paths = await this.resolveProjectPaths(rootPath)
    const [manifest, storyBible, outline, continuity] = await Promise.all([
      readValidatedJson(
        paths.manifest,
        WriterProjectManifestSchema,
        writerErrorCodes.PROJECT_NOT_FOUND,
        writerErrorCodes.INVALID_PROJECT
      ),
      readValidatedJson(
        paths.storyBible,
        WriterStoryBibleSchema,
        writerErrorCodes.PROJECT_NOT_FOUND,
        writerErrorCodes.INVALID_PROJECT
      ),
      readValidatedJson(
        paths.outline,
        WriterOutlineSchema,
        writerErrorCodes.PROJECT_NOT_FOUND,
        writerErrorCodes.INVALID_PROJECT
      ),
      readValidatedJson(
        paths.continuity,
        WriterContinuityLedgerSchema,
        writerErrorCodes.PROJECT_NOT_FOUND,
        writerErrorCodes.INVALID_PROJECT
      )
    ])
    validateManifestInvariants(manifest)
    return {
      paths,
      project: {
        rootPath: paths.root,
        manifest,
        storyBible,
        outline,
        continuity,
        documentRevisions: {
          storyBible: writerSemanticRevision(storyBible),
          outline: writerSemanticRevision(outline),
          continuity: writerSemanticRevision(continuity)
        }
      }
    }
  }

  private async statChapterFile(
    paths: WriterProjectPaths,
    chapter: WriterChapterMetadata
  ): Promise<WriterChapterFileStat> {
    WriterChapterMetadataSchema.parse(chapter)
    const filePath = resolveContained(paths.manuscript, chapter.fileName)
    try {
      const fileStat = await lstat(filePath)
      if (fileStat.isSymbolicLink()) {
        throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, 'Writer chapter cannot be a symlink')
      }
      if (!fileStat.isFile()) {
        throw new WriterStudioError(writerErrorCodes.CHAPTER_NOT_FOUND, 'Writer chapter is not a regular file')
      }
      await assertRealPathContained(paths.root, filePath)
      if (fileStat.size > MAX_CHAPTER_BYTES) {
        throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer chapter exceeds the safe read limit', {
          actualBytes: fileStat.size,
          maxBytes: MAX_CHAPTER_BYTES
        })
      }
      return { filePath, size: fileStat.size }
    } catch (error) {
      if (isWriterStudioError(error)) throw error
      if (isErrno(error, 'ENOENT')) {
        throw new WriterStudioError(writerErrorCodes.CHAPTER_NOT_FOUND, 'Writer chapter file not found')
      }
      throw error
    }
  }

  private async validateManuscriptInventory(paths: WriterProjectPaths, manifest: WriterProjectManifest): Promise<void> {
    let manuscriptBytes = 0
    for (const chapter of manifest.chapters) {
      manuscriptBytes += (await this.statChapterFile(paths, chapter)).size
      if (manuscriptBytes > MAX_MANUSCRIPT_BYTES) {
        throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer manuscript exceeds the safe read limit', {
          actualBytes: manuscriptBytes,
          maxBytes: MAX_MANUSCRIPT_BYTES
        })
      }
    }
  }

  async createProject(input: WriterProjectCreateInput): Promise<WriterProject> {
    if (!path.isAbsolute(input.parentDirectory)) {
      throw new WriterStudioError(
        writerErrorCodes.PATH_OUTSIDE_PROJECT,
        'Writer project parent must be an absolute path'
      )
    }
    let parent: string
    try {
      parent = await realpath(path.resolve(input.parentDirectory))
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        throw new WriterStudioError(
          writerErrorCodes.PROJECT_NOT_FOUND,
          'Writer project parent directory does not exist'
        )
      }
      throw error
    }

    const root = resolveContained(parent, sanitizeProjectDirectory(input.title))
    if (await pathExists(root)) {
      throw new WriterStudioError(
        writerErrorCodes.PROJECT_ALREADY_EXISTS,
        'A file or directory already exists at the writer project path'
      )
    }

    const staging = resolveContained(parent, `.cherry-writer-create-${randomUUID()}.tmp`)
    const paths = projectPaths(staging)
    try {
      await mkdir(paths.metadata, { recursive: true })
      await Promise.all([
        mkdir(paths.manuscript, { recursive: true }),
        mkdir(paths.proposals, { recursive: true }),
        mkdir(paths.history, { recursive: true })
      ])

      const now = this.now().toISOString()
      const firstChapterId = randomUUID()
      const firstChapter: WriterChapterMetadata = {
        id: firstChapterId,
        title: input.initialChapterTitle ?? 'Chapter 1',
        fileName: `0001-${firstChapterId}.md`,
        order: 0,
        createdAt: now,
        updatedAt: now,
        revision: writerRevision('')
      }
      const manifest: WriterProjectManifest = {
        schemaVersion: WRITER_PROJECT_SCHEMA_VERSION,
        id: randomUUID(),
        title: input.title,
        genre: input.genre,
        premise: input.premise,
        targetWordCount: input.targetWordCount,
        createdAt: now,
        updatedAt: now,
        activeChapterId: firstChapterId,
        chapters: [firstChapter]
      }
      const storyBible: WriterStoryBible = {
        schemaVersion: WRITER_PROJECT_SCHEMA_VERSION,
        genre: input.genre ?? '',
        premise: input.premise ?? '',
        authorGoal: '',
        hardRules: [],
        themes: [],
        characters: [],
        loreEntries: [],
        worldRules: [],
        styleGuide: []
      }
      const outline: WriterOutline = {
        schemaVersion: WRITER_PROJECT_SCHEMA_VERSION,
        bookSummary: '',
        arcs: [],
        chapterPlans: [{ chapterId: firstChapterId, title: firstChapter.title, goal: '', beats: [], status: 'planned' }]
      }
      const continuity: WriterContinuityLedger = {
        schemaVersion: WRITER_PROJECT_SCHEMA_VERSION,
        facts: [],
        foreshadowing: [],
        chapterSummaries: [],
        timelineEvents: [],
        characterStates: []
      }
      const continuityReview: WriterContinuityReviewDocument = {
        schemaVersion: WRITER_PROJECT_SCHEMA_VERSION,
        updatedAt: now,
        coverageDeclarations: [],
        waivers: []
      }

      await Promise.all([
        atomicWriteProjectJson(paths.manifest, WriterProjectManifestSchema.parse(manifest)),
        atomicWriteProjectJson(paths.storyBible, WriterStoryBibleSchema.parse(storyBible)),
        atomicWriteProjectJson(paths.outline, WriterOutlineSchema.parse(outline)),
        atomicWriteProjectJson(paths.continuity, WriterContinuityLedgerSchema.parse(continuity)),
        atomicWriteProjectJson(paths.continuityReview, WriterContinuityReviewDocumentSchema.parse(continuityReview)),
        atomicWriteFile(resolveContained(paths.manuscript, firstChapter.fileName), '')
      ])
      await rename(staging, root)
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      if (isErrno(error, 'EEXIST')) {
        throw new WriterStudioError(writerErrorCodes.PROJECT_ALREADY_EXISTS, 'Writer project already exists')
      }
      throw error
    }

    return await this.openProject(root)
  }

  async openProject(rootPath: string, options: { recoverApplyingProposals?: boolean } = {}): Promise<WriterProject> {
    const loaded = await this.loadProjectDocuments(rootPath)
    await this.validateManuscriptInventory(loaded.paths, loaded.project.manifest)
    if (options.recoverApplyingProposals !== false) {
      await this.recoverApplyingProposals(loaded.paths, loaded.project.manifest)
    }
    return loaded.project
  }

  async createChapter(rootPath: string, title?: string): Promise<WriterChapterDocument> {
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    const order = Math.max(...project.manifest.chapters.map((chapter) => chapter.order)) + 1
    const now = this.now().toISOString()
    const id = randomUUID()
    const chapter = WriterChapterMetadataSchema.parse({
      id,
      title: title ?? `Chapter ${order + 1}`,
      fileName: `${String(order + 1).padStart(4, '0')}-${id}.md`,
      order,
      createdAt: now,
      updatedAt: now,
      revision: writerRevision('')
    })

    await atomicWriteFile(resolveContained(paths.manuscript, chapter.fileName), '')
    const manifest = WriterProjectManifestSchema.parse({
      ...project.manifest,
      updatedAt: now,
      activeChapterId: chapter.id,
      chapters: [...project.manifest.chapters, chapter]
    })
    const outline = WriterOutlineSchema.parse({
      ...project.outline,
      chapterPlans: [
        ...project.outline.chapterPlans,
        { chapterId: chapter.id, title: chapter.title, goal: '', beats: [], status: 'planned' }
      ]
    })
    await atomicWriteProjectJson(paths.manifest, manifest)
    await atomicWriteProjectJson(paths.outline, outline)
    return { chapter, content: '' }
  }

  async readChapter(rootPath: string, chapterId: string): Promise<WriterChapterDocument> {
    requireEntityId(chapterId, 'chapter')
    const { project } = await this.loadProjectDocuments(rootPath)
    return await this.readChapterFromProject(project, chapterId)
  }

  async readChapterFromProject(project: WriterProject, chapterId: string): Promise<WriterChapterDocument> {
    requireEntityId(chapterId, 'chapter')
    const chapter = this.findChapter(project.manifest, chapterId)
    const content = await this.readChapterContent(projectPaths(project.rootPath), chapter)
    return { chapter: { ...chapter, revision: writerRevision(content) }, content }
  }

  async saveChapter(
    rootPath: string,
    chapterId: string,
    content: string,
    expectedRevision: string,
    options: { forceHistorySnapshot?: boolean } = {}
  ): Promise<WriterChapterDocument> {
    requireEntityId(chapterId, 'chapter')
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    const chapter = this.findChapter(project.manifest, chapterId)
    const currentContent = await this.readChapterContent(paths, chapter)
    const actualRevision = writerRevision(currentContent)
    this.assertRevision(expectedRevision, actualRevision)
    assertChapterContentWithinLimits(content, writerErrorCodes.INVALID_PROJECT)

    if (content === currentContent && options.forceHistorySnapshot !== true) {
      return { chapter: { ...chapter, revision: actualRevision }, content }
    }

    await this.maybeWriteHistorySnapshot(
      paths,
      chapter,
      currentContent,
      actualRevision,
      options.forceHistorySnapshot === true
    )

    if (content === currentContent) {
      return { chapter: { ...chapter, revision: actualRevision }, content }
    }

    const chapterPath = resolveContained(paths.manuscript, chapter.fileName)
    await atomicWriteFile(chapterPath, content)
    const now = this.now().toISOString()
    const savedChapter: WriterChapterMetadata = {
      ...chapter,
      updatedAt: now,
      revision: writerRevision(content)
    }
    const manifest: WriterProjectManifest = {
      ...project.manifest,
      updatedAt: now,
      activeChapterId: chapter.id,
      chapters: project.manifest.chapters.map((item) => (item.id === chapter.id ? savedChapter : item))
    }
    await atomicWriteProjectJson(paths.manifest, WriterProjectManifestSchema.parse(manifest))
    return { chapter: savedChapter, content }
  }

  async saveStoryBible(
    rootPath: string,
    storyBible: WriterStoryBible,
    expectedRevision: string
  ): Promise<WriterProject> {
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    this.assertRevision(expectedRevision, writerSemanticRevision(project.storyBible))
    const parsedStoryBible = parseStoryBibleForWrite(storyBible)
    await atomicWriteProjectJson(paths.storyBible, parsedStoryBible)
    return (await this.loadProjectDocuments(project.rootPath)).project
  }

  async saveOutline(rootPath: string, outline: WriterOutline, expectedRevision: string): Promise<WriterProject> {
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    this.assertRevision(expectedRevision, writerSemanticRevision(project.outline))
    await atomicWriteProjectJson(paths.outline, WriterOutlineSchema.parse(outline))
    return (await this.loadProjectDocuments(project.rootPath)).project
  }

  async saveContinuity(
    rootPath: string,
    continuity: WriterContinuityLedger,
    expectedRevision: string
  ): Promise<WriterProject> {
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    this.assertRevision(expectedRevision, writerSemanticRevision(project.continuity))
    await atomicWriteProjectJson(paths.continuity, WriterContinuityLedgerSchema.parse(continuity))
    return (await this.loadProjectDocuments(project.rootPath)).project
  }

  async readContinuityReview(rootPath: string): Promise<WriterContinuityReviewSnapshot> {
    const paths = await this.resolveProjectPaths(rootPath)
    return await this.readContinuityReviewFromPaths(paths)
  }

  async writeContinuityReview(
    rootPath: string,
    document: WriterContinuityReviewDocument,
    expectedRevision: WriterContinuityReviewRevision
  ): Promise<WriterContinuityReviewSnapshot> {
    const { paths } = await this.loadProjectDocuments(rootPath)
    const current = await this.readContinuityReviewFromPaths(paths)
    this.assertRevision(expectedRevision, current.revision)
    const parsed = WriterContinuityReviewDocumentSchema.safeParse(document)
    if (!parsed.success) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer continuity review is invalid', {
        cause: parsed.error.message
      })
    }
    await atomicWriteProjectJson(paths.continuityReview, parsed.data)
    return await this.readContinuityReviewFromPaths(paths)
  }

  async writeProposal(rootPath: string, proposal: WriterProposal): Promise<void> {
    requireEntityId(proposal.id, 'proposal')
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    if (project.manifest.id !== proposal.projectId) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal belongs to a different project')
    }
    this.findChapter(project.manifest, proposal.chapterId)
    const proposalPath = resolveContained(paths.proposals, `${proposal.id}.json`)
    if (await pathExists(proposalPath)) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal identifier already exists')
    }
    await atomicWriteProposalJson(proposalPath, WriterProposalSchema.parse(proposal))
  }

  async listProposals(
    rootPath: string,
    chapterId?: string,
    limit = DEFAULT_PROPOSAL_LIST_LIMIT
  ): Promise<WriterProposalSummary[]> {
    if (chapterId) requireEntityId(chapterId, 'chapter')
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    if (chapterId) this.findChapter(project.manifest, chapterId)
    const safeIds = await this.scanProposalIds(paths)
    const safeLimit = Math.min(MAX_PROPOSAL_LIST_LIMIT, Math.max(1, Math.floor(limit)))
    const newest: WriterProposal[] = []
    for (const proposalId of safeIds) {
      const proposal = await this.readProposalFromPaths(paths, proposalId)
      this.validateProposalForProject(project, proposal)
      if (chapterId && proposal.chapterId !== chapterId) continue
      newest.push(proposal)
      newest.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      if (newest.length > safeLimit) newest.pop()
    }
    return newest.map((proposal) => ({
      id: proposal.id,
      chapterId: proposal.chapterId,
      baseRevision: proposal.baseRevision,
      operation: proposal.operation,
      uniqueModelId: proposal.uniqueModelId,
      mode: proposal.mode,
      createdAt: proposal.createdAt,
      status: proposal.status,
      appliedRevision: proposal.appliedRevision
    }))
  }

  async readProposal(rootPath: string, proposalId: string): Promise<WriterProposal> {
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    const proposal = await this.readProposalFromPaths(paths, proposalId)
    this.validateProposalForProject(project, proposal)
    return proposal
  }

  async applyProposal(input: WriterProposalApplyInput): Promise<WriterChapterDocument> {
    const loaded = await this.loadProjectDocuments(input.rootPath)
    await this.recoverApplyingProposals(loaded.paths, loaded.project.manifest)
    const project = loaded.project
    const proposal = await this.readProposalFromPaths(loaded.paths, input.proposalId)
    this.validateProposalForProject(project, proposal)
    if (proposal.status === 'applied') {
      const current = await this.readChapterFromProject(project, proposal.chapterId)
      if (
        input.mode === proposal.appliedMode &&
        (input.expectedRevision === proposal.baseRevision || input.expectedRevision === proposal.appliedRevision) &&
        current.chapter.revision === proposal.appliedRevision
      ) {
        return current
      }
      throw new WriterStudioError(writerErrorCodes.PROPOSAL_ALREADY_APPLIED, 'Writer proposal was already applied')
    }
    if (proposal.status === 'applying') {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal application needs recovery')
    }
    if (!writerDocumentRevisionsEqual(proposal.contextPacket.documentRevisions, project.documentRevisions)) {
      throw new WriterStudioError(
        writerErrorCodes.REVISION_CONFLICT,
        'Writer structured documents changed after this proposal was generated',
        {
          expectedRevisions: proposal.contextPacket.documentRevisions,
          actualRevisions: project.documentRevisions
        }
      )
    }

    this.assertProposalModeAllowed(proposal.operation, input.mode)
    const current = await this.readChapterFromProject(project, proposal.chapterId)
    this.assertRevision(input.expectedRevision, current.chapter.revision)
    this.assertRevision(proposal.baseRevision, current.chapter.revision)
    const nextContent =
      input.mode === 'append' ? appendWithParagraphBreak(current.content, proposal.content) : proposal.content
    assertChapterContentWithinLimits(nextContent, writerErrorCodes.INVALID_PROPOSAL)
    const targetRevision = writerRevision(nextContent)
    const paths = projectPaths(project.rootPath)
    const proposalPath = resolveContained(paths.proposals, `${proposal.id}.json`)
    const applyingProposal = WriterProposalSchema.parse({
      ...proposal,
      status: 'applying',
      targetRevision,
      appliedMode: input.mode
    })
    await atomicWriteProposalJson(proposalPath, applyingProposal)
    await this.applyFaultHook?.('after-journal')

    const saved = await this.saveChapter(project.rootPath, proposal.chapterId, nextContent, current.chapter.revision, {
      forceHistorySnapshot: true
    })
    await this.applyFaultHook?.('after-content')

    const appliedProposal: WriterProposal = {
      ...applyingProposal,
      status: 'applied',
      appliedAt: this.now().toISOString(),
      appliedRevision: saved.chapter.revision
    }
    await atomicWriteProposalJson(proposalPath, WriterProposalSchema.parse(appliedProposal))
    return saved
  }

  async listHistory(
    rootPath: string,
    chapterId: string,
    limit = DEFAULT_HISTORY_LIST_LIMIT
  ): Promise<WriterHistorySummary[]> {
    requireEntityId(chapterId, 'chapter')
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    this.findChapter(project.manifest, chapterId)
    const directory = resolveContained(paths.history, chapterId)
    let entries: string[]
    try {
      await assertRealPathContained(paths.root, directory)
      entries = await readdir(directory)
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return []
      throw error
    }
    if (entries.length > MAX_HISTORY_DIRECTORY_ENTRIES) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer history directory has too many entries')
    }
    const safeLimit = Math.min(MAX_HISTORY_LIST_LIMIT, Math.max(1, Math.floor(limit)))
    const fileNames = entries
      .filter((fileName) => WriterHistoryFileNameSchema.safeParse(fileName).success)
      .sort()
      .reverse()
      .slice(0, safeLimit)
    const summaries: WriterHistorySummary[] = []
    for (const fileName of fileNames) {
      const snapshot = await this.readHistorySnapshotFromPaths(paths, chapterId, fileName)
      summaries.push({
        fileName: snapshot.fileName,
        createdAt: snapshot.createdAt,
        revision: snapshot.revision,
        characterCount: snapshot.characterCount
      })
    }
    return summaries
  }

  async readHistorySnapshot(rootPath: string, chapterId: string, fileName: string): Promise<WriterHistorySnapshot> {
    requireEntityId(chapterId, 'chapter')
    const parsedFileName = WriterHistoryFileNameSchema.safeParse(fileName)
    if (!parsedFileName.success) {
      throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, 'Invalid writer history snapshot file name')
    }
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    this.findChapter(project.manifest, chapterId)
    return await this.readHistorySnapshotFromPaths(paths, chapterId, parsedFileName.data)
  }

  async restoreHistorySnapshot(
    rootPath: string,
    chapterId: string,
    fileName: string,
    expectedRevision: string
  ): Promise<WriterChapterDocument> {
    const { project, paths } = await this.loadProjectDocuments(rootPath)
    const current = await this.readChapterFromProject(project, chapterId)
    this.assertRevision(expectedRevision, current.chapter.revision)
    const parsedFileName = WriterHistoryFileNameSchema.safeParse(fileName)
    if (!parsedFileName.success) {
      throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, 'Invalid writer history snapshot file name')
    }
    const snapshot = await this.readHistorySnapshotFromPaths(paths, chapterId, parsedFileName.data)
    return await this.saveChapter(project.rootPath, chapterId, snapshot.content, current.chapter.revision, {
      forceHistorySnapshot: true
    })
  }

  async readRecentHistory(rootPath: string, chapterId: string, limit = 2): Promise<WriterHistorySnapshot[]> {
    const summaries = await this.listHistory(rootPath, chapterId, limit)
    return await Promise.all(
      summaries.map((summary) => this.readHistorySnapshot(rootPath, chapterId, summary.fileName))
    )
  }

  private async readHistorySnapshotFromPaths(
    paths: WriterProjectPaths,
    chapterId: string,
    fileName: string
  ): Promise<WriterHistorySnapshot> {
    const directory = resolveContained(paths.history, chapterId)
    const snapshotPath = resolveContained(directory, fileName)
    if (!(await pathExists(snapshotPath))) {
      throw new WriterStudioError(writerErrorCodes.HISTORY_NOT_FOUND, 'Writer history snapshot not found')
    }
    await assertRealPathContained(paths.root, directory)
    await assertRealPathContained(paths.root, snapshotPath)
    try {
      const snapshotStat = await stat(snapshotPath)
      if (snapshotStat.size > MAX_CHAPTER_BYTES) {
        throw new WriterStudioError(
          writerErrorCodes.INVALID_PROJECT,
          'Writer history snapshot exceeds the safe read limit'
        )
      }
      const content = await readFile(snapshotPath, 'utf8')
      const parsed = WriterHistorySnapshotSchema.safeParse({
        fileName,
        createdAt: new Date(Number(fileName.slice(0, 13))).toISOString(),
        revision: writerRevision(content),
        characterCount: content.length,
        content
      })
      if (!parsed.success) {
        throw new WriterStudioError(writerErrorCodes.INVALID_PROJECT, 'Writer history snapshot violates its schema', {
          cause: parsed.error.message
        })
      }
      return parsed.data
    } catch (error) {
      if (isWriterStudioError(error)) throw error
      if (isErrno(error, 'ENOENT')) {
        throw new WriterStudioError(writerErrorCodes.HISTORY_NOT_FOUND, 'Writer history snapshot not found')
      }
      throw error
    }
  }

  private async scanProposalIds(paths: WriterProjectPaths): Promise<string[]> {
    const entries = await readdir(paths.proposals)
    if (entries.length > MAX_PROPOSAL_DIRECTORY_ENTRIES) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal directory has too many entries')
    }
    const safeIds = entries
      .map((fileName) => /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.json$/.exec(fileName)?.[1])
      .filter((id): id is string => Boolean(id))
    if (safeIds.length > MAX_PROPOSAL_SCAN_FILES) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal scan exceeds the safe file limit')
    }

    let scanBytes = 0
    for (const proposalId of safeIds) {
      const proposalPath = resolveContained(paths.proposals, `${proposalId}.json`)
      const proposalStat = await lstat(proposalPath)
      if (proposalStat.isSymbolicLink()) {
        throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, 'Writer proposal cannot be a symlink')
      }
      await assertRealPathContained(paths.root, proposalPath)
      if (!proposalStat.isFile() || proposalStat.size > MAX_PROPOSAL_JSON_BYTES) {
        throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal exceeds the safe read limit')
      }
      scanBytes += proposalStat.size
      if (scanBytes > MAX_PROPOSAL_SCAN_BYTES) {
        throw new WriterStudioError(
          writerErrorCodes.INVALID_PROPOSAL,
          'Writer proposal scan exceeds the safe byte limit'
        )
      }
    }
    return safeIds
  }

  private async readProposalFromPaths(paths: WriterProjectPaths, proposalId: string): Promise<WriterProposal> {
    requireEntityId(proposalId, 'proposal')
    const proposalPath = resolveContained(paths.proposals, `${proposalId}.json`)
    if (!(await pathExists(proposalPath))) {
      throw new WriterStudioError(writerErrorCodes.PROPOSAL_NOT_FOUND, 'Writer proposal not found')
    }
    await assertRealPathContained(paths.root, proposalPath)
    this.onProposalRead?.(proposalPath)
    return await readValidatedJson(
      proposalPath,
      WriterProposalSchema,
      writerErrorCodes.PROPOSAL_NOT_FOUND,
      writerErrorCodes.INVALID_PROPOSAL,
      MAX_PROPOSAL_JSON_BYTES
    )
  }

  private validateProposalForProject(project: WriterProject, proposal: WriterProposal): void {
    if (proposal.projectId !== project.manifest.id) {
      throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Writer proposal belongs to a different project')
    }
    this.findChapter(project.manifest, proposal.chapterId)
  }

  private async recoverApplyingProposals(paths: WriterProjectPaths, manifest: WriterProjectManifest): Promise<void> {
    const chapterById = new Map(manifest.chapters.map((chapter) => [chapter.id, chapter]))
    const revisionByChapterId = new Map<string, string>()
    for (const proposalId of await this.scanProposalIds(paths)) {
      const proposal = await this.readProposalFromPaths(paths, proposalId)
      if (proposal.status !== 'applying') continue
      if (proposal.projectId !== manifest.id) {
        throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Applying proposal belongs to another project')
      }
      const chapter = chapterById.get(proposal.chapterId)
      if (!chapter) {
        throw new WriterStudioError(writerErrorCodes.INVALID_PROPOSAL, 'Applying proposal chapter does not exist')
      }
      let currentRevision = revisionByChapterId.get(chapter.id)
      if (!currentRevision) {
        currentRevision = writerRevision(await this.readChapterContent(paths, chapter))
        revisionByChapterId.set(chapter.id, currentRevision)
      }

      let recovered: WriterProposal | undefined
      if (currentRevision === proposal.targetRevision) {
        recovered = WriterProposalSchema.parse({
          ...proposal,
          status: 'applied',
          appliedAt: this.now().toISOString(),
          appliedRevision: currentRevision
        })
      } else if (currentRevision === proposal.baseRevision) {
        recovered = WriterProposalSchema.parse({
          ...proposal,
          status: 'pending',
          targetRevision: undefined,
          appliedAt: undefined,
          appliedMode: undefined,
          appliedRevision: undefined
        })
      }
      if (recovered) {
        await atomicWriteProposalJson(resolveContained(paths.proposals, `${proposalId}.json`), recovered)
      }
    }
  }

  async resolveProjectRoot(rootPath: string): Promise<string> {
    if (!path.isAbsolute(rootPath)) {
      throw new WriterStudioError(writerErrorCodes.PATH_OUTSIDE_PROJECT, 'Writer project root must be an absolute path')
    }
    let root: string
    try {
      root = await realpath(path.resolve(rootPath))
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        throw new WriterStudioError(writerErrorCodes.PROJECT_NOT_FOUND, 'Writer project not found')
      }
      throw error
    }
    const paths = projectPaths(root)
    try {
      await Promise.all([
        assertRealPathContained(root, paths.metadata),
        assertRealPathContained(root, paths.manuscript),
        assertRealPathContained(root, paths.proposals),
        assertRealPathContained(root, paths.history)
      ])
      await Promise.all([
        assertRealPathContained(root, paths.manifest),
        assertRealPathContained(root, paths.storyBible),
        assertRealPathContained(root, paths.outline),
        assertRealPathContained(root, paths.continuity)
      ])
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        throw new WriterStudioError(writerErrorCodes.PROJECT_NOT_FOUND, 'Writer project files are incomplete')
      }
      throw error
    }
    return root
  }

  private async resolveProjectPaths(rootPath: string): Promise<WriterProjectPaths> {
    return projectPaths(await this.resolveProjectRoot(rootPath))
  }

  private async readChapterContent(paths: WriterProjectPaths, chapter: WriterChapterMetadata): Promise<string> {
    const { filePath } = await this.statChapterFile(paths, chapter)
    this.onManuscriptRead?.(filePath)
    const content = await readFile(filePath, 'utf8')
    assertChapterContentWithinLimits(content, writerErrorCodes.INVALID_PROJECT)
    return content
  }

  private async readContinuityReviewFromPaths(paths: WriterProjectPaths): Promise<WriterContinuityReviewSnapshot> {
    if (!(await pathExists(paths.continuityReview))) {
      return { revision: WRITER_MISSING_CONTINUITY_REVIEW_REVISION }
    }
    const fileStat = await lstat(paths.continuityReview)
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new WriterStudioError(
        writerErrorCodes.PATH_OUTSIDE_PROJECT,
        'Writer continuity review must be a regular project file'
      )
    }
    await assertRealPathContained(paths.root, paths.continuityReview)
    const document = await readValidatedJson(
      paths.continuityReview,
      WriterContinuityReviewDocumentSchema,
      writerErrorCodes.PROJECT_NOT_FOUND,
      writerErrorCodes.INVALID_PROJECT
    )
    return { document, revision: writerSemanticRevision(document) }
  }

  private findChapter(manifest: WriterProjectManifest, chapterId: string): WriterChapterMetadata {
    const chapter = manifest.chapters.find((item) => item.id === chapterId)
    if (!chapter) {
      throw new WriterStudioError(writerErrorCodes.CHAPTER_NOT_FOUND, 'Writer chapter not found')
    }
    return chapter
  }

  private assertRevision(expectedRevision: string, actualRevision: string): void {
    if (expectedRevision !== actualRevision) {
      throw new WriterStudioError(writerErrorCodes.REVISION_CONFLICT, 'Writer document revision conflict', {
        expectedRevision,
        actualRevision
      })
    }
  }

  private assertProposalModeAllowed(
    operation: WriterProposal['operation'],
    mode: WriterProposalApplyInput['mode']
  ): void {
    const allowed =
      (operation === 'continue' && mode === 'append') ||
      ((operation === 'draft' || operation === 'rewrite') && mode === 'replace')
    if (!allowed) {
      throw new WriterStudioError(
        writerErrorCodes.PROPOSAL_MODE_NOT_ALLOWED,
        `Writer ${operation} proposals cannot be applied with ${mode}`,
        { operation, mode }
      )
    }
  }

  private async maybeWriteHistorySnapshot(
    paths: WriterProjectPaths,
    chapter: WriterChapterMetadata,
    content: string,
    revision: string,
    force: boolean
  ): Promise<void> {
    const historyDirectory = resolveContained(paths.history, chapter.id)
    await mkdir(historyDirectory, { recursive: true })
    await assertRealPathContained(paths.root, historyDirectory)
    const entries = (await readdir(historyDirectory))
      .filter((entry) => /^\d{13}-[a-f0-9]{12}-[A-Za-z0-9-]+\.md$/.test(entry))
      .sort()
    const nowMs = this.now().getTime()
    const latestTimestamp = entries.length > 0 ? Number(entries.at(-1)?.slice(0, 13)) : Number.NaN
    if (!force && Number.isFinite(latestTimestamp) && nowMs - latestTimestamp < this.historySnapshotThrottleMs) {
      return
    }

    const snapshotName = `${String(nowMs).padStart(13, '0')}-${revision.slice(0, 12)}-${randomUUID()}.md`
    await assertRealPathContained(paths.root, historyDirectory)
    await atomicWriteFile(resolveContained(historyDirectory, snapshotName), content)
    const nextEntries = [...entries, snapshotName].sort()
    for (const obsolete of nextEntries.slice(0, Math.max(0, nextEntries.length - this.maxHistorySnapshotsPerChapter))) {
      await assertRealPathContained(paths.root, historyDirectory)
      await unlink(resolveContained(historyDirectory, obsolete)).catch((error) => {
        if (!isErrno(error, 'ENOENT')) throw error
      })
    }
  }
}

function appendWithParagraphBreak(current: string, proposal: string): string {
  if (current.length === 0 || proposal.length === 0) return `${current}${proposal}`
  const trailingNewlines = current.match(/\n+$/)?.[0].length ?? 0
  const leadingNewlines = proposal.match(/^\n+/)?.[0].length ?? 0
  const separator = '\n'.repeat(Math.max(0, 2 - trailingNewlines - leadingNewlines))
  return `${current}${separator}${proposal}`
}
