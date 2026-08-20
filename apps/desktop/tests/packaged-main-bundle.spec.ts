import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')

describe('packaged Desktop main bundle', () => {
  it('inlines workspace packages and leaves only Electron externals', () => {
    execFileSync(process.execPath, [join(desktop, 'scripts', 'build-main.mjs')], {
      cwd: desktop,
      stdio: 'pipe',
    })
    const source = readFileSync(join(desktop, 'out', 'main.mjs'), 'utf8')
    expect(source).not.toMatch(/from\s+['"]@deepseek-ai\//)
    expect(source).not.toMatch(/import\s+['"]@deepseek-ai\//)
    expect(source).toMatch(/from\s+['"]electron['"]/)
    expect(source).toMatch(/import\s*\(\s*['"]electron-updater['"]\s*\)/)
    expect(source).toMatch(/from\s+['"]ws['"]/)
  })
})
