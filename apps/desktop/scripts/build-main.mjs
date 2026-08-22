#!/usr/bin/env node
import { cp, mkdir, readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const operatedPlatformConfig = process.argv[2] ?? process.env.DSH_DESKTOP_OPERATED_PLATFORM_CONFIG
if (operatedPlatformConfig === undefined || operatedPlatformConfig.trim() === '') {
  throw new TypeError('Desktop build requires an operated Platform configuration path')
}
const operatedPlatformSource = JSON.parse(await readFile(operatedPlatformConfig, 'utf8'))
validateOperatedPlatformConfig(operatedPlatformSource)
await build({
  absWorkingDir: root,
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(root, 'out', 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'electron-updater', 'ws'],
  logLevel: 'info',
})
await cp(join(root, 'src', 'preload.cjs'), join(root, 'out', 'preload.cjs'))
await cp(operatedPlatformConfig, join(root, 'out', 'operated-platform.json'))
await mkdir(join(root, 'out', 'build'), { recursive: true })
await cp(join(root, 'build', 'icon.png'), join(root, 'out', 'build', 'icon.png'))

function validateOperatedPlatformConfig(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Desktop operated Platform configuration must be an object')
  }
  for (const field of [
    'origin', 'callbackUrl', 'githubClientId', 'credentialReference', 'databaseIdentity', 'identityNamespace',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      throw new TypeError(`Desktop operated Platform configuration requires ${field}`)
    }
  }
  if ('githubClientSecret' in value) {
    throw new TypeError('Desktop operated Platform configuration must not contain a GitHub client secret')
  }
}
