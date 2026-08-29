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
    // 自动更新指向 fork 自己的 GitHub Releases，不属于上游服务
    expect(DISTRIBUTION.updatesEnabled).toBe(true)
    expect(DISTRIBUTION.upstreamServicesEnabled).toBe(false)
    expect(DISTRIBUTION.vendorOAuthEnabled).toBe(false)
  })
})
