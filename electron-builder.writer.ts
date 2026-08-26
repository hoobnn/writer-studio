import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Configuration } from 'electron-builder'

import { DISTRIBUTION } from './src/shared/utils/distribution'

// package.json 的 version 跟随上游 Cherry Studio，打包时作为 upstreamVersion 嵌入产物
const upstreamVersion: string = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')).version

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
    version: DISTRIBUTION.version,
    upstreamVersion
  },
  forceCodeSigning: true,
  publish: null,
  afterSign: null,
  mac: {
    bundleShortVersion: DISTRIBUTION.version,
    bundleVersion: '1',
    icon: 'build/writer/icon.png',
    notarize: true,
    sign: 'scripts/writer-mac-sign.js'
  }
} satisfies Configuration

export default config
