import { defineConfig } from 'tsdown'

/** Build browser-safe root faces and the host-only Relay provider as independent bundles. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/invariant.js'],
    outDir: 'lib', format: ['esm'], platform: 'browser', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
  },
  {
    entry: ['lib/types/relay-provider.js'],
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
  },
])
