import type { WriterChapterPlan, WriterLoreEntry, WriterOperation } from '@shared/types/writer'

const WRITER_LORE_CURRENT_SCAN_CHARS = 24_000
const WRITER_LORE_INSTRUCTION_SCAN_CHARS = 8_000
const WRITER_LORE_PLAN_SCAN_CHARS = 8_000
const WORD_CHARACTER = /[\p{L}\p{N}_]/u
const CONTIGUOUS_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

export interface BuildWriterLoreScanTextInput {
  currentContent: string
  instruction?: string
  chapterPlan?: string
  operation: WriterOperation
}

export interface ActivatedWriterLoreEntry {
  entry: WriterLoreEntry
  activation: 'always' | 'keyword'
  matchedKeys: string[]
}

export function formatWriterChapterPlanContext(plan: Pick<WriterChapterPlan, 'goal' | 'beats'> | undefined): string {
  if (!plan) return ''
  const beats = plan.beats.map((beat, index) => `${index + 1}. ${beat}`).join('\n')
  return [plan.goal, beats].filter(Boolean).join('\n')
}

function sliceHeadTail(content: string, limit: number): string {
  if (content.length <= limit) return content
  const marker = '\n…\n'
  const available = limit - marker.length
  const headLength = Math.ceil(available / 2)
  return `${content.slice(0, headLength)}${marker}${content.slice(-(available - headLength))}`
}

export function buildWriterLoreScanText(input: BuildWriterLoreScanTextInput): string {
  const currentContent =
    input.operation === 'continue'
      ? input.currentContent.slice(-WRITER_LORE_CURRENT_SCAN_CHARS)
      : sliceHeadTail(input.currentContent, WRITER_LORE_CURRENT_SCAN_CHARS)
  return [
    currentContent,
    input.chapterPlan?.slice(0, WRITER_LORE_PLAN_SCAN_CHARS) ?? '',
    input.instruction?.slice(0, WRITER_LORE_INSTRUCTION_SCAN_CHARS) ?? ''
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeForMatch(value: string, caseSensitive: boolean): string {
  const normalized = value.normalize('NFKC')
  return caseSensitive ? normalized : normalized.toLowerCase()
}

function includesWholeWord(content: string, key: string): boolean {
  let fromIndex = 0
  while (fromIndex <= content.length - key.length) {
    const matchIndex = content.indexOf(key, fromIndex)
    if (matchIndex < 0) return false
    const before = content[matchIndex - 1]
    const after = content[matchIndex + key.length]
    if ((!before || !WORD_CHARACTER.test(before)) && (!after || !WORD_CHARACTER.test(after))) return true
    fromIndex = matchIndex + Math.max(1, key.length)
  }
  return false
}

function normalizedLoreKeyMatches(content: string, key: string, matchWholeWords: boolean): boolean {
  if (!key) return false
  if (!matchWholeWords || CONTIGUOUS_SCRIPT.test(key)) return content.includes(key)
  return includesWholeWord(content, key)
}

export function writerLoreKeyMatches(
  content: string,
  key: string,
  options: Pick<WriterLoreEntry, 'caseSensitive' | 'matchWholeWords'>
): boolean {
  const normalizedKey = normalizeForMatch(key.trim(), options.caseSensitive)
  const normalizedContent = normalizeForMatch(content, options.caseSensitive)
  return normalizedLoreKeyMatches(normalizedContent, normalizedKey, options.matchWholeWords)
}

export function selectActiveWriterLoreEntries(
  entries: readonly WriterLoreEntry[],
  scanText: string
): ActivatedWriterLoreEntry[] {
  const activated: ActivatedWriterLoreEntry[] = []
  const caseSensitiveContent = normalizeForMatch(scanText, true)
  const caseInsensitiveContent = normalizeForMatch(scanText, false)
  for (const entry of entries) {
    if (!entry.enabled) continue
    if (entry.alwaysActive) {
      activated.push({ entry, activation: 'always', matchedKeys: [] })
      continue
    }
    const normalizedContent = entry.caseSensitive ? caseSensitiveContent : caseInsensitiveContent
    const matchedKeys = entry.keys.filter((key) => {
      const normalizedKey = normalizeForMatch(key.trim(), entry.caseSensitive)
      return normalizedLoreKeyMatches(normalizedContent, normalizedKey, entry.matchWholeWords)
    })
    if (matchedKeys.length > 0) activated.push({ entry, activation: 'keyword', matchedKeys })
  }
  return activated.sort(
    (left, right) => right.entry.order - left.entry.order || left.entry.id.localeCompare(right.entry.id)
  )
}
