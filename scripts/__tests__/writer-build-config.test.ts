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
        version: '0.1.0'
      }
    })
  })

  it('requires signing and disables the upstream release pipeline', () => {
    expect(writerBuildConfig.forceCodeSigning).toBe(true)
    expect(writerBuildConfig.publish).toBeNull()
    expect(writerBuildConfig.afterSign).toBeNull()
    expect(writerBuildConfig.mac).toMatchObject({
      bundleShortVersion: '0.1.0',
      bundleVersion: '1',
      notarize: true,
      sign: 'scripts/writer-mac-sign.js'
    })
  })
})
