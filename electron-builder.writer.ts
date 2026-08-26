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
  // 覆盖上游 releaseInfo，否则 latest-mac.yml 会带上 Cherry Studio 的 release notes；
  // 每次发版在这里更新下游自己的更新说明
  releaseInfo: {
    releaseNotes: `Writer Studio ${DISTRIBUTION.version} 首个发布版本。`
  },
  forceCodeSigning: true,
  // github provider 会与上游 generic publish 的 url 键合并导致 schema 校验失败，
  // 因此用 generic 指向 GitHub Releases 的 latest/download 稳定入口
  publish: {
    provider: 'generic',
    url: 'https://github.com/hoobnn/writer-studio/releases/latest/download'
  },
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
