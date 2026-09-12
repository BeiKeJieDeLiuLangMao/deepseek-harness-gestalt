import { defineConfig } from 'tsdown'

/** Build the HTTP root and Relay WSS plugin as independent Node entries. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/relay.js'],
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
})
