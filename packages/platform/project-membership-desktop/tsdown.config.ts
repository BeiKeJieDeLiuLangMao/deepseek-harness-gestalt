import { defineConfig } from 'tsdown'

/** Build the Desktop Web Host provider as a Node entry. */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
})
