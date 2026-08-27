import type { WorkshopCollection } from '@shared/types/workshop'

/**
 * 创建态的空数据种子:带全量键(必填 string 为空串,由 schema 在保存时拦下),
 * 渲染即合法、无需 schema 内省。
 */
export function emptyDataFor(collection: WorkshopCollection): unknown {
  switch (collection) {
    case 'codex/characters':
      return {
        name: '',
        aliases: [],
        role: '',
        description: '',
        goals: [],
        constraints: [],
        relationships: [],
        arcNote: ''
      }
    case 'codex/lore':
      return {
        title: '',
        content: '',
        keys: [],
        enabled: true,
        alwaysActive: false,
        caseSensitive: false,
        matchWholeWords: false,
        order: 100
      }
    case 'codex/rules':
      return { kind: 'world', text: '', note: '' }
    case 'outline/volumes':
    case 'outline/arcs':
      return { title: '', summary: '', chapterIds: [] }
    case 'outline/chapters':
      return { title: '', goal: '', beats: [], requirements: [], status: 'planned' }
    case 'ledger/facts':
      return { subject: '', predicate: '', detail: '', usedInChapterIds: [] }
    case 'ledger/foreshadowing':
      return { description: '', status: 'open' }
    case 'ledger/summaries':
      return { summary: '', requirementAssessments: [] }
    case 'ledger/states':
      return {
        timelineId: 'main',
        characterId: '',
        chapterId: '',
        sequence: 0,
        location: '',
        lifeStatus: 'unknown',
        transitionExplanation: '',
        evidence: ''
      }
    case 'ledger/events':
      return { timelineId: 'main', chapterId: '', sequence: 0, storyTime: 0, label: '', evidence: '' }
  }
}
