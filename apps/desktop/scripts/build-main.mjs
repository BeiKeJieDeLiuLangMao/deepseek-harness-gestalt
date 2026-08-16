#!/usr/bin/env node
import { cp } from 'node:fs/promises'
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
await build({
  absWorkingDir: root,
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(root, 'out', 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'electron-updater'],
  logLevel: 'info',
})
await cp(join(root, 'src', 'preload.cjs'), join(root, 'out', 'preload.cjs'))
