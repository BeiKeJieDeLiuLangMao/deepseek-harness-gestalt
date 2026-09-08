import { defineConfig } from 'tsdown'

/** Build the store root and HTTP route plugin as independent Node entries. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/http.js'],
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
})
