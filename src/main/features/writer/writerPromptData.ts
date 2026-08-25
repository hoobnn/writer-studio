import type { WriterContextSource } from '@shared/types/writer'

export interface WriterPromptSourceData {
  order: number
  priority: number
  kind: WriterContextSource['kind']
  label: string
  truncated: boolean
  content: string
}

function toWriterPromptSourceData(source: WriterContextSource, index: number): WriterPromptSourceData {
  return {
    order: index + 1,
    priority: source.priority,
    kind: source.kind,
    label: source.label,
    truncated: source.truncated,
    content: source.content
  }
}

export function serializeWriterPromptSources(sources: readonly WriterContextSource[]): string {
  return JSON.stringify(sources.map(toWriterPromptSourceData))
}

export function writerPromptSourceSerializedChars(source: WriterContextSource, index: number): number {
  const separatorChars = index > 0 ? 1 : 0
  return JSON.stringify(toWriterPromptSourceData(source, index)).length + separatorChars
}

export function writerPromptContentSerializedChars(content: string): number {
  return JSON.stringify(content).length - 2
}
