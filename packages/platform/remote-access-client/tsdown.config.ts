import { defineConfig } from 'tsdown'

/** Build the browser-safe client root and Node WSS adapter as independent bundles. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/invariant.js', 'lib/types/desktop-relay-lifecycle.js'],
    outDir: 'lib', format: ['esm'], platform: 'browser', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
  },
  {
    entry: ['lib/types/node-relay-socket.js'],
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
  },
])
