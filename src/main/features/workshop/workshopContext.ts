import { WORKSHOP_COLLECTIONS } from '@shared/types/workshop'

import type { WorkshopKernel } from './WorkshopKernel'
import type { WorkshopContextData } from './workshopPrompts'

/** 收集一次生成/讨论所需的项目快照(在项目锁内调用)。 */
export async function collectWorkshopContext(
  kernel: WorkshopKernel,
  options: { targetChapterId?: string } = {}
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
  return { card, chapterIds, entities, targetChapter }
}
