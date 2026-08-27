import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import {
  WORKSHOP_MANUSCRIPT_DIR,
  WORKSHOP_PROJECT_FILE,
  WORKSHOP_SCHEMA_VERSION,
  type WorkshopChange,
  workshopChangeFilepath,
  type WorkshopChangeset,
  WorkshopChangesetSchema,
  workshopChapterFilepath,
  type WorkshopCollection,
  type WorkshopEntity,
  workshopEntityFilepath,
  workshopEntitySchemaFor,
  type WorkshopOrigin,
  WorkshopOriginSchema,
  type WorkshopProjectCard,
  WorkshopProjectCardSchema,
  type WorkshopProposal,
  type WorkshopProposalMetadata,
  WorkshopProposalMetadataSchema,
  type WorkshopTimelineEntry
} from '@shared/types/workshop'
import git from 'isomorphic-git'
import * as z from 'zod'

import { WorkshopError, workshopErrorCodes } from './workshopErrors'

const logger = loggerService.withContext('workshopKernel')

const CANON_REF = 'refs/heads/main'
const PROPOSAL_REF_PREFIX = 'refs/workshop/proposals'
const APPLIED_REF_PREFIX = 'refs/workshop/applied'
const REJECTED_REF_PREFIX = 'refs/workshop/rejected'
const JOURNAL_FILE = 'workshop-journal.json'
const PROPOSAL_SIDECAR_DIR = 'workshop-proposals'
const GIT_AUTHOR = { name: 'Writer Studio Workshop', email: 'workshop@writer-studio.local' }
const COMMIT_META_MARKER = '--workshop-meta--'

/** commit message 内嵌的结构化元数据（标题行之后、marker 之下的 JSON 块）。 */
const CommitMetaSchema = z.strictObject({
  v: z.literal(WORKSHOP_SCHEMA_VERSION),
  kind: z.enum(['init', 'canon_edit', 'proposal', 'rollback']),
  origin: WorkshopOriginSchema,
  proposal: WorkshopProposalMetadataSchema.optional(),
  rollbackOf: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional()
})
type CommitMeta = z.infer<typeof CommitMetaSchema>

const ProposalSidecarSchema = z.strictObject({
  appliedAt: z.string().datetime().optional(),
  rejectedAt: z.string().datetime().optional()
})

interface JournalEntry {
  headOid: string
  filepaths: string[]
}

function buildCommitMessage(title: string, meta: CommitMeta): string {
  return `${title}\n\n${COMMIT_META_MARKER}\n${JSON.stringify(CommitMetaSchema.parse(meta))}\n`
}

function parseCommitMessage(message: string): { title: string; meta: CommitMeta | null } {
  const title = message.split('\n', 1)[0] ?? ''
  const markerIndex = message.indexOf(COMMIT_META_MARKER)
  if (markerIndex < 0) return { title, meta: null }
  try {
    const raw = JSON.parse(message.slice(markerIndex + COMMIT_META_MARKER.length))
    return { title, meta: CommitMetaSchema.parse(raw) }
  } catch {
    return { title, meta: null }
  }
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target)
    return true
  } catch {
    return false
  }
}

/**
 * 小说工坊项目内核：git 化事实源之上的原子操作层。
 *
 * 职责边界：
 * - 正史（refs/heads/main）只经 commitCanon / applyProposal / rollbackTo 三个入口演进，
 *   每次演进都是一个完整 commit；工作区永远是正史 HEAD 的物化镜像。
 * - 提案是 refs/workshop/proposals/<id> 上以正史某 commit 为 parent 的 commit，
 *   应用即 fast-forward；状态由 ref 命名空间承载（proposals/applied/rejected）。
 * - 提交一律走"直写对象库"（writeBlob + 重建 tree），不使用 git 索引与工作区扫描。
 * - 崩溃安全：工作区变更前写 journal（精确文件清单），open() 时按 journal 从 HEAD 恢复。
 *
 * 并发约束：实例方法之间不做互斥，调用方（服务层）必须以项目为粒度串行化。
 */
