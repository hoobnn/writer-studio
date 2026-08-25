import {
  WRITER_MAX_CONTEXT_BUDGET_CHARS,
  type WriterChapterDocument,
  type WriterContextPacket,
  type WriterContextSource,
  type WriterContextSourceKind,
  type WriterLoreActivationReceipt,
  type WriterOperation,
  type WriterProject
} from '@shared/types/writer'
import { clampSurrogateBoundary } from '@shared/utils/text'
import {
  buildWriterLoreScanText,
  formatWriterChapterPlanContext,
  selectActiveWriterLoreEntries
} from '@shared/utils/writerLore'

import { writerPromptContentSerializedChars, writerPromptSourceSerializedChars } from './writerPromptData'

export const WRITER_CONTEXT_DEFAULT_BUDGET_CHARS = 8_000
export const WRITER_CONTEXT_REQUIRED_CURRENT_RESERVE_CHARS = 2_000

const CURRENT_CHAPTER_REQUIRED_OPERATIONS: ReadonlySet<WriterOperation> = new Set([
  'draft',
  'continue',
  'rewrite',
  'review',
  'summarize'
])

export const WRITER_CONTEXT_PRIORITY = {
  AUTHOR_CONSTRAINTS: 100,
  CURRENT_WORK: 90,
  CANON: 80,
  RECENT: 70,
  HISTORY: 60
} as const

interface ContextCandidate {
  kind: WriterContextSourceKind
  label: string
  content: string
  priority: number
  truncated: boolean
  sliceMode: ContextSliceMode
  loreActivation?: Omit<WriterLoreActivationReceipt, 'status' | 'truncated'>
}

type ContextSliceMode = 'head' | 'tail' | 'head-tail'

export interface CompileWriterContextInput {
  project: WriterProject
  currentChapter: WriterChapterDocument
  recentChapters?: WriterChapterDocument[]
  instruction?: string
  operation: WriterOperation
  budgetChars?: number
  now?: Date
}

function formatList(values: readonly string[]): string {
  return values.map((value, index) => `${index + 1}. ${value}`).join('\n')
}

function sliceContextContent(content: string, limit: number, mode: ContextSliceMode): string {
  if (content.length <= limit) return content
  if (mode === 'tail') {
    const start = content.length - limit
    const safeStart = clampSurrogateBoundary(content, start) === start ? start : start + 1
    return content.slice(safeStart)
  }
  if (mode === 'head-tail') {
    const marker = '\n…\n'
    if (limit <= marker.length) {
      const start = content.length - limit
      const safeStart = clampSurrogateBoundary(content, start) === start ? start : start + 1
      return content.slice(safeStart)
    }
    const available = limit - marker.length
    const headLength = Math.ceil(available / 2)
    const tailLength = available - headLength
    const safeHeadEnd = clampSurrogateBoundary(content, headLength)
    const tailStart = content.length - tailLength
    const safeTailStart = clampSurrogateBoundary(content, tailStart) === tailStart ? tailStart : tailStart + 1
    return `${content.slice(0, safeHeadEnd)}${marker}${content.slice(safeTailStart)}`
  }
  return content.slice(0, clampSurrogateBoundary(content, limit))
}

function takeContextHeadBySerializedBudget(content: string, budgetChars: number): string {
  const selected: string[] = []
  let usedChars = 0
  for (const symbol of content) {
    const symbolChars = writerPromptContentSerializedChars(symbol)
    if (usedChars + symbolChars > budgetChars) break
    selected.push(symbol)
    usedChars += symbolChars
  }
  return selected.join('')
}

function takeContextTailBySerializedBudget(content: string, budgetChars: number): string {
  const symbols = Array.from(content)
  const selected: string[] = []
  let usedChars = 0
  for (let index = symbols.length - 1; index >= 0; index -= 1) {
    const symbol = symbols[index]
    const symbolChars = writerPromptContentSerializedChars(symbol)
    if (usedChars + symbolChars > budgetChars) break
    selected.push(symbol)
    usedChars += symbolChars
  }
  return selected.reverse().join('')
}

