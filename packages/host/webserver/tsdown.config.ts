import { defineConfig } from 'tsdown'

/** Node plugin root plus the HTTP JSON/CORS helper entry. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/http.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
