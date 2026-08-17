/** Execute the committed browser WebAssembly module in Node. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initSync, run_proof_json } from './pkg/dsh_noise_security_path_proof.js'

const proofRoot = dirname(fileURLToPath(import.meta.url))
const runtime = process.argv[2] ?? `Node ${process.versions.node}`
const wasm = readFileSync(join(proofRoot, 'pkg/dsh_noise_security_path_proof_bg.wasm'))

initSync({ module: wasm })
process.stdout.write(`${run_proof_json(runtime)}\n`)