export class WorkshopKernel {
  private constructor(readonly rootPath: string) {}

  private get gitDir(): string {
    return path.join(this.rootPath, '.git')
  }

  static async createProject(
    parentOrRoot: string,
    init: {
      title: string
      id?: string
      genre?: string
      premise?: string
      authorGoal?: string
      targetWordCount?: number
    }
  ): Promise<WorkshopKernel> {
    const rootPath = path.resolve(parentOrRoot)
    if (await pathExists(path.join(rootPath, '.git'))) {
      throw new WorkshopError(workshopErrorCodes.PROJECT_EXISTS, 'Workshop project already exists', { rootPath })
    }
    await fs.promises.mkdir(rootPath, { recursive: true })
    await git.init({ fs, dir: rootPath, defaultBranch: 'main' })

    const kernel = new WorkshopKernel(rootPath)
    const card: WorkshopProjectCard = WorkshopProjectCardSchema.parse({
      schemaVersion: WORKSHOP_SCHEMA_VERSION,
      id: init.id ?? randomUUID(),
      title: init.title,
      genre: init.genre ?? '',
      premise: init.premise ?? '',
      authorGoal: init.authorGoal ?? '',
      targetWordCount: init.targetWordCount,
      volumeOrder: [],
      looseChapterIds: [],
      createdAt: new Date().toISOString()
    })
    const changes: WorkshopChangeset = [{ op: 'write_project', card }]
    await kernel.commitChanges({
      title: `创建项目《${init.title}》`,
      meta: { v: WORKSHOP_SCHEMA_VERSION, kind: 'init', origin: { kind: 'human' } },
      changes,
      parent: null
    })
    logger.info('workshop project created', { rootPath })
    return kernel
  }

  static async open(rootPath: string): Promise<WorkshopKernel> {
    const resolved = path.resolve(rootPath)
    const kernel = new WorkshopKernel(resolved)
    if (!(await pathExists(kernel.gitDir))) {
      throw new WorkshopError(workshopErrorCodes.NOT_A_PROJECT, 'Not a workshop project (missing repository)', {
        rootPath: resolved
      })
    }
    try {
      await kernel.headCommit()
    } catch {
      throw new WorkshopError(workshopErrorCodes.NOT_A_PROJECT, 'Not a workshop project (missing canon branch)', {
        rootPath: resolved
      })
    }
    await kernel.recoverFromJournal()
    await kernel.readProjectCard()
    return kernel
  }

  // -------------------------------------------------------------------------
  // 读取（一律走工作区镜像；open() 保证其与正史一致）
  // -------------------------------------------------------------------------

  async headCommit(): Promise<string> {
    return git.resolveRef({ fs, dir: this.rootPath, ref: CANON_REF })
  }

