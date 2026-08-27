import type { WorkshopProjectCard } from '@shared/types/workshop'
import { describe, expect, it } from 'vitest'

import { runWorkshopInvariants } from '../workshopInvariants'
import type { WorkshopContextData } from '../workshopPrompts'

function card(overrides: Partial<WorkshopProjectCard> = {}): WorkshopProjectCard {
  return {
    schemaVersion: 1,
    id: 'proj',
    title: '测试',
    genre: '',
    premise: '',
    authorGoal: '',
    volumeOrder: [],
    looseChapterIds: [],
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

function entity(collection: string, id: string, data: unknown) {
  return {
    collection: collection as never,
    entity: {
      schemaVersion: 1 as const,
      id,
      origin: { kind: 'human' as const },
      updatedAt: new Date().toISOString(),
      data
    }
  }
}

function snapshot(input: Partial<WorkshopContextData>): WorkshopContextData {
  return { card: card(), entities: [], chapterIds: [], ...input }
}

const rulesOf = (findings: { rule: string }[]) => findings.map((finding) => finding.rule)

describe('runWorkshopInvariants', () => {
  it('干净项目零发现', () => {
    const findings = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1'],
        entities: [
          entity('codex/characters', 'hero', { name: '林远' }),
          entity('ledger/summaries', 'ch-1', { summary: '摘要' })
        ]
      })
    )
    expect(findings).toEqual([])
  })

  it('引用不存在的章节与人物报硬错误', () => {
    const findings = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1'],
        entities: [
          entity('ledger/summaries', 'ch-1', { summary: 'x' }),
          entity('ledger/facts', 'f1', {
            subject: '怀表',
            predicate: '被埋',
            sourceChapterId: 'ch-999',
            usedInChapterIds: []
          }),
          entity('ledger/states', 's1', {
            timelineId: 'main',
            characterId: 'ghost',
            chapterId: 'ch-1',
            sequence: 0,
            lifeStatus: 'alive',
            transitionExplanation: '',
            location: '',
            evidence: ''
          })
        ]
      })
    )
    expect(rulesOf(findings)).toEqual(['invalid_reference', 'invalid_reference'])
    expect(findings.every((finding) => finding.severity === 'error')).toBe(true)
  })

  it('死亡后无解释复活报错;有解释则通过', () => {
    const base = {
      timelineId: 'main',
      location: '',
      evidence: ''
    }
    const make = (id: string, chapterId: string, lifeStatus: string, explanation = '') =>
      entity('ledger/states', id, {
        ...base,
        characterId: 'hero',
        chapterId,
        sequence: 0,
        lifeStatus,
        transitionExplanation: explanation
      })
    const common = [
      entity('codex/characters', 'hero', { name: '林远' }),
      entity('ledger/summaries', 'ch-1', { summary: 'x' }),
      entity('ledger/summaries', 'ch-2', { summary: 'x' })
    ]
    const bad = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1', 'ch-2'],
        card: card({ looseChapterIds: ['ch-1', 'ch-2'] }),
        entities: [...common, make('s1', 'ch-1', 'dead'), make('s2', 'ch-2', 'alive')]
      })
    )
    expect(rulesOf(bad)).toContain('character_resurrection')

    const explained = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1', 'ch-2'],
        card: card({ looseChapterIds: ['ch-1', 'ch-2'] }),
        entities: [...common, make('s1', 'ch-1', 'dead'), make('s2', 'ch-2', 'alive', '复活仪式')]
      })
    )
    expect(rulesOf(explained)).not.toContain('character_resurrection')
  })

  it('同一时间线故事时间回退报警告(章节全序取自卷序)', () => {
    const findings = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1', 'ch-2'],
        card: card({ volumeOrder: ['vol-1'] }),
        entities: [
          entity('outline/volumes', 'vol-1', { title: '第一卷', summary: '', chapterIds: ['ch-1', 'ch-2'] }),
          entity('ledger/summaries', 'ch-1', { summary: 'x' }),
          entity('ledger/summaries', 'ch-2', { summary: 'x' }),
          entity('ledger/events', 'e1', {
            timelineId: 'main',
            chapterId: 'ch-1',
            sequence: 0,
            storyTime: 10,
            label: '出发'
          }),
          entity('ledger/events', 'e2', {
            timelineId: 'main',
            chapterId: 'ch-2',
            sequence: 0,
            storyTime: 5,
            label: '抵达'
          })
        ]
      })
    )
    expect(rulesOf(findings)).toEqual(['timeline_regression'])
  })

  it('伏笔状态不一致与逾期分级正确', () => {
    const findings = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1', 'ch-2'],
        card: card({ looseChapterIds: ['ch-1', 'ch-2'] }),
        entities: [
          entity('ledger/summaries', 'ch-1', { summary: 'x' }),
          entity('ledger/summaries', 'ch-2', { summary: 'x' }),
          entity('ledger/foreshadowing', 'fs1', { description: '怀表', status: 'resolved' }),
          entity('ledger/foreshadowing', 'fs2', {
            description: '信',
            status: 'open',
            plantedChapterId: 'ch-1',
            dueChapterId: 'ch-1'
          })
        ]
      })
    )
    expect(rulesOf(findings)).toEqual(['foreshadowing_state_mismatch', 'foreshadowing_overdue'])
  })

  it('章节同属多卷报错;缺摘要与计划滞后为提示级', () => {
    const findings = runWorkshopInvariants(
      snapshot({
        chapterIds: ['ch-1'],
        entities: [
          entity('outline/volumes', 'vol-1', { title: '一', summary: '', chapterIds: ['ch-1'] }),
          entity('outline/volumes', 'vol-2', { title: '二', summary: '', chapterIds: ['ch-1'] }),
          entity('outline/chapters', 'ch-1', { title: '第一章', status: 'planned' })
        ]
      })
    )
    expect(rulesOf(findings).sort()).toEqual(['duplicate_volume_membership', 'missing_summary', 'plan_status_mismatch'])
    expect(findings[0]).toMatchObject({ rule: 'duplicate_volume_membership', severity: 'error' })
    expect(findings.slice(1).every((finding) => finding.severity === 'info')).toBe(true)
  })
})
