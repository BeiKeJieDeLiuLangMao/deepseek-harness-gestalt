import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')

describe('packaged Desktop main bundle', () => {
  it('requires a complete operated Platform config artifact at build time', () => {
    const env = { ...process.env }
    delete env.DSH_DESKTOP_OPERATED_PLATFORM_CONFIG
    expect(() => execFileSync(process.execPath, [join(desktop, 'scripts', 'build-main.mjs')], {
      cwd: desktop,
      env,
      stdio: 'pipe',
    })).toThrow()
  })

  it('inlines workspace packages and leaves only Electron externals', () => {
    execFileSync(process.execPath, [
      join(desktop, 'scripts', 'build-main.mjs'),
      join(desktop, 'tests', 'fixtures', 'operated-platform.json'),
    ], {
      cwd: desktop,
      stdio: 'pipe',
    })
    const source = readFileSync(join(desktop, 'out', 'main.mjs'), 'utf8')
    expect(source).not.toMatch(/from\s+['"]@deepseek-ai\//)
    expect(source).not.toMatch(/import\s+['"]@deepseek-ai\//)
    expect(source).toMatch(/from\s+['"]electron['"]/)
    expect(source).toMatch(/import\s*\(\s*['"]electron-updater['"]\s*\)/)
    expect(source).not.toMatch(/from\s+['"]ws['"]/)
    expect(source).not.toContain('DSH_PLATFORM_ORIGIN')
    expect(JSON.parse(readFileSync(join(desktop, 'out', 'operated-platform.json'), 'utf8')))
      .toMatchObject({ origin: 'https://platform.fixture.example' })
  })
})