  private async readWorkdirFile(filepath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(this.assertContained(filepath), 'utf8')
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return null
      throw error
    }
  }

  async readProjectCard(): Promise<WorkshopProjectCard> {
    const raw = await this.readWorkdirFile(WORKSHOP_PROJECT_FILE)
    if (raw === null) {
      throw new WorkshopError(workshopErrorCodes.NOT_A_PROJECT, 'Workshop project card is missing', {
        rootPath: this.rootPath
      })
    }
    return WorkshopProjectCardSchema.parse(JSON.parse(raw))
  }

  async readEntity<TData = unknown>(collection: WorkshopCollection, id: string): Promise<WorkshopEntity<TData>> {
    const raw = await this.readWorkdirFile(workshopEntityFilepath(collection, id))
    if (raw === null) {
      throw new WorkshopError(workshopErrorCodes.ENTITY_NOT_FOUND, 'Workshop entity not found', { collection, id })
    }
    return workshopEntitySchemaFor(collection).parse(JSON.parse(raw)) as WorkshopEntity<TData>
  }

  async listEntities<TData = unknown>(collection: WorkshopCollection): Promise<WorkshopEntity<TData>[]> {
    const dir = path.join(this.rootPath, collection)
    let names: string[]
    try {
      names = await fs.promises.readdir(dir)
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return []
      throw error
    }
    const entities: WorkshopEntity<TData>[] = []
    for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
      entities.push(await this.readEntity<TData>(collection, name.slice(0, -'.json'.length)))
    }
    return entities
  }

  async readChapter(chapterId: string): Promise<string> {
    const raw = await this.readWorkdirFile(workshopChapterFilepath(chapterId))
    if (raw === null) {
      throw new WorkshopError(workshopErrorCodes.CHAPTER_NOT_FOUND, 'Workshop chapter not found', { chapterId })
    }
    return raw
  }

  async listChapterIds(): Promise<string[]> {
    const dir = path.join(this.rootPath, WORKSHOP_MANUSCRIPT_DIR)
    try {
      const names = await fs.promises.readdir(dir)
      return names
        .filter((n) => n.endsWith('.md'))
        .map((n) => n.slice(0, -'.md'.length))
        .sort()
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return []
      throw error
    }
  }

  // -------------------------------------------------------------------------
  // 正史演进
  // -------------------------------------------------------------------------

  async commitCanon(input: {
    title: string
    origin: WorkshopOrigin
    changes: WorkshopChangeset
  }): Promise<WorkshopTimelineEntry> {
    const changes = this.validateChangeset(input.changes)
    const head = await this.headCommit()
    const oid = await this.commitChanges({
      title: input.title,
      meta: { v: WORKSHOP_SCHEMA_VERSION, kind: 'canon_edit', origin: input.origin },
      changes,
      parent: head
    })
    return this.timelineEntryFor(oid)
  }

  async rollbackTo(targetCommit: string): Promise<WorkshopTimelineEntry> {
    const head = await this.headCommit()
    const reachable =
      targetCommit === head || (await git.isDescendent({ fs, dir: this.rootPath, oid: head, ancestor: targetCommit }))
    if (!reachable) {
      throw new WorkshopError(workshopErrorCodes.ROLLBACK_TARGET_INVALID, 'Rollback target is not in canon history', {
        targetCommit
      })
    }
    const target = await git.readCommit({ fs, dir: this.rootPath, oid: targetCommit })
    const { title } = parseCommitMessage(target.commit.message)
    // 前进式回滚：以目标 commit 的 tree 新建一个 commit，历史只增不删。
    const oid = await git.commit({
      fs,
      dir: this.rootPath,
      message: buildCommitMessage(`回滚到「${title}」`, {
        v: WORKSHOP_SCHEMA_VERSION,
        kind: 'rollback',
        origin: { kind: 'human' },
        rollbackOf: targetCommit
      }),
      tree: target.commit.tree,
      parent: [head],
      author: { ...GIT_AUTHOR },
      noUpdateBranch: true
    })
    await this.advanceCanon(head, oid)
    logger.info('workshop canon rolled back', { targetCommit })
    return this.timelineEntryFor(oid)
  }

  async timeline(limit = 100): Promise<WorkshopTimelineEntry[]> {
    const entries = await git.log({ fs, dir: this.rootPath, ref: CANON_REF, depth: limit })
    return entries.map((entry) => this.timelineEntryFromCommit(entry.oid, entry.commit))
  }

  // -------------------------------------------------------------------------
  // 提案生命周期
  // -------------------------------------------------------------------------

  async createProposal(input: {
    title: string
    origin: WorkshopOrigin
    changes: WorkshopChangeset
    rationale?: string
    id?: string
  }): Promise<WorkshopProposal> {
    const changes = this.validateChangeset(input.changes)
    const id = input.id ?? randomUUID()
    if (await this.proposalExists(id)) {
      throw new WorkshopError(workshopErrorCodes.PROPOSAL_EXISTS, 'Proposal id already exists', { id })
    }
    const metadata: WorkshopProposalMetadata = WorkshopProposalMetadataSchema.parse({
      id,
      title: input.title,
      rationale: input.rationale ?? '',
      origin: input.origin,
      createdAt: new Date().toISOString()
    })
    const base = await this.headCommit()
    const oid = await this.writeChangesCommit({
      title: input.title,
      meta: { v: WORKSHOP_SCHEMA_VERSION, kind: 'proposal', origin: input.origin, proposal: metadata },
      changes,
      parent: base
    })
    await git.writeRef({ fs, dir: this.rootPath, ref: `${PROPOSAL_REF_PREFIX}/${id}`, value: oid, force: true })
    logger.info('workshop proposal created', { id })
    return this.readProposal(id)
  }

  async proposalExists(id: string): Promise<boolean> {
    try {
      await this.locateProposal(id)
      return true
    } catch {
      return false
    }
  }

  async listProposals(): Promise<WorkshopProposal[]> {
    const ids = new Set<string>()
    for (const prefix of [PROPOSAL_REF_PREFIX, APPLIED_REF_PREFIX, REJECTED_REF_PREFIX]) {
      for (const id of await this.listRefIds(prefix)) ids.add(id)
    }
    const proposals: WorkshopProposal[] = []
    for (const id of [...ids]) proposals.push(await this.readProposal(id))
    proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    return proposals
  }

  async readProposal(id: string): Promise<WorkshopProposal> {
    const located = await this.locateProposal(id)
    const { commit } = await git.readCommit({ fs, dir: this.rootPath, oid: located.oid })
    const { meta } = parseCommitMessage(commit.message)
    if (!meta || meta.kind !== 'proposal' || !meta.proposal) {
      throw new WorkshopError(workshopErrorCodes.PROPOSAL_NOT_FOUND, 'Proposal commit is malformed', { id })
    }
    const baseCommit = commit.parent[0]
    const head = await this.headCommit()
    const sidecar = await this.readProposalSidecar(id)
    return {
      ...meta.proposal,
      baseCommit,
      commit: located.oid,
      status: located.status,
      stale: located.status === 'pending' && baseCommit !== head,
      appliedAt: sidecar?.appliedAt,
      appliedCommit: located.status === 'applied' ? located.oid : undefined
    }
  }

  /** 提案的文件级 diff（before 取自 base commit，after 取自提案 commit）。 */
  async readProposalChanges(id: string): Promise<{ filepath: string; before: string | null; after: string | null }[]> {
    const proposal = await this.readProposal(id)
    return this.diffCommits(proposal.baseCommit, proposal.commit)
  }

  async applyProposal(id: string): Promise<WorkshopTimelineEntry> {
    const proposal = await this.readProposal(id)
    if (proposal.status !== 'pending') {
      throw new WorkshopError(workshopErrorCodes.PROPOSAL_NOT_PENDING, 'Proposal is not pending', {
        id,
        status: proposal.status
      })
    }
    const head = await this.headCommit()
    if (proposal.baseCommit !== head) {
      throw new WorkshopError(workshopErrorCodes.PROPOSAL_STALE, 'Proposal base is behind canon head', {
        id,
        baseCommit: proposal.baseCommit,
        head
      })
    }
    await this.advanceCanon(head, proposal.commit)
    await git.writeRef({
      fs,
      dir: this.rootPath,
      ref: `${APPLIED_REF_PREFIX}/${id}`,
      value: proposal.commit,
      force: true
    })
    await git.deleteRef({ fs, dir: this.rootPath, ref: `${PROPOSAL_REF_PREFIX}/${id}` })
    await this.writeProposalSidecar(id, { appliedAt: new Date().toISOString() })
    logger.info('workshop proposal applied', { id })
    return this.timelineEntryFor(proposal.commit)
  }

  async rejectProposal(id: string): Promise<void> {
    const proposal = await this.readProposal(id)
    if (proposal.status !== 'pending') {
      throw new WorkshopError(workshopErrorCodes.PROPOSAL_NOT_PENDING, 'Proposal is not pending', {
        id,
        status: proposal.status
      })
    }
    await git.writeRef({
      fs,
      dir: this.rootPath,
      ref: `${REJECTED_REF_PREFIX}/${id}`,
      value: proposal.commit,
      force: true
    })
    await git.deleteRef({ fs, dir: this.rootPath, ref: `${PROPOSAL_REF_PREFIX}/${id}` })
    await this.writeProposalSidecar(id, { rejectedAt: new Date().toISOString() })
  }

  // -------------------------------------------------------------------------
  // 内部：提交与工作区同步
  // -------------------------------------------------------------------------

  private validateChangeset(changes: WorkshopChangeset): WorkshopChangeset {
    const parsed = WorkshopChangesetSchema.parse(changes)
    const seen = new Set<string>()
    for (const change of parsed) {
      const filepath = workshopChangeFilepath(change)
      if (seen.has(filepath)) {
        throw new WorkshopError(workshopErrorCodes.INVALID_CHANGESET, 'Changeset touches the same file twice', {
          filepath
        })
      }
      seen.add(filepath)
      if (change.op === 'write_entity') {
        if (change.entity.id !== change.id) {
          throw new WorkshopError(workshopErrorCodes.INVALID_CHANGESET, 'Entity id does not match change id', {
            changeId: change.id,
            entityId: change.entity.id
          })
        }
        const result = workshopEntitySchemaFor(change.collection).safeParse(change.entity)
        if (!result.success) {
          throw new WorkshopError(workshopErrorCodes.INVALID_CHANGESET, 'Entity does not match collection schema', {
            collection: change.collection,
            id: change.id,
            issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          })
        }
      }
    }
    return parsed
  }

  private changeContent(change: WorkshopChange): string | null {
    switch (change.op) {
      case 'write_entity':
        return `${JSON.stringify(workshopEntitySchemaFor(change.collection).parse(change.entity), null, 2)}\n`
      case 'write_chapter':
        return change.content
      case 'write_project':
        return `${JSON.stringify(WorkshopProjectCardSchema.parse(change.card), null, 2)}\n`
      case 'delete_entity':
      case 'delete_chapter':
        return null
    }
  }

  /** 直写对象库构建 commit（不触碰任何 ref、索引与工作区）。 */
  private async writeChangesCommit(input: {
    title: string
    meta: CommitMeta
    changes: WorkshopChangeset
    parent: string | null
  }): Promise<string> {
    const fileChanges = new Map<string, string | null>()
    for (const change of input.changes) fileChanges.set(workshopChangeFilepath(change), this.changeContent(change))

    let baseTree: string | null = null
    if (input.parent) {
      const parentCommit = await git.readCommit({ fs, dir: this.rootPath, oid: input.parent })
      baseTree = parentCommit.commit.tree
    }
    const tree = await this.writeTreeWithChanges(baseTree, fileChanges)
    return git.commit({
      fs,
      dir: this.rootPath,
      message: buildCommitMessage(input.title, input.meta),
      tree,
      parent: input.parent ? [input.parent] : [],
      author: { ...GIT_AUTHOR },
      noUpdateBranch: true
    })
  }

  /** 构建 commit 并推进正史 + 物化工作区（带 journal 崩溃保护）。 */
  private async commitChanges(input: {
    title: string
    meta: CommitMeta
    changes: WorkshopChangeset
    parent: string | null
  }): Promise<string> {
    const oid = await this.writeChangesCommit(input)
    const filepaths = input.changes.map(workshopChangeFilepath)
    await this.writeJournal({ headOid: oid, filepaths })
    await git.writeRef({ fs, dir: this.rootPath, ref: CANON_REF, value: oid, force: true })
    await this.materializeFiles(oid, filepaths)
    await this.clearJournal()
    return oid
  }

  /** fast-forward 推进正史到既有 commit，并按两树 diff 物化工作区。 */
  private async advanceCanon(fromOid: string, toOid: string): Promise<void> {
    const changed = await this.diffCommits(fromOid, toOid)
    const filepaths = changed.map((c) => c.filepath)
    await this.writeJournal({ headOid: toOid, filepaths })
    await git.writeRef({ fs, dir: this.rootPath, ref: CANON_REF, value: toOid, force: true })
    await this.materializeFiles(toOid, filepaths)
    await this.clearJournal()
  }

  /** 把指定文件恢复为某 commit 的内容（不存在则删除）。 */
  private async materializeFiles(commitOid: string, filepaths: string[]): Promise<void> {
    for (const filepath of filepaths) {
      const absolute = this.assertContained(filepath)
      let content: Uint8Array | null = null
      try {
        const { blob } = await git.readBlob({ fs, dir: this.rootPath, oid: commitOid, filepath })
        content = blob
      } catch {
        content = null
      }
      if (content === null) {
        await fs.promises.rm(absolute, { force: true })
      } else {
        await fs.promises.mkdir(path.dirname(absolute), { recursive: true })
        await fs.promises.writeFile(absolute, content)
      }
    }
  }

  /** 在 base tree 上应用文件变更并写出新 tree（递归、按需重建路径上的子树）。 */
  private async writeTreeWithChanges(baseTreeOid: string | null, changes: Map<string, string | null>): Promise<string> {
    const byChild = new Map<string, Map<string, string | null>>()
    const blobsHere = new Map<string, string | null>()
    for (const [filepath, content] of changes) {
      const slash = filepath.indexOf('/')
      if (slash < 0) {
        blobsHere.set(filepath, content)
      } else {
        const head = filepath.slice(0, slash)
        const rest = filepath.slice(slash + 1)
        if (!byChild.has(head)) byChild.set(head, new Map())
        byChild.get(head)!.set(rest, content)
      }
    }

    const entries = new Map<string, { mode: string; path: string; oid: string; type: 'blob' | 'tree' | 'commit' }>()
    if (baseTreeOid) {
      const { tree } = await git.readTree({ fs, dir: this.rootPath, oid: baseTreeOid })
      for (const entry of tree) entries.set(entry.path, entry)
    }
    for (const [name, content] of blobsHere) {
      if (content === null) {
        entries.delete(name)
      } else {
        const oid = await git.writeBlob({ fs, dir: this.rootPath, blob: new TextEncoder().encode(content) })
        entries.set(name, { mode: '100644', path: name, oid, type: 'blob' })
      }
    }
    for (const [name, childChanges] of byChild) {
      const existing = entries.get(name)
      const childBase = existing && existing.type === 'tree' ? existing.oid : null
      const childOid = await this.writeTreeWithChanges(childBase, childChanges)
      const { tree } = await git.readTree({ fs, dir: this.rootPath, oid: childOid })
      if (tree.length === 0) {
        entries.delete(name)
      } else {
        entries.set(name, { mode: '040000', path: name, oid: childOid, type: 'tree' })
      }
    }
    return git.writeTree({ fs, dir: this.rootPath, tree: [...entries.values()] })
  }

  private async diffCommits(
    fromOid: string,
    toOid: string
  ): Promise<{ filepath: string; before: string | null; after: string | null }[]> {
    const decoder = new TextDecoder()
    const changed: { filepath: string; before: string | null; after: string | null }[] = []
    await git.walk({
      fs,
      dir: this.rootPath,
      trees: [git.TREE({ ref: fromOid }), git.TREE({ ref: toOid })],
      map: async (filepath, [before, after]) => {
        if (filepath === '.') return
        const [beforeType, afterType] = await Promise.all([before?.type(), after?.type()])
        if (beforeType === 'tree' || afterType === 'tree') return
        const [beforeOid, afterOid] = await Promise.all([before?.oid(), after?.oid()])
        if (beforeOid === afterOid) return
        const [beforeContent, afterContent] = await Promise.all([before?.content(), after?.content()])
        changed.push({
          filepath,
          before: beforeContent ? decoder.decode(beforeContent) : null,
          after: afterContent ? decoder.decode(afterContent) : null
        })
      }
    })
    return changed
  }

  // -------------------------------------------------------------------------
  // 内部：journal、ref 枚举、时间线
  // -------------------------------------------------------------------------

  private get journalPath(): string {
    return path.join(this.gitDir, JOURNAL_FILE)
  }

  private async writeJournal(entry: JournalEntry): Promise<void> {
    await fs.promises.writeFile(this.journalPath, JSON.stringify(entry))
  }

  private async clearJournal(): Promise<void> {
    await fs.promises.rm(this.journalPath, { force: true })
  }

  private async recoverFromJournal(): Promise<void> {
    let raw: string
    try {
      raw = await fs.promises.readFile(this.journalPath, 'utf8')
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return
      throw error
    }
    const entry = JSON.parse(raw) as JournalEntry
    const head = await this.headCommit()
    logger.warn('workshop journal found, restoring workdir from canon head', { files: entry.filepaths.length })
    await this.materializeFiles(head, entry.filepaths)
    await this.clearJournal()
  }

  private async listRefIds(prefix: string): Promise<string[]> {
    // isomorphic-git 的 writeRef 写 loose ref 且不打包，目录枚举即可靠。
    const dir = path.join(this.gitDir, prefix)
    try {
      const names = await fs.promises.readdir(dir)
      return names.sort()
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return []
      throw error
    }
  }

  private async locateProposal(id: string): Promise<{ oid: string; status: WorkshopProposal['status'] }> {
    const namespaces = [
      { prefix: PROPOSAL_REF_PREFIX, status: 'pending' as const },
      { prefix: APPLIED_REF_PREFIX, status: 'applied' as const },
      { prefix: REJECTED_REF_PREFIX, status: 'rejected' as const }
    ]
    for (const { prefix, status } of namespaces) {
      try {
        const oid = await git.resolveRef({ fs, dir: this.rootPath, ref: `${prefix}/${id}` })
        return { oid, status }
      } catch {
        // 该命名空间没有此提案，继续找。
      }
    }
    throw new WorkshopError(workshopErrorCodes.PROPOSAL_NOT_FOUND, 'Proposal not found', { id })
  }

  private get proposalSidecarDir(): string {
    return path.join(this.gitDir, PROPOSAL_SIDECAR_DIR)
  }

  private async readProposalSidecar(id: string): Promise<z.infer<typeof ProposalSidecarSchema> | null> {
    try {
      const raw = await fs.promises.readFile(path.join(this.proposalSidecarDir, `${id}.json`), 'utf8')
      return ProposalSidecarSchema.parse(JSON.parse(raw))
    } catch {
      return null
    }
  }

  private async writeProposalSidecar(id: string, patch: z.infer<typeof ProposalSidecarSchema>): Promise<void> {
    await fs.promises.mkdir(this.proposalSidecarDir, { recursive: true })
    const existing = (await this.readProposalSidecar(id)) ?? {}
    await fs.promises.writeFile(
      path.join(this.proposalSidecarDir, `${id}.json`),
      JSON.stringify(ProposalSidecarSchema.parse({ ...existing, ...patch }))
    )
  }

  private async timelineEntryFor(oid: string): Promise<WorkshopTimelineEntry> {
    const { commit } = await git.readCommit({ fs, dir: this.rootPath, oid })
    return this.timelineEntryFromCommit(oid, commit)
  }

  private timelineEntryFromCommit(
    oid: string,
    commit: { message: string; author: { timestamp: number } }
  ): WorkshopTimelineEntry {
    const { title, meta } = parseCommitMessage(commit.message)
    const kind =
      meta?.kind === 'init'
        ? 'init'
        : meta?.kind === 'proposal'
          ? 'proposal_applied'
          : meta?.kind === 'rollback'
            ? 'rollback'
            : 'canon_edit'
    return {
      commit: oid,
      kind,
      title,
      origin: meta?.origin ?? { kind: 'human' },
      proposalId: meta?.proposal?.id,
      timestamp: new Date(commit.author.timestamp * 1000).toISOString()
    }
  }

  private assertContained(filepath: string): string {
    const absolute = path.resolve(this.rootPath, filepath)
    if (absolute !== this.rootPath && !absolute.startsWith(this.rootPath + path.sep)) {
      throw new WorkshopError(workshopErrorCodes.INVALID_CHANGESET, 'Path escapes the project root', { filepath })
    }
    return absolute
  }
}
