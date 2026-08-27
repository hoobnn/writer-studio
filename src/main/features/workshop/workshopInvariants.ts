import { createHash } from 'node:crypto'

import type { WorkshopFinding, WorkshopInvariantRule } from '@shared/types/workshop'

import type { WorkshopContextData } from './workshopPrompts'

/**
 * 不变量引擎 v1:对实体图快照做确定性连续性检查,不调模型。
 * writerContinuityReview 规则集在目标架构上的直系继承者;输入是
 * collectWorkshopContext 的同一快照,因此生成、讨论与检查共享同一事实视图。
 */

interface EntityDataOf {
  volume: { title: string; chapterIds: string[] }
  plan: { title: string; status: 'planned' | 'drafted' | 'revised' }
  fact: { subject: string; sourceChapterId?: string; usedInChapterIds: string[] }
  foreshadowing: {
    description: string
    plantedChapterId?: string
    dueChapterId?: string
    resolvedChapterId?: string
    status: 'open' | 'resolved' | 'abandoned'
  }
  state: {
    timelineId: string
    characterId: string
    chapterId: string
    sequence: number
    lifeStatus: 'unknown' | 'alive' | 'dead'
    transitionExplanation: string
  }
  event: { timelineId: string; chapterId: string; sequence: number; storyTime: number; label: string }
  arc: { title: string; chapterIds: string[] }
}

function findingKey(rule: WorkshopInvariantRule, subject: string): string {
  return createHash('sha256').update(`v1:${rule}:${subject}`).digest('hex')
}

