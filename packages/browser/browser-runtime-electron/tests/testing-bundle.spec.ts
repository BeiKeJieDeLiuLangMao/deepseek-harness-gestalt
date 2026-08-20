import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const repo = join(pkg, '..', '..', '..')
const tsc = join(repo, 'node_modules/typescript/lib/tsc.js')
const tsdown = join(repo, 'node_modules/tsdown/dist/run.mjs')

describe('Electron test-host artifact seam', () => {
  it('shares one host-seam chunk between the index and testing bundles', () => {
    execFileSync(process.execPath, [tsc, '-b', join(pkg, 'tsconfig.json')], {
      cwd: repo,
      stdio: 'pipe',
    })
    execFileSync(process.execPath, [tsdown, '--config', join(pkg, 'tsdown.config.ts')], {
      cwd: pkg,
      stdio: 'pipe',
    })
    const index = readFileSync(join(pkg, 'lib/index.js'), 'utf8')
    const testing = readFileSync(join(pkg, 'lib/testing.js'), 'utf8')
    expect(index).toMatch(/from\s+["']\.\/host-seam\.js["']/)
    expect(testing).toMatch(/from\s+["']\.\/host-seam\.js["']/)
    expect(index).not.toMatch(/let testElectronHost/)
    expect(testing).not.toMatch(/let testElectronHost/)
  })
})
