/** Build the reviewed Snow adapter and its browser-target WebAssembly module. */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const proofRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(proofRoot, '../..')
const targetRoot = join(repositoryRoot, '.artifacts/noise-security-path')
const wasm = join(targetRoot, 'wasm32-unknown-unknown/release/dsh_noise_security_path_proof.wasm')
const pkg = join(proofRoot, 'pkg')

mkdirSync(targetRoot, { recursive: true })
execFileSync('cargo', [
  'build',
  '--locked',
  '--manifest-path',
  join(proofRoot, 'Cargo.toml'),
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
