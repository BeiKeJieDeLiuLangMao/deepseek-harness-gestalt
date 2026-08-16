import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

describe('Desktop overlay isolation', () => {
  it('keeps ui-desktop out of the default web graph and only in the Desktop patch', () => {
    const web = readFileSync(join(repo, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), 'utf8')
    const desktop = readFileSync(join(here, '..', 'cordis.patch.yml'), 'utf8')
    expect(web).not.toMatch(/ui-desktop|dsh-client-ui-desktop/)
    expect(desktop).toMatch(/id: ui-desktop/)
    expect(desktop).toMatch(/@deepseek-ai\/dsh-client-ui-desktop/)
    expect(desktop).not.toMatch(/directory-picker/)
  })

  it('dump-default-config has no Desktop overlay and keeps the native picker', () => {
    const out = execFileSync(process.execPath, [
      '--import', 'tsx/esm',
      join(repo, 'apps', 'cli', 'src', 'bin.ts'),
      'web', '--dump-default-config',
    ], { encoding: 'utf8', cwd: repo })
    expect(out).not.toMatch(/ui-desktop|dsh-client-ui-desktop/)
    expect(out).toMatch(/@deepseek-ai\/dsh-host-directory-picker-auto/)
  }, 20_000)

  it('keeps dsh-scope and dsh-timeout in the deploy graph', () => {
    const cli = readFileSync(join(repo, 'apps', 'cli', 'package.json'), 'utf8')
    expect(cli).toMatch(/"@deepseek-ai\/dsh-scope"/)
    expect(cli).toMatch(/"@deepseek-ai\/dsh-timeout"/)
  })
})
