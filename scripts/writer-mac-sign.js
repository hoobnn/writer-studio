const { createRequire } = require('node:module')

const builderRequire = createRequire(require.resolve('electron-builder'))
const { signAsync } = builderRequire('@electron/osx-sign')

exports.default = async function signWriterMac(options) {
  if (!process.env.CSC_NAME?.trim()) {
    throw new Error('CSC_NAME must select the Writer Studio Developer ID identity')
  }

  await signAsync(options)
}