function sliceContextContentBySerializedBudget(content: string, budgetChars: number, mode: ContextSliceMode): string {
  if (budgetChars <= 0) return ''
  if (writerPromptContentSerializedChars(content) <= budgetChars) return content
  if (mode === 'head') return takeContextHeadBySerializedBudget(content, budgetChars)
  if (mode === 'tail') return takeContextTailBySerializedBudget(content, budgetChars)

  const marker = '\n…\n'
  const markerChars = writerPromptContentSerializedChars(marker)
  if (budgetChars <= markerChars) return takeContextTailBySerializedBudget(content, budgetChars)
  const available = budgetChars - markerChars
  const headBudget = Math.ceil(available / 2)
  const head = takeContextHeadBySerializedBudget(content, headBudget)
  const tailBudget = available - writerPromptContentSerializedChars(head)
  const tail = takeContextTailBySerializedBudget(content.slice(head.length), tailBudget)
  return `${head}${marker}${tail}`
}

function contextSourceFromCandidate(
  candidate: ContextCandidate,
  content: string,
  truncated: boolean
): WriterContextSource {
  return {
    kind: candidate.kind,
    label: candidate.label,
    content,
    priority: candidate.priority,
    truncated
  }
}

function buildCandidates(input: CompileWriterContextInput): ContextCandidate[] {
  const { project, currentChapter } = input
  const candidates: ContextCandidate[] = []
  const perSourceCaps: Record<WriterContextSourceKind, number> = {
    author_goal: 8_000,
    story_premise: 10_000,
    genre: 500,
    theme: 1_000,
    hard_rule: 3_000,
    world_rule: 3_000,
    style_guide: 3_000,
    current_chapter: 16_000,
    chapter_plan: 8_000,
    story_arc: 8_000,
    character: 4_000,
    lore: 4_000,
    foreshadowing: 3_000,
    fact: 3_000,
    recent_summary: 4_000,
    recent_manuscript: 8_000,
    related_history: 4_000
  }
  const push = (
    kind: WriterContextSourceKind,
    label: string,
    rawContent: string,
    priority: number,
    sliceMode: ContextSliceMode = 'head',
    loreActivation?: ContextCandidate['loreActivation']
  ) => {
    if (rawContent.trim().length === 0) return
    const cap = perSourceCaps[kind]
    candidates.push({
      kind,
      label,
      content: sliceContextContent(rawContent, cap, sliceMode),
      priority,
      truncated: rawContent.length > cap,
      sliceMode,
      loreActivation
    })
  }

  push('author_goal', 'Author goal', project.storyBible.authorGoal, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  for (const [index, rule] of project.storyBible.hardRules.entries()) {
    push('hard_rule', `Hard rule ${index + 1}`, rule, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  }
  push('story_premise', 'Story premise', project.storyBible.premise, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  push('genre', 'Genre', project.storyBible.genre, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  for (const [index, theme] of project.storyBible.themes.entries()) {
    push('theme', `Theme ${index + 1}`, theme, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  }
  for (const [index, rule] of project.storyBible.worldRules.entries()) {
    push('world_rule', `World rule ${index + 1}`, rule, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  }
  for (const [index, rule] of project.storyBible.styleGuide.entries()) {
    push('style_guide', `Style guide ${index + 1}`, rule, WRITER_CONTEXT_PRIORITY.AUTHOR_CONSTRAINTS)
  }

  const chapterPlan = project.outline.chapterPlans.find((plan) => plan.chapterId === currentChapter.chapter.id)
  const chapterPlanContent = formatWriterChapterPlanContext(chapterPlan)
  push(
    'current_chapter',
    `Current chapter: ${currentChapter.chapter.title}`,
    currentChapter.content,
    WRITER_CONTEXT_PRIORITY.CURRENT_WORK,
    input.operation === 'continue' ? 'tail' : 'head-tail'
  )
  if (chapterPlan) {
    push('chapter_plan', `Chapter plan: ${chapterPlan.title}`, chapterPlanContent, WRITER_CONTEXT_PRIORITY.CURRENT_WORK)
  }
  push('story_arc', 'Book summary', project.outline.bookSummary, WRITER_CONTEXT_PRIORITY.CURRENT_WORK)
  const matchingArcs = project.outline.arcs.filter(
    (arc) => arc.chapterIds.length === 0 || arc.chapterIds.includes(currentChapter.chapter.id)
  )
  for (const arc of matchingArcs) {
    push('story_arc', `Story arc: ${arc.title}`, arc.summary, WRITER_CONTEXT_PRIORITY.CURRENT_WORK)
  }

  const loreScanText = buildWriterLoreScanText({
    currentContent: currentChapter.content,
    chapterPlan: chapterPlanContent,
    instruction: input.instruction,
    operation: input.operation
  })
  for (const activated of selectActiveWriterLoreEntries(project.storyBible.loreEntries, loreScanText)) {
    const activationLabel =
      activated.activation === 'always' ? 'always active' : `matched: ${activated.matchedKeys.join(', ')}`
    push(
      'lore',
      `Lore: ${activated.entry.title} (${activationLabel})`,
      activated.entry.content,
      WRITER_CONTEXT_PRIORITY.CANON,
      'head',
      {
        entryId: activated.entry.id,
        title: activated.entry.title,
        activation: activated.activation,
        matchedKeys: activated.matchedKeys
      }
    )
  }

  for (const character of project.storyBible.characters) {
    push(
      'character',
      `Character: ${character.name}`,
      [
        character.role ? `Role: ${character.role}` : '',
        character.description,
        character.goals.length > 0 ? `Goals:\n${formatList(character.goals)}` : '',
        character.constraints.length > 0 ? `Constraints:\n${formatList(character.constraints)}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      WRITER_CONTEXT_PRIORITY.CANON
    )
  }

  const orderByChapterId = new Map(project.manifest.chapters.map((chapter) => [chapter.id, chapter.order]))
  const currentOrder = currentChapter.chapter.order
  const isKnownByCurrentChapter = (chapterId?: string) => {
    if (!chapterId) return true
    const sourceOrder = orderByChapterId.get(chapterId)
    return sourceOrder !== undefined && sourceOrder <= currentOrder
  }

  for (const item of project.continuity.foreshadowing.filter(
    (entry) => entry.status === 'open' && isKnownByCurrentChapter(entry.plantedChapterId)
  )) {
    push('foreshadowing', `Open foreshadowing: ${item.id}`, item.description, WRITER_CONTEXT_PRIORITY.CANON)
  }
  for (const fact of project.continuity.facts.filter((entry) => isKnownByCurrentChapter(entry.sourceChapterId))) {
    push(
      'fact',
      `Canon fact: ${fact.subject} ${fact.predicate}`,
      fact.detail || `${fact.subject} ${fact.predicate}`,
      WRITER_CONTEXT_PRIORITY.CANON
    )
  }

  for (const summary of [...project.continuity.chapterSummaries]
    .filter((item) => {
      const summaryOrder = orderByChapterId.get(item.chapterId)
      return summaryOrder !== undefined && summaryOrder < currentOrder
    })
    .sort((a, b) => (orderByChapterId.get(b.chapterId) ?? -1) - (orderByChapterId.get(a.chapterId) ?? -1))) {
    const chapter = project.manifest.chapters.find((item) => item.id === summary.chapterId)
    push(
      'recent_summary',
      `Recent summary: ${chapter?.title ?? summary.chapterId}`,
      summary.summary,
      WRITER_CONTEXT_PRIORITY.RECENT
    )
  }
  for (const chapter of [...(input.recentChapters ?? [])]
    .filter((item) => item.chapter.order < currentOrder)
    .sort((a, b) => b.chapter.order - a.chapter.order)) {
    push(
      'recent_manuscript',
      `Recent manuscript: ${chapter.chapter.title}`,
      chapter.content,
      WRITER_CONTEXT_PRIORITY.RECENT,
      'head-tail'
    )
  }
  return candidates
}

export function compileWriterContext(input: CompileWriterContextInput): WriterContextPacket {
  const budgetChars = Math.min(
    WRITER_MAX_CONTEXT_BUDGET_CHARS,
    Math.max(1, Math.floor(input.budgetChars ?? WRITER_CONTEXT_DEFAULT_BUDGET_CHARS))
  )
  const candidates = buildCandidates(input)
  const requiredCurrentIndex = CURRENT_CHAPTER_REQUIRED_OPERATIONS.has(input.operation)
    ? candidates.findIndex((candidate) => candidate.kind === 'current_chapter')
    : -1
  let requiredCurrentReserve = 0
  if (requiredCurrentIndex >= 0) {
    const requiredCurrent = candidates[requiredCurrentIndex]
    const reservedContent = sliceContextContent(
      requiredCurrent.content,
      Math.min(requiredCurrent.content.length, WRITER_CONTEXT_REQUIRED_CURRENT_RESERVE_CHARS),
      requiredCurrent.sliceMode
    )
    const reservedSource = contextSourceFromCandidate(
      requiredCurrent,
      reservedContent,
      requiredCurrent.truncated || reservedContent.length < requiredCurrent.content.length
    )
    requiredCurrentReserve = Math.min(
      writerPromptSourceSerializedChars(reservedSource, requiredCurrentIndex),
      Math.max(1, Math.floor(budgetChars / 2))
    )
  }
  const sources: WriterContextSource[] = []
  let usedChars = 0
  let truncated = false
  let requiredCurrentIncluded = false
  const loreActivations = candidates.flatMap<WriterLoreActivationReceipt>((candidate) =>
    candidate.loreActivation ? [{ ...candidate.loreActivation, status: 'dropped', truncated: candidate.truncated }] : []
  )
  const loreActivationById = new Map(loreActivations.map((receipt) => [receipt.entryId, receipt]))

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const remaining = budgetChars - usedChars
    if (remaining <= 0) {
      truncated = true
      break
    }
    const protectsRequiredCurrent =
      requiredCurrentReserve > 0 && !requiredCurrentIncluded && candidateIndex < requiredCurrentIndex
    const availableForCandidate = protectsRequiredCurrent ? remaining - requiredCurrentReserve : remaining
    if (availableForCandidate <= 0) {
      truncated = true
      continue
    }
    const fullSource = contextSourceFromCandidate(candidate, candidate.content, candidate.truncated)
    const fullSourceChars = writerPromptSourceSerializedChars(fullSource, sources.length)
    let source = fullSource
    let sourceChars = fullSourceChars
    let budgetTruncated = false
    if (fullSourceChars > availableForCandidate) {
      budgetTruncated = true
      const emptySource = contextSourceFromCandidate(candidate, '', true)
      const fixedSourceChars = writerPromptSourceSerializedChars(emptySource, sources.length)
      const contentBudgetChars = availableForCandidate - fixedSourceChars
      const content = sliceContextContentBySerializedBudget(candidate.content, contentBudgetChars, candidate.sliceMode)
      if (!content) {
        truncated = true
        if (protectsRequiredCurrent) continue
        break
      }
      source = contextSourceFromCandidate(candidate, content, true)
      sourceChars = writerPromptSourceSerializedChars(source, sources.length)
    }
    sources.push(source)
    usedChars += sourceChars
    const sourceTruncated = source.truncated
    if (candidate.loreActivation) {
      const receipt = loreActivationById.get(candidate.loreActivation.entryId)
      if (receipt) {
        receipt.status = 'included'
        receipt.truncated = sourceTruncated
      }
    }
    if (candidate.kind === 'current_chapter') requiredCurrentIncluded = true
    if (sourceTruncated) truncated = true
    if (budgetTruncated) {
      if (protectsRequiredCurrent) continue
      break
    }
  }

  return {
    projectId: input.project.manifest.id,
    chapterId: input.currentChapter.chapter.id,
    operation: input.operation,
    generatedAt: (input.now ?? new Date()).toISOString(),
    budgetChars,
    usedChars,
    truncated,
    sources,
    documentRevisions: input.project.documentRevisions,
    loreActivations
  }
}
