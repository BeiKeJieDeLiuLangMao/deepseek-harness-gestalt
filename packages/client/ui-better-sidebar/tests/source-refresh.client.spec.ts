import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renameWorkspaceEntry, removeWorkspaceEntry } from '../src/fs-operations.ts'
import { splitShellArgs, unquotePath } from '../src/pty-manager.ts'
import { redactText, REDACTED } from '../src/client/redact.ts'
import { AgentPtyRegistry } from '../src/agent-pty.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-sidebar-refresh-'))
  roots.push(path)
  return path
}

describe('file tree mutations', () => {
  it('renames a row while preserving its contents and refuses overwrite', async () => {
    const cwd = await workspace()
    const path = join(cwd, 'source.txt')
    await writeFile(path, 'retained contents')
    const renamed = await renameWorkspaceEntry({ cwd, path, name: 'renamed.txt' })
    expect(await readFile(renamed.path, 'utf8')).toBe('retained contents')
    await writeFile(path, 'existing destination')
    await expect(renameWorkspaceEntry({ cwd, path: renamed.path, name: 'source.txt' })).rejects.toMatchObject({ status: 409 })
    expect(await readFile(path, 'utf8')).toBe('existing destination')
  })
  it('rejects root mutation and names that escape their directory', async () => {
    const cwd = await workspace()
    const path = join(cwd, 'source.txt')
    await writeFile(path, 'safe')
    await expect(renameWorkspaceEntry({ cwd, path, name: '../escape' })).rejects.toThrow()
    await expect(renameWorkspaceEntry({ cwd, path: cwd, name: 'renamed-root' })).rejects.toThrow()
    await expect(removeWorkspaceEntry({ cwd, path: cwd })).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('safe')
  })
  it('unlinks a file symlink without deleting its target', async () => {
    const cwd = await workspace()
    const target = join(cwd, 'target.txt')
    const path = join(cwd, 'link.txt')
    await writeFile(target, 'retained target')
    await symlink(target, path)
    await removeWorkspaceEntry({ cwd, path })
    expect(await readFile(target, 'utf8')).toBe('retained target')
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('terminal settings and wait output', () => {
  it('preserves a quoted shell path and groups its arguments', () => {
    expect(unquotePath('"/path with spaces/bash"')).toBe('/path with spaces/bash')
    expect(splitShellArgs('-NoLogo -File "C:/my init/start.ps1"')).toEqual(['-NoLogo', '-File', 'C:/my init/start.ps1'])
  })
  it('reports the matched regex alternative from a real terminal', async () => {
    const registry = new AgentPtyRegistry(process.platform === 'win32' ? 'powershell.exe' : '/bin/sh')
    try {
      const id = registry.create('refresh-session', 'regex', 'echo BUILD_FAIL', process.cwd(), 80, 24)
      const result = await registry.waitFor(id, 'BUILD_(OK|FAIL)', 5000)
      expect(result).toMatchObject({ kind: 'found', match: 'BUILD_FAIL' })
      await expect(registry.waitFor(id, '', 100)).rejects.toThrow()
    } finally {
      registry.disposeAll()
    }
  })
})

it('redacts a credential preview but retains ordinary source text', () => {
  expect(redactText('.env', 'API_KEY=example-value').text).toContain(REDACTED)
  expect(redactText('index.ts', 'const count = 2').text).toBe('const count = 2')
})
