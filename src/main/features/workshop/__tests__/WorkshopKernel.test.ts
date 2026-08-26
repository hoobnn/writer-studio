import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { WorkshopChangeset, WorkshopEntity, WorkshopOrigin } from '@shared/types/workshop'
import { afterEach, describe, expect, it } from 'vitest'

import { workshopErrorCodes } from '../workshopErrors'
import { WorkshopKernel } from '../WorkshopKernel'

const HUMAN: WorkshopOrigin = { kind: 'human' }
const AI_WRITER: WorkshopOrigin = { kind: 'ai', role: 'writer' }

const roots: string[] = []
async function newRoot(): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-kernel-'))
  roots.push(parent)
  return path.join(parent, 'novel')
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function characterEntity(id: string, name: string, origin: WorkshopOrigin = HUMAN): WorkshopEntity {
  return {
    schemaVersion: 1,
    id,
    origin,
    updatedAt: new Date().toISOString(),
    data: { name }
  }
}

function characterWrite(id: string, name: string): WorkshopChangeset[number] {
  return { op: 'write_entity', collection: 'codex/characters', id, entity: characterEntity(id, name) }
}

async function createProject(): Promise<WorkshopKernel> {
  return WorkshopKernel.createProject(await newRoot(), { title: '测试小说' })
}

describe('WorkshopKernel 项目生命周期', () => {
  it('创建项目后可重新打开，项目卡与时间线一致', async () => {
    const kernel = await createProject()
    const reopened = await WorkshopKernel.open(kernel.rootPath)
    const card = await reopened.readProjectCard()
    expect(card.title).toBe('测试小说')

    const timeline = await reopened.timeline()
    expect(timeline).toHaveLength(1)
    expect(timeline[0].kind).toBe('init')
  })

  it('拒绝打开非项目目录', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'workshop-nonproject-'))
    roots.push(dir)
    await expect(WorkshopKernel.open(dir)).rejects.toMatchObject({ code: workshopErrorCodes.NOT_A_PROJECT })
  })

  it('拒绝在既有项目上重复创建', async () => {
    const kernel = await createProject()
    await expect(WorkshopKernel.createProject(kernel.rootPath, { title: '重复' })).rejects.toMatchObject({
      code: workshopErrorCodes.PROJECT_EXISTS
    })
  })
})

describe('WorkshopKernel 正史演进', () => {
  it('canon 提交后实体与章节可读，时间线记录来源', async () => {
    const kernel = await createProject()
    await kernel.commitCanon({
      title: '添加主角与第一章',
      origin: HUMAN,
      changes: [characterWrite('hero', '林远'), { op: 'write_chapter', chapterId: 'ch-001', content: '第一章正文。' }]
    })

    const hero = await kernel.readEntity<{ name: string }>('codex/characters', 'hero')
    expect(hero.data.name).toBe('林远')
    expect(await kernel.readChapter('ch-001')).toBe('第一章正文。')
    expect(await kernel.listChapterIds()).toEqual(['ch-001'])

    const timeline = await kernel.timeline()
    expect(timeline.map((entry) => entry.kind)).toEqual(['canon_edit', 'init'])
  })

  it('实体不符合集合 schema 时整个 changeset 被拒绝，正史不变', async () => {
    const kernel = await createProject()
    const before = await kernel.headCommit()
    const invalid: WorkshopChangeset = [
      {
        op: 'write_entity',
        collection: 'codex/characters',
        id: 'bad',
        entity: { ...characterEntity('bad', ''), data: {} }
      },
      { op: 'write_chapter', chapterId: 'ch-001', content: '不应落盘' }
    ]
    await expect(kernel.commitCanon({ title: '非法', origin: HUMAN, changes: invalid })).rejects.toMatchObject({
      code: workshopErrorCodes.INVALID_CHANGESET
    })
    expect(await kernel.headCommit()).toBe(before)
    await expect(kernel.readChapter('ch-001')).rejects.toMatchObject({ code: workshopErrorCodes.CHAPTER_NOT_FOUND })
  })

  it('同一 changeset 内重复文件被拒绝', async () => {
    const kernel = await createProject()
    await expect(
      kernel.commitCanon({
        title: '重复路径',
        origin: HUMAN,
        changes: [characterWrite('dup', '甲'), characterWrite('dup', '乙')]
      })
    ).rejects.toMatchObject({ code: workshopErrorCodes.INVALID_CHANGESET })
  })

  it('删除实体后文件消失且读取报错', async () => {
    const kernel = await createProject()
    await kernel.commitCanon({ title: '加人物', origin: HUMAN, changes: [characterWrite('temp', '临时')] })
    await kernel.commitCanon({
      title: '删人物',
      origin: HUMAN,
      changes: [{ op: 'delete_entity', collection: 'codex/characters', id: 'temp' }]
    })
    await expect(kernel.readEntity('codex/characters', 'temp')).rejects.toMatchObject({
      code: workshopErrorCodes.ENTITY_NOT_FOUND
    })
    expect(await kernel.listEntities('codex/characters')).toEqual([])
  })
})

