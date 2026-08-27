import { WORKSHOP_COLLECTIONS } from '@shared/types/workshop'

import type { WorkshopKernel } from './WorkshopKernel'
import type { WorkshopContextData } from './workshopPrompts'

const RELATED_CHAPTER_LIMIT = 2
const RELATED_TAIL_CHARS = 2_000

/** 抽取检索词:CJK 二元组 + 拉丁词,去重。确定性词法召回,后续可替换为向量检索。 */
export function extractRetrievalTerms(query: string): string[] {
  const terms = new Set<string>()
  for (const match of query.matchAll(/[A-Za-z0-9_]{2,}/g)) terms.add(match[0].toLowerCase())
  const cjk = query.match(/[一-鿿]+/g) ?? []
  for (const run of cjk) {
    for (let index = 0; index + 1 < run.length; index++) terms.add(run.slice(index, index + 2))
  }
  return [...terms]
}

/** 收集一次生成/讨论所需的项目快照(在项目锁内调用)。 */
export async function collectWorkshopContext(
  kernel: WorkshopKernel,
  options: { targetChapterId?: string; retrievalQuery?: string } = {}
): Promise<WorkshopContextData> {
  const card = await kernel.readProjectCard()
  const chapterIds = await kernel.listChapterIds()
  const entities: WorkshopContextData['entities'] = []
  for (const collection of WORKSHOP_COLLECTIONS) {
    for (const entity of await kernel.listEntities(collection)) entities.push({ collection, entity })
  }
  let targetChapter: WorkshopContextData['targetChapter']
  if (options.targetChapterId && chapterIds.includes(options.targetChapterId)) {
    targetChapter = {
      chapterId: options.targetChapterId,
      content: await kernel.readChapter(options.targetChapterId)
    }
  }

  let relatedChapters: WorkshopContextData['relatedChapters']
  if (options.retrievalQuery) {
    // 召回依据是台账摘要与章计划(廉价、无需扫全文);命中后才读取正文尾部。
    const textOf = new Map<string, string>()
    for (const item of entities) {
      if (item.collection === 'ledger/summaries') {
        const summary = (item.entity.data as { summary?: string }).summary ?? ''
        textOf.set(item.entity.id, `${textOf.get(item.entity.id) ?? ''} ${summary}`)
      }
      if (item.collection === 'outline/chapters') {
        const plan = item.entity.data as { title?: string; goal?: string; beats?: string[] }
        textOf.set(
          item.entity.id,
          `${textOf.get(item.entity.id) ?? ''} ${plan.title ?? ''} ${plan.goal ?? ''} ${(plan.beats ?? []).join(' ')}`
        )
      }
    }
    const planText = options.targetChapterId ? (textOf.get(options.targetChapterId) ?? '') : ''
    const terms = extractRetrievalTerms(`${options.retrievalQuery} ${planText}`)
    const scored = chapterIds
      .filter((chapterId) => chapterId !== options.targetChapterId)
      .map((chapterId) => {
        const text = textOf.get(chapterId) ?? ''
        return { chapterId, score: terms.reduce((sum, term) => (text.includes(term) ? sum + 1 : sum), 0) }
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, RELATED_CHAPTER_LIMIT)
    if (scored.length > 0) {
      relatedChapters = []
      for (const { chapterId } of scored) {
        const content = await kernel.readChapter(chapterId)
        relatedChapters.push({ chapterId, contentTail: content.slice(-RELATED_TAIL_CHARS) })
      }
    }
  }
  return { card, entities, chapterIds, targetChapter, relatedChapters }
}
