import { describe, expect, it } from 'vitest'

import {
  buildPlannerChangeset,
  buildWriterChangeset,
  WorkshopPlannerOutputSchema,
  WorkshopWriterOutputSchema
} from '../workshopAgentOutput'

const mapping = { proposalId: 'job-1', role: 'planner' as const, now: '2026-08-27T00:00:00.000Z' }

describe('WorkshopPlannerOutputSchema', () => {
  it('接受合法的实体写入并拒绝集合与字段不匹配的实体', () => {
    const valid = WorkshopPlannerOutputSchema.safeParse({
      title: '主角设定',
      entities: [{ collection: 'codex/characters', id: 'lin-yuan', data: { name: '林远' } }]
    })
    expect(valid.success).toBe(true)

    const invalid = WorkshopPlannerOutputSchema.safeParse({
      title: '错误',
      entities: [{ collection: 'codex/characters', id: 'x', data: { title: '不是人物字段' } }]
    })
    expect(invalid.success).toBe(false)
  })
})

describe('buildPlannerChangeset', () => {
  it('补齐 AI 溯源信封,同实体取最后一次写入,删除优先于写入', () => {
    const output = WorkshopPlannerOutputSchema.parse({
      title: '设定修订',
      entities: [
        { collection: 'codex/characters', id: 'a', data: { name: '旧名' } },
        { collection: 'codex/characters', id: 'a', data: { name: '新名' } },
        { collection: 'codex/characters', id: 'b', data: { name: '将被删' } }
      ],
      removals: [{ collection: 'codex/characters', id: 'b' }]
    })
    const changes = buildPlannerChangeset(output, mapping)
    expect(changes).toHaveLength(2)
    const write = changes.find((change) => change.op === 'write_entity')
    expect(write).toMatchObject({
      op: 'write_entity',
      id: 'a',
      entity: {
        id: 'a',
        origin: { kind: 'ai', role: 'planner', proposalId: 'job-1' },
        data: { name: '新名' }
      }
    })
    expect(changes.find((change) => change.op === 'delete_entity')).toMatchObject({ id: 'b' })
  })
})

describe('buildWriterChangeset', () => {
  it('写入正文;有既有章计划且给出 planStatus 时推进计划状态', () => {
    const output = WorkshopWriterOutputSchema.parse({
      title: '第一章成稿',
      chapterId: 'ch-0001',
      content: '正文内容。',
      planStatus: 'drafted'
    })
    const existingPlan = {
      schemaVersion: 1 as const,
      id: 'ch-0001',
      origin: { kind: 'human' as const },
      updatedAt: mapping.now,
      data: { title: '第一章', goal: '开场', beats: ['引子'], requirements: [], status: 'planned', aliases: undefined }
    }
    const changes = buildWriterChangeset(output, { ...mapping, role: 'writer' }, existingPlan)
    expect(changes[0]).toEqual({ op: 'write_chapter', chapterId: 'ch-0001', content: '正文内容。' })
    expect(changes[1]).toMatchObject({
      op: 'write_entity',
      collection: 'outline/chapters',
      entity: { data: { title: '第一章', goal: '开场', status: 'drafted' } }
    })
  })

  it('没有既有章计划时只写正文', () => {
    const output = WorkshopWriterOutputSchema.parse({
      title: '新章',
      chapterId: 'ch-0002',
      content: 'x',
      planStatus: 'drafted'
    })
    expect(buildWriterChangeset(output, { ...mapping, role: 'writer' }, undefined)).toHaveLength(1)
  })
})
