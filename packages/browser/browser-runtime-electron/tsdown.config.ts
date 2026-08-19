import { defineConfig } from 'tsdown'

const library = {
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node' as const,
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

/**
 * Index and the test-only host seam share one `host-seam` chunk so
 * `lib/testing.js` injects the same module-level holder `lib/index.js` reads.
 * The invariant companion has no host import and stays a separate bundle.
 */
export default defineConfig([
  {
    ...library,
    entry: {
      index: 'lib/types/index.js',
      testing: 'lib/types/testing.js',
    },
    outputOptions: {
      chunkFileNames: 'host-seam.js',
    },
  },
  {
    ...library,
    entry: ['lib/types/invariant.js'],
  },
])
