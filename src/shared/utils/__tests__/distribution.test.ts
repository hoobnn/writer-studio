import { describe, expect, it } from 'vitest'

import { DISTRIBUTION } from '../distribution'

describe('Writer Studio distribution identity', () => {
  it('keeps stable OS identities separate from Cherry Studio', () => {
    expect(DISTRIBUTION).toMatchObject({
      appId: 'com.ikuyu.writerstudio',
      appName: 'WriterStudio',
      productName: 'Writer Studio',
      protocol: 'writerstudio'
    })
    expect(DISTRIBUTION.appId).not.toBe('com.kangfenmao.CherryStudio')
    expect(DISTRIBUTION.protocol).not.toBe('cherrystudio')
  })

  it('does not connect the fork to upstream distribution services', () => {
    expect(DISTRIBUTION.analyticsEnabled).toBe(false)
    expect(DISTRIBUTION.updatesEnabled).toBe(false)
    expect(DISTRIBUTION.upstreamServicesEnabled).toBe(false)
    expect(DISTRIBUTION.vendorOAuthEnabled).toBe(false)
  })
})
