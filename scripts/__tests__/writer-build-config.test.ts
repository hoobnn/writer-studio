import { describe, expect, it } from 'vitest'

import writerBuildConfig from '../../electron-builder.writer'
import { DISTRIBUTION } from '../../src/shared/utils/distribution'

describe('Writer Studio build config', () => {
  it('uses the runtime distribution identity', () => {
    expect(writerBuildConfig).toMatchObject({
      appId: DISTRIBUTION.appId,
      productName: DISTRIBUTION.productName,
      protocols: {
        name: DISTRIBUTION.productName,
        schemes: [DISTRIBUTION.protocol]
      },
      extraMetadata: {
        name: DISTRIBUTION.appName,
        productName: DISTRIBUTION.productName,
        version: DISTRIBUTION.version
      }
    })
  })

  it('requires signing and replaces the upstream release pipeline with fork releases', () => {
    expect(writerBuildConfig.forceCodeSigning).toBe(true)
    expect(writerBuildConfig.publish).toEqual({
      provider: 'generic',
      url: 'https://github.com/hoobnn/writer-studio/releases/latest/download'
    })
    expect(writerBuildConfig.afterSign).toBeNull()
    expect(writerBuildConfig.mac).toMatchObject({
      bundleShortVersion: DISTRIBUTION.version,
      bundleVersion: '1',
      notarize: true,
      sign: 'scripts/writer-mac-sign.js'
    })
  })
})
