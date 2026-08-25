import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from '@shared/data/presets/cherryai'
import { type Model, MODEL_CAPABILITY } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { describe, expect, it } from 'vitest'

import {
  computeWriterContextBudgetChars,
  resolveWriterGenerationModel,
  type WriterModelLookup
} from '../writerModelPolicy'

function lookup(
  overrides: {
    external?: boolean
    missing?: boolean
    nonChat?: boolean
    disabled?: boolean
    contextWindow?: number
  } = {}
) {
  return {
    getProvider: () => {
      if (overrides.missing) throw new Error('provider missing')
      return {
        id: 'provider',
        isEnabled: true,
        authMethods: overrides.external ? ['external-cli'] : ['api-key']
      } as unknown as Provider
    },
    getModel: () => {
      if (overrides.missing) throw new Error('model missing')
      return {
        id: 'provider::model',
        providerId: 'provider',
        name: 'Model',
        capabilities: overrides.nonChat ? [MODEL_CAPABILITY.EMBEDDING] : [],
        isEnabled: !overrides.disabled,
        contextWindow: overrides.contextWindow
      } as unknown as Model
    }
  } satisfies WriterModelLookup
}

describe('writer model policy', () => {
  it('rejects an unavailable explicit model without silently replacing it', () => {
    expect(() =>
      resolveWriterGenerationModel({ explicit: 'provider::model', configuredDefault: null }, lookup({ external: true }))
    ).toThrow(expect.objectContaining({ code: 'WRITER_MODEL_UNAVAILABLE' }))
    expect(() =>
      resolveWriterGenerationModel({ explicit: 'provider::model', configuredDefault: null }, lookup({ nonChat: true }))
    ).toThrow(expect.objectContaining({ code: 'WRITER_MODEL_UNAVAILABLE' }))
    expect(() =>
      resolveWriterGenerationModel({ explicit: 'provider::model', configuredDefault: null }, lookup({ disabled: true }))
    ).toThrow(expect.objectContaining({ code: 'WRITER_MODEL_UNAVAILABLE' }))
  })

  it('falls back from an unusable configured default to the managed Cherry model', () => {
    expect(
      resolveWriterGenerationModel(
        { explicit: undefined, configuredDefault: 'stale::model' },
        lookup({ missing: true })
      )
    ).toEqual({ uniqueModelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID, contextWindow: undefined })
  })

  it('computes monotonic context budgets and caps large windows at 48k characters', () => {
    const small = computeWriterContextBudgetChars({ contextWindow: 8_000, instructionChars: 0 })
    const medium = computeWriterContextBudgetChars({ contextWindow: 32_000, instructionChars: 0 })
    const large = computeWriterContextBudgetChars({ contextWindow: 128_000, instructionChars: 0 })

    expect(small).toBeGreaterThan(0)
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
    expect(large).toBe(48_000)
  })

  it('returns no project-data room when a small model window is consumed by the instruction', () => {
    expect(computeWriterContextBudgetChars({ contextWindow: 8_000, instructionChars: 8_000 })).toBe(0)
  })
})
