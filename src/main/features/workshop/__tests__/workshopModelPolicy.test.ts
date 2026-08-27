import { describe, expect, it } from 'vitest'

import { workshopErrorCodes } from '../workshopErrors'
import { resolveWorkshopGenerationModel, type WorkshopModelLookup } from '../workshopModelPolicy'

function lookupWith(usable: string[]): WorkshopModelLookup {
  return {
    getProvider: (providerId) => {
      if (!usable.some((id) => id.startsWith(`${providerId}:`))) throw new Error('unknown provider')
      return { isEnabled: true } as never
    },
    getModel: (providerId, modelId) => {
      if (!usable.includes(`${providerId}::${modelId}`)) throw new Error('unknown model')
      return { isEnabled: true, id: modelId, name: modelId, providerId, capabilities: [], endpointTypes: [] } as never
    }
  }
}

describe('resolveWorkshopGenerationModel', () => {
  it('按候选顺序取第一个可用:角色覆盖优先于工坊默认与全局默认', () => {
    const lookup = lookupWith(['a::role-model', 'a::workshop-default', 'a::chat-default'])
    expect(
      resolveWorkshopGenerationModel(
        { explicit: undefined, configuredDefaults: ['a::role-model', 'a::workshop-default', 'a::chat-default'] },
        lookup
      )
    ).toBe('a::role-model')
  })

  it('候选不可用时静默跳到下一级', () => {
    const lookup = lookupWith(['a::chat-default'])
    expect(
      resolveWorkshopGenerationModel(
        { explicit: undefined, configuredDefaults: ['a::gone-role-model', null, 'a::chat-default'] },
        lookup
      )
    ).toBe('a::chat-default')
  })

  it('显式指定 fail-closed:不可用直接报 MODEL_UNAVAILABLE,不回退', () => {
    const lookup = lookupWith(['a::chat-default'])
    expect(() =>
      resolveWorkshopGenerationModel({ explicit: 'a::gone-model', configuredDefaults: ['a::chat-default'] }, lookup)
    ).toThrowError(expect.objectContaining({ code: workshopErrorCodes.MODEL_UNAVAILABLE }))
  })
})
