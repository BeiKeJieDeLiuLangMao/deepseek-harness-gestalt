/** Run the same committed WebAssembly proof on the repository's Node engine floor and current major. */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const proofRoot = dirname(fileURLToPath(import.meta.url))
const runner = join(proofRoot, 'run-node.mjs')
const candidates = [
  [process.env.DSH_NOISE_NODE22_BIN ?? '/opt/homebrew/opt/node@22/bin/node', 'Node 22'],
  [process.env.DSH_NOISE_NODE24_BIN ?? '/opt/homebrew/opt/node@24/bin/node', 'Node 24'],
]

for (const [executable, label] of candidates) {
  if (!existsSync(executable)) throw new Error(`${label} executable is unavailable at ${executable}`)
  const version = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim()
  const expectedMajor = label.split(' ')[1]
  if (!version.startsWith(`v${expectedMajor}.`)) {
    throw new Error(`${executable} returned ${version}; expected ${label}`)
  }
  const stdout = execFileSync(executable, [runner, label], { encoding: 'utf8' })
  const report = JSON.parse(stdout)
  if (report.runtime !== label) throw new Error(`${label} returned the wrong runtime label`)
  if (report.allPass !== true) throw new Error(`${label} returned a failing proof report`)
  process.stdout.write(`${label} ${version}: pass\n`)
}
