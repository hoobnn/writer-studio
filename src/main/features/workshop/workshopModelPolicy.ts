import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from '@shared/data/presets/cherryai'
import { type Model, parseUniqueModelId, type UniqueModelId, UniqueModelIdSchema } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { isNonChatModel } from '@shared/utils/model'
import { isExternalCliProvider } from '@shared/utils/provider'

import { WorkshopError, workshopErrorCodes } from './workshopErrors'

export interface WorkshopModelLookup {
  getProvider: (providerId: string) => Provider
  getModel: (providerId: string, modelId: string) => Model
}

function resolveUsableCandidate(
  candidate: string | null | undefined,
  lookup: WorkshopModelLookup
): UniqueModelId | null {
  const parsed = UniqueModelIdSchema.safeParse(candidate)
  if (!parsed.success) return null
  const { providerId, modelId } = parseUniqueModelId(parsed.data)
  try {
    const provider = lookup.getProvider(providerId)
    if (!provider.isEnabled || isExternalCliProvider(provider)) return null
    const model = lookup.getModel(providerId, modelId)
    if (!model.isEnabled || isNonChatModel(model)) return null
    return parsed.data
  } catch {
    return null
  }
}

/** fail-closed 解析生成模型:显式指定不可用即报错,未指定时回退配置默认与内置默认。 */
export function resolveWorkshopGenerationModel(
  input: { explicit: string | undefined; configuredDefault: string | null | undefined },
  lookup: WorkshopModelLookup
): UniqueModelId {
  if (input.explicit !== undefined) {
    const explicit = resolveUsableCandidate(input.explicit, lookup)
    if (!explicit) {
      throw new WorkshopError(workshopErrorCodes.MODEL_UNAVAILABLE, 'Selected workshop model is unavailable')
    }
    return explicit
  }
  return (
    resolveUsableCandidate(input.configuredDefault, lookup) ??
    resolveUsableCandidate(CHERRYAI_DEFAULT_UNIQUE_MODEL_ID, lookup) ??
    CHERRYAI_DEFAULT_UNIQUE_MODEL_ID
  )
}