export function runWorkshopInvariants(snapshot: WorkshopContextData): WorkshopFinding[] {
  const findings: WorkshopFinding[] = []
  const add = (
    rule: WorkshopInvariantRule,
    severity: WorkshopFinding['severity'],
    subject: string,
    detail: string,
    related: { chapterIds?: string[]; entityIds?: string[] } = {}
  ) => {
    findings.push({
      key: findingKey(rule, subject),
      rule,
      severity,
      detail,
      chapterIds: related.chapterIds ?? [],
      entityIds: related.entityIds ?? []
    })
  }

  const byCollection = <K extends keyof EntityDataOf>(collection: string) =>
    snapshot.entities
      .filter((item) => item.collection === collection)
      .map((item) => ({ id: item.entity.id, data: item.entity.data as EntityDataOf[K] }))

  const chapters = new Set(snapshot.chapterIds)
  const characters = new Set(
    snapshot.entities.filter((item) => item.collection === 'codex/characters').map((item) => item.entity.id)
  )
  const volumes = byCollection<'volume'>('outline/volumes')
  const plans = byCollection<'plan'>('outline/chapters')
  const arcs = byCollection<'arc'>('outline/arcs')
  const facts = byCollection<'fact'>('ledger/facts')
  const foreshadowings = byCollection<'foreshadowing'>('ledger/foreshadowing')
  const states = byCollection<'state'>('ledger/states')
  const events = byCollection<'event'>('ledger/events')
  const summaries = byCollection<'plan'>('ledger/summaries')

  // 章节全序:卷序展开 → 未分卷(项目卡序) → 其余按 id 排序。
  const order = new Map<string, number>()
  let position = 0
  const pushOrdered = (chapterId: string) => {
    if (!order.has(chapterId) && chapters.has(chapterId)) order.set(chapterId, position++)
  }
  for (const volumeId of snapshot.card.volumeOrder) {
    const volume = volumes.find((candidate) => candidate.id === volumeId)
    for (const chapterId of volume?.data.chapterIds ?? []) pushOrdered(chapterId)
  }
  for (const volume of volumes) for (const chapterId of volume.data.chapterIds) pushOrdered(chapterId)
  for (const chapterId of snapshot.card.looseChapterIds) pushOrdered(chapterId)
  for (const chapterId of [...chapters].sort()) pushOrdered(chapterId)
  const orderOf = (chapterId: string) => order.get(chapterId) ?? Number.MAX_SAFE_INTEGER

  // 1. 引用完整性(硬错误)。
  const checkChapterRef = (entityId: string, label: string, chapterId: string | undefined) => {
    if (chapterId !== undefined && !chapters.has(chapterId)) {
      add(
        'invalid_reference',
        'error',
        `${entityId}:${label}:${chapterId}`,
        `${label}引用了不存在的章节 ${chapterId}`,
        {
          entityIds: [entityId],
          chapterIds: []
        }
      )
    }
  }
  for (const volume of volumes)
    for (const c of volume.data.chapterIds) checkChapterRef(volume.id, `卷「${volume.data.title}」`, c)
  for (const arc of arcs) for (const c of arc.data.chapterIds) checkChapterRef(arc.id, `故事弧「${arc.data.title}」`, c)
  for (const plan of plans) checkChapterRef(plan.id, `章计划「${plan.data.title}」`, plan.id)
  for (const fact of facts) {
    checkChapterRef(fact.id, `事实「${fact.data.subject}」来源`, fact.data.sourceChapterId)
    for (const c of fact.data.usedInChapterIds ?? []) checkChapterRef(fact.id, `事实「${fact.data.subject}」使用处`, c)
  }
  for (const item of foreshadowings) {
    checkChapterRef(item.id, '伏笔埋设', item.data.plantedChapterId)
    checkChapterRef(item.id, '伏笔到期', item.data.dueChapterId)
    checkChapterRef(item.id, '伏笔回收', item.data.resolvedChapterId)
  }
  for (const state of states) {
    checkChapterRef(state.id, '角色状态', state.data.chapterId)
    if (!characters.has(state.data.characterId)) {
      add(
        'invalid_reference',
        'error',
        `${state.id}:character:${state.data.characterId}`,
        `角色状态引用了不存在的人物 ${state.data.characterId}`,
        {
          entityIds: [state.id, state.data.characterId]
        }
      )
    }
  }
  for (const event of events) checkChapterRef(event.id, `时间线事件「${event.data.label}」`, event.data.chapterId)
  for (const summary of summaries) checkChapterRef(summary.id, '章节摘要', summary.id)

  // 2. 分卷归属唯一。
  const membership = new Map<string, string[]>()
  for (const volume of volumes) {
    for (const chapterId of volume.data.chapterIds) {
      membership.set(chapterId, [...(membership.get(chapterId) ?? []), volume.id])
    }
  }
  for (const [chapterId, volumeIds] of membership) {
    if (volumeIds.length > 1) {
      add(
        'duplicate_volume_membership',
        'error',
        chapterId,
        `章节 ${chapterId} 同时属于多个卷:${volumeIds.join('、')}`,
        {
          chapterIds: [chapterId],
          entityIds: volumeIds
        }
      )
    }
  }

  // 3. 角色生死:按(章节全序, sequence)排序的状态链。
  const stateChains = new Map<string, typeof states>()
  for (const state of states) {
    const chainKey = `${state.data.timelineId}:${state.data.characterId}`
    stateChains.set(chainKey, [...(stateChains.get(chainKey) ?? []), state])
  }
  for (const [chainKey, chain] of stateChains) {
    const sorted = [...chain].sort(
      (a, b) => orderOf(a.data.chapterId) - orderOf(b.data.chapterId) || a.data.sequence - b.data.sequence
    )
    let dead = false
    let deathStateId = ''
    for (const state of sorted) {
      if (dead && state.data.lifeStatus === 'alive' && !state.data.transitionExplanation.trim()) {
        add(
          'character_resurrection',
          'error',
          `${chainKey}:${state.id}`,
          `人物 ${state.data.characterId} 在死亡后于章节 ${state.data.chapterId} 无解释地复活`,
          {
            chapterIds: [state.data.chapterId],
            entityIds: [state.id, deathStateId, state.data.characterId]
          }
        )
      }
      if (state.data.lifeStatus === 'dead') {
        dead = true
        deathStateId = state.id
      } else if (state.data.lifeStatus === 'alive' && state.data.transitionExplanation.trim()) {
        dead = false
      }
    }
  }

  // 4. 时间线回退。
  const eventChains = new Map<string, typeof events>()
  for (const event of events) {
    eventChains.set(event.data.timelineId, [...(eventChains.get(event.data.timelineId) ?? []), event])
  }
  for (const [timelineId, chain] of eventChains) {
    const sorted = [...chain].sort(
      (a, b) => orderOf(a.data.chapterId) - orderOf(b.data.chapterId) || a.data.sequence - b.data.sequence
    )
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (current.data.storyTime < previous.data.storyTime) {
        add(
          'timeline_regression',
          'warning',
          `${timelineId}:${current.id}`,
          `时间线「${timelineId}」在章节 ${current.data.chapterId} 出现故事时间回退(「${current.data.label}」早于「${previous.data.label}」)`,
          {
            chapterIds: [current.data.chapterId, previous.data.chapterId],
            entityIds: [current.id, previous.id]
          }
        )
      }
    }
  }

  // 5. 伏笔状态与时序。
  const lastWrittenOrder = Math.max(-1, ...snapshot.chapterIds.map(orderOf))
  for (const item of foreshadowings) {
    const { status, plantedChapterId, dueChapterId, resolvedChapterId, description } = item.data
    if (status === 'resolved' && !resolvedChapterId) {
      add(
        'foreshadowing_state_mismatch',
        'error',
        `${item.id}:resolved-missing`,
        `伏笔「${description}」标记已回收但没有回收章节`,
        { entityIds: [item.id] }
      )
    }
    if (status === 'open' && resolvedChapterId) {
      add(
        'foreshadowing_state_mismatch',
        'error',
        `${item.id}:open-resolved`,
        `伏笔「${description}」仍为 open 却记录了回收章节 ${resolvedChapterId}`,
        { entityIds: [item.id], chapterIds: [resolvedChapterId] }
      )
    }
    if (plantedChapterId && resolvedChapterId && orderOf(resolvedChapterId) < orderOf(plantedChapterId)) {
      add('foreshadowing_chronology', 'error', item.id, `伏笔「${description}」的回收章节早于埋设章节`, {
        entityIds: [item.id],
        chapterIds: [plantedChapterId, resolvedChapterId]
      })
    }
    if (status === 'open' && dueChapterId && orderOf(dueChapterId) <= lastWrittenOrder) {
      add(
        'foreshadowing_overdue',
        'warning',
        item.id,
        `伏笔「${description}」已过既定回收章节 ${dueChapterId} 仍未回收`,
        { entityIds: [item.id], chapterIds: [dueChapterId] }
      )
    }
  }

  // 6. 覆盖缺口(info):已写章节缺摘要;有正文的章节计划仍是 planned。
  const summaryIds = new Set(summaries.map((summary) => summary.id))
  for (const chapterId of snapshot.chapterIds) {
    if (!summaryIds.has(chapterId)) {
      add('missing_summary', 'info', chapterId, `章节 ${chapterId} 尚无台账摘要(守卫未运行或未应用)`, {
        chapterIds: [chapterId]
      })
    }
  }
  for (const plan of plans) {
    if (chapters.has(plan.id) && plan.data.status === 'planned') {
      add('plan_status_mismatch', 'info', plan.id, `章节 ${plan.id} 已有正文但章计划状态仍为 planned`, {
        chapterIds: [plan.id],
        entityIds: [plan.id]
      })
    }
  }

  const severityRank = { error: 0, warning: 1, info: 2 } as const
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.key.localeCompare(b.key))
}
