import type { Configuration } from 'electron-builder'

import { DISTRIBUTION } from './src/shared/utils/distribution'

const config = {
  extends: './electron-builder.yml',
  appId: DISTRIBUTION.appId,
  productName: DISTRIBUTION.productName,
  directories: {
    output: 'dist/writer-studio'
  },
  protocols: {
    name: DISTRIBUTION.productName,
    schemes: [DISTRIBUTION.protocol]
  },
  extraMetadata: {
    name: DISTRIBUTION.appName,
    productName: DISTRIBUTION.productName,
    version: '0.1.0'
  },
  forceCodeSigning: true,
  publish: null,
  afterSign: null,
  mac: {
    bundleShortVersion: '0.1.0',
    bundleVersion: '1',
    icon: 'build/writer/icon.png',
    notarize: true,
    sign: 'scripts/writer-mac-sign.js'
  }
} satisfies Configuration

export default config
