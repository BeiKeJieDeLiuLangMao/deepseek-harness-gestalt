#!/usr/bin/env node
/**
 * Download one official Node distribution into apps/desktop/resources/node.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'resources', 'node')
const version = process.env.DSH_BUNDLE_NODE_VERSION ?? '24.11.0'

const args = process.argv.slice(2)
const platform = flag('--platform', args) ?? process.platform
const arch = flag('--arch', args) ?? process.arch
if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
  throw new Error(`unsupported platform ${platform}`)
}

const triple = `${platform === 'win32' ? 'win' : platform}-${arch}`
const ext = platform === 'win32' ? 'zip' : 'tar.gz'
const name = `node-v${version}-${triple}`
const url = `https://nodejs.org/dist/v${version}/${name}.${ext}`
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
const archive = join(out, `${name}.${ext}`)
const response = await fetch(url)
if (!response.ok || response.body === null) {
  throw new Error(`download failed: ${url} ${String(response.status)}`)
}
await pipeline(response.body, createWriteStream(archive))
const tarArgs = platform === 'win32'
  ? ['-xf', archive, '-C', out, '--strip-components=1']
  : ['-xzf', archive, '-C', out, '--strip-components=1']
execFileSync('tar', tarArgs, { stdio: 'inherit' })
await rm(archive, { force: true })
console.log(`node ${version} ${triple} -> ${out}`)

function flag(name, argv) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}
