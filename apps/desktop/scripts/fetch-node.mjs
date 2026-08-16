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
import { verifySha256 } from './verify-sha256.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'resources', 'node')
const version = process.env.DSH_BUNDLE_NODE_VERSION ?? '24.11.0'

const CHECKSUMS = new Map([
  ['24.11.0:darwin-arm64:tar.gz', '0be2ab2816a4fa02d1acff014a434f29f56d8d956f5af6a98b70ced6c5f4d201'],
  ['24.11.0:darwin-x64:tar.gz', '3884671e87f46f773832d98a0a6cabcc5ec4f637084f0f3515b69e66ea27f2f1'],
  ['24.11.0:win-x64:zip', '1054540bce22b54ec7e50ebc078ec5d090700a77657607a58f6a64df21f49fdd'],
])

const args = process.argv.slice(2)
const platform = flag('--platform', args) ?? process.platform
const arch = flag('--arch', args) ?? process.arch
if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
  throw new Error(`unsupported platform ${platform}`)
}

const triple = `${platform === 'win32' ? 'win' : platform}-${arch}`
const ext = platform === 'win32' ? 'zip' : 'tar.gz'
const name = `node-v${version}-${triple}`
const checksum = CHECKSUMS.get(`${version}:${triple}:${ext}`)
if (checksum === undefined) throw new Error(`no reviewed Node checksum for ${version} ${triple}.${ext}`)
const url = `https://nodejs.org/dist/v${version}/${name}.${ext}`
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
const archive = join(out, `${name}.${ext}`)
const response = await fetch(url)
if (!response.ok || response.body === null) {
  throw new Error(`download failed: ${url} ${String(response.status)}`)
}
await pipeline(response.body, createWriteStream(archive))
await verifySha256(archive, checksum)
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
