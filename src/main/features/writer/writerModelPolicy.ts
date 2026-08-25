import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from '@shared/data/presets/cherryai'
import { type Model, parseUniqueModelId, type UniqueModelId, UniqueModelIdSchema } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { writerErrorCodes } from '@shared/ipc/errors/writer'
import { WRITER_MAX_CONTEXT_BUDGET_CHARS } from '@shared/types/writer'
import { isNonChatModel } from '@shared/utils/model'
import { isExternalCliProvider } from '@shared/utils/provider'

import { WriterStudioError } from './writerErrors'

const WRITER_UNKNOWN_WINDOW_BUDGET_CHARS = 8_000
const WRITER_WINDOW_USE_RATIO = 0.75
const WRITER_SYSTEM_OVERHEAD_TOKENS = 768
const WRITER_JSON_OVERHEAD_TOKENS = 768
const WRITER_OUTPUT_RESERVE_TOKENS = 2_048
const WRITER_INSTRUCTION_TOKENS_PER_CHAR = 1.25
const WRITER_CONTEXT_CHARS_PER_TOKEN = 0.75

export interface WriterModelLookup {
  getProvider: (providerId: string) => Provider
  getModel: (providerId: string, modelId: string) => Model
}

export interface ResolvedWriterModel {
  uniqueModelId: UniqueModelId
  contextWindow: number | undefined
}

export interface ResolveWriterGenerationModelInput {
  explicit: string | undefined
  configuredDefault: string | null | undefined
}

function resolveUsableCandidate(
  candidate: string | null | undefined,
  lookup: WriterModelLookup
): ResolvedWriterModel | null {
  const parsed = UniqueModelIdSchema.safeParse(candidate)
  if (!parsed.success) return null

  const { providerId, modelId } = parseUniqueModelId(parsed.data)
  try {
    const provider = lookup.getProvider(providerId)
    if (!provider.isEnabled || isExternalCliProvider(provider)) return null
    const model = lookup.getModel(providerId, modelId)
    if (!model.isEnabled || isNonChatModel(model)) return null
    const contextWindow =
      typeof model.contextWindow === 'number' && Number.isFinite(model.contextWindow) && model.contextWindow > 0
        ? model.contextWindow
        : undefined
    return { uniqueModelId: parsed.data, contextWindow }
  } catch {
    return null
  }
}

export function resolveWriterGenerationModel(
  input: ResolveWriterGenerationModelInput,
  lookup: WriterModelLookup
): ResolvedWriterModel {
  if (input.explicit !== undefined) {
    const explicit = resolveUsableCandidate(input.explicit, lookup)
    if (!explicit) {
      throw new WriterStudioError(
        writerErrorCodes.MODEL_UNAVAILABLE,
        'The explicitly selected writer model is unavailable or cannot generate chat text'
      )
    }
    return explicit
  }

  const configured = resolveUsableCandidate(input.configuredDefault, lookup)
  if (configured) return configured

  return (
    resolveUsableCandidate(CHERRYAI_DEFAULT_UNIQUE_MODEL_ID, lookup) ?? {
      uniqueModelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
      contextWindow: undefined
    }
  )
}

export function computeWriterContextBudgetChars(input: {
  contextWindow: number | undefined
  instructionChars: number
}): number {
  const instructionTokens = Math.ceil(Math.max(0, input.instructionChars) * WRITER_INSTRUCTION_TOKENS_PER_CHAR)
  if (typeof input.contextWindow !== 'number' || !Number.isFinite(input.contextWindow) || input.contextWindow <= 0) {
    const instructionChars = Math.ceil(instructionTokens * WRITER_CONTEXT_CHARS_PER_TOKEN)
    return Math.max(0, WRITER_UNKNOWN_WINDOW_BUDGET_CHARS - instructionChars)
  }

  const reservedTokens = WRITER_SYSTEM_OVERHEAD_TOKENS + WRITER_JSON_OVERHEAD_TOKENS + WRITER_OUTPUT_RESERVE_TOKENS
  const availableTokens = Math.floor(input.contextWindow * WRITER_WINDOW_USE_RATIO) - reservedTokens - instructionTokens
  if (availableTokens <= 0) return 0
  return Math.min(WRITER_MAX_CONTEXT_BUDGET_CHARS, Math.floor(availableTokens * WRITER_CONTEXT_CHARS_PER_TOKEN))
}
