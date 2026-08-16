import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const fixtures: string[] = []

afterAll(() => {
  for (const fixture of fixtures) rmSync(fixture, { force: true, recursive: true })
})

function resolveOsxSign(): string {
  const electronBuilderPackage = realpathSync(
    resolve('apps/desktop/node_modules/electron-builder/package.json'),
  )
  const electronBuilderRequire = createRequire(electronBuilderPackage)
  const appBuilderPackage = electronBuilderRequire.resolve('app-builder-lib/package.json')
  return createRequire(appBuilderPackage).resolve('@electron/osx-sign')
}

describe('@electron/osx-sign integration', () => {
  const itOnPosix = process.platform === 'win32' ? it.skip : it

  itOnPosix('walks a large resource tree with a constrained descriptor limit', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-osx-sign-walk-'))
    fixtures.push(fixture)
    for (let directory = 0; directory < 300; directory += 1) {
      const directoryPath = join(fixture, String(directory))
      mkdirSync(directoryPath)
      for (let file = 0; file < 10; file += 1) {
        writeFileSync(join(directoryPath, `${file}.js`), 'export {}\n')
      }
    }

    const walkScript = join(fixture, 'walk.cjs')
    writeFileSync(
      walkScript,
      `const { walkAsync } = require(${JSON.stringify(resolveOsxSign())})\n` +
        `walkAsync(${JSON.stringify(fixture)}).catch(error => {\n` +
        '  console.error(error)\n' +
        '  process.exitCode = 1\n' +
        '})\n',
    )
    const result = spawnSync('bash', ['-c', 'ulimit -n 64; exec "$NODE_BIN" "$WALK_SCRIPT"'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_BIN: process.execPath, WALK_SCRIPT: walkScript },
    })

    expect(result.status, result.stderr).toBe(0)
  })
})
