/** Build the product Snow adapter WebAssembly module. */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const crateRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(crateRoot, '../../../..')
const targetRoot = join(repositoryRoot, '.artifacts/noise-channel')
const wasm = join(targetRoot, 'wasm32-unknown-unknown/release/dsh_noise_channel.wasm')
const pkg = join(crateRoot, '../pkg')

mkdirSync(targetRoot, { recursive: true })
execFileSync('cargo', [
  'build',
  '--locked',
  '--manifest-path',
  join(crateRoot, 'Cargo.toml'),
  '--target',
  'wasm32-unknown-unknown',
  '--release',
], {
  cwd: repositoryRoot,
  env: { ...process.env, CARGO_TARGET_DIR: targetRoot },
  stdio: 'inherit',
})
execFileSync('wasm-bindgen', [wasm, '--target', 'web', '--out-dir', pkg], {
  cwd: repositoryRoot,
  stdio: 'inherit',
})
