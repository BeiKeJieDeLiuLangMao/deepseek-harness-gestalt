import type { UserConfig } from 'tsdown'
import { clientOnly } from '../../client/tsdown.client.ts'

/** Builds each published entry as a self-contained file admitted by the package whitelist. */
const configs = [
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib', format: ['esm'], platform: 'browser', target: 'es2024',
    fixedExtension: false, outputOptions: { codeSplitting: false }, dts: false, clean: false,
  },
  {
    entry: ['lib/types/desktop-relay-lifecycle.js'],
    outDir: 'lib', format: ['esm'], platform: 'browser', target: 'es2024',
    fixedExtension: false, outputOptions: { codeSplitting: false }, dts: false, clean: false,
  },
  {
    entry: ['lib/types/node-relay-socket.js'],
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, outputOptions: { codeSplitting: false }, dts: false, clean: false,
  },
] satisfies readonly UserConfig[]

export default clientOnly(configs)