describe('WorkshopKernel 提案生命周期', () => {
  it('创建提案不触碰正史；应用后正史与工作区同步演进', async () => {
    const kernel = await createProject()
    const headBefore = await kernel.headCommit()

    const proposal = await kernel.createProposal({
      title: '写第一章',
      origin: AI_WRITER,
      rationale: '按章计划推进',
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: 'AI 草稿正文。' }, characterWrite('hero', '林远')]
    })
    expect(proposal.status).toBe('pending')
    expect(proposal.stale).toBe(false)
    expect(await kernel.headCommit()).toBe(headBefore)
    await expect(kernel.readChapter('ch-001')).rejects.toMatchObject({ code: workshopErrorCodes.CHAPTER_NOT_FOUND })

    const applied = await kernel.applyProposal(proposal.id)
    expect(applied.kind).toBe('proposal_applied')
    expect(applied.origin).toEqual(AI_WRITER)
    expect(await kernel.readChapter('ch-001')).toBe('AI 草稿正文。')
    expect((await kernel.readProposal(proposal.id)).status).toBe('applied')
    expect((await kernel.readProposal(proposal.id)).appliedAt).toBeTruthy()
  })

  it('提案 diff 呈现 before/after', async () => {
    const kernel = await createProject()
    await kernel.commitCanon({
      title: '初稿',
      origin: HUMAN,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: '旧正文' }]
    })
    const proposal = await kernel.createProposal({
      title: '重写',
      origin: AI_WRITER,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: '新正文' }]
    })
    const changes = await kernel.readProposalChanges(proposal.id)
    expect(changes).toEqual([{ filepath: 'manuscript/ch-001.md', before: '旧正文', after: '新正文' }])
  })

  it('正史前进后提案变 stale 且拒绝应用', async () => {
    const kernel = await createProject()
    const proposal = await kernel.createProposal({
      title: '过期提案',
      origin: AI_WRITER,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: 'x' }]
    })
    await kernel.commitCanon({ title: '插入的人工编辑', origin: HUMAN, changes: [characterWrite('other', '旁人')] })

    expect((await kernel.readProposal(proposal.id)).stale).toBe(true)
    await expect(kernel.applyProposal(proposal.id)).rejects.toMatchObject({ code: workshopErrorCodes.PROPOSAL_STALE })
    expect((await kernel.readProposal(proposal.id)).status).toBe('pending')
  })

  it('驳回后提案不可再应用，列表按状态归档', async () => {
    const kernel = await createProject()
    const proposal = await kernel.createProposal({
      title: '被驳回',
      origin: AI_WRITER,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: 'x' }]
    })
    await kernel.rejectProposal(proposal.id)
    expect((await kernel.readProposal(proposal.id)).status).toBe('rejected')
    await expect(kernel.applyProposal(proposal.id)).rejects.toMatchObject({
      code: workshopErrorCodes.PROPOSAL_NOT_PENDING
    })
    const list = await kernel.listProposals()
    expect(list.map((p) => p.status)).toEqual(['rejected'])
  })
})

describe('WorkshopKernel 回溯', () => {
  it('前进式回滚：正文与实体同步回到目标点，历史只增不删', async () => {
    const kernel = await createProject()
    const first = await kernel.commitCanon({
      title: '第一版',
      origin: HUMAN,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: '第一版正文' }, characterWrite('hero', '林远')]
    })
    await kernel.commitCanon({
      title: '第二版',
      origin: HUMAN,
      changes: [
        { op: 'write_chapter', chapterId: 'ch-001', content: '第二版正文' },
        characterWrite('hero', '改名后的林远'),
        characterWrite('villain', '反派')
      ]
    })

    const rollback = await kernel.rollbackTo(first.commit)
    expect(rollback.kind).toBe('rollback')
    expect(await kernel.readChapter('ch-001')).toBe('第一版正文')
    const hero = await kernel.readEntity<{ name: string }>('codex/characters', 'hero')
    expect(hero.data.name).toBe('林远')
    await expect(kernel.readEntity('codex/characters', 'villain')).rejects.toMatchObject({
      code: workshopErrorCodes.ENTITY_NOT_FOUND
    })

    const timeline = await kernel.timeline()
    expect(timeline.map((entry) => entry.kind)).toEqual(['rollback', 'canon_edit', 'canon_edit', 'init'])
  })

  it('拒绝回滚到不在正史历史中的 commit', async () => {
    const kernel = await createProject()
    const proposal = await kernel.createProposal({
      title: '未应用提案',
      origin: AI_WRITER,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: 'x' }]
    })
    await expect(kernel.rollbackTo(proposal.commit)).rejects.toMatchObject({
      code: workshopErrorCodes.ROLLBACK_TARGET_INVALID
    })
  })
})

describe('WorkshopKernel 崩溃恢复', () => {
  it('存在 journal 时，open() 把清单内文件恢复为正史 HEAD 内容', async () => {
    const kernel = await createProject()
    await kernel.commitCanon({
      title: '正式内容',
      origin: HUMAN,
      changes: [{ op: 'write_chapter', chapterId: 'ch-001', content: '正史正文' }]
    })

    // 模拟崩溃：journal 残留 + 工作区被半途写坏
    const chapterPath = path.join(kernel.rootPath, 'manuscript', 'ch-001.md')
    await writeFile(chapterPath, '写到一半的脏内容')
    await writeFile(
      path.join(kernel.rootPath, '.git', 'workshop-journal.json'),
      JSON.stringify({ headOid: await kernel.headCommit(), filepaths: ['manuscript/ch-001.md'] })
    )

    const reopened = await WorkshopKernel.open(kernel.rootPath)
    expect(await reopened.readChapter('ch-001')).toBe('正史正文')
    expect(await readFile(chapterPath, 'utf8')).toBe('正史正文')
  })
})
