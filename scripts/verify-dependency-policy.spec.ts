import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  finishFixture,
  fixtureScripts,
  fixtureWorkspaceSettings,
  removeFixtureRoot,
  verifyPolicyScenarios,
  unlinkFixtureLinks,
} from './verify-dependency-policy.ts'

async function withTemporaryDirectory(run: (path: string) => void | Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-dependency-policy-test-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

function directoryLink(target: string, path: string): void {
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir')
}

describe('dependency policy fixture commands', () => {
  it('uses PATH-resolved Node with script files instead of shell-quoting an absolute executable', () => {
    expect(fixtureScripts()).toEqual({ check: 'node check.cjs', postinstall: 'node postinstall.cjs' })
  })

  it('copies package files while retaining pnpm default linker behavior', () => {
    expect(fixtureWorkspaceSettings).toBe('packages: []\npackageImportMethod: copy\n')
  })
})

describe('dependency policy fixture cleanup', () => {
  it('waits for recursive removal with the configured retry budget', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const remove = vi.fn(() => pending)
    const completion = removeFixtureRoot('owned-fixture', remove)
    expect(completion).toBeInstanceOf(Promise)
    let completed = false
    const settled = Promise.resolve(completion).then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)
    expect(remove).toHaveBeenCalledWith('owned-fixture', {
      recursive: true, force: true, maxRetries: 10, retryDelay: 100,
    })
    release()
    await settled
    expect(completed).toBe(true)
  })

  it('does not swallow a final cleanup rejection', async () => {
    const cleanup = Object.assign(new Error('permission denied'), { code: 'EPERM' })
    const remove = vi.fn(async () => { throw cleanup })
    await expect(removeFixtureRoot('owned-fixture', remove)).rejects.toBe(cleanup)
    await expect(finishFixture(undefined, async () => { throw cleanup })).rejects.toBe(cleanup)
  })

  it('waits for cleanup before propagating the primary failure', async () => {
    const primary = new Error('prepare failed')
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const completion = finishFixture(primary, () => pending)
    let completed = false
    const observed = Promise.resolve(completion).catch((error: unknown) => { completed = true; return error })
    await Promise.resolve()
    expect(completed).toBe(false)
    release()
    expect(await observed).toBe(primary)
  })

  it('reports both original errors when the fixture and cleanup reject', async () => {
    const primary = new Error('prepare failed')
    const cleanup = Object.assign(new Error('cleanup failed'), { code: 'EPERM' })
    await expect(finishFixture(primary, async () => { throw cleanup }))
      .rejects.toMatchObject({ errors: [primary, cleanup] })
  })

  it('removes dangling directory links', async () => {
    await withTemporaryDirectory((root) => {
      const target = join(root, 'removed-target')
      const link = join(root, 'dangling-link')
      mkdirSync(target)
      directoryLink(target, link)
      rmSync(target, { recursive: true })

      unlinkFixtureLinks(link)

      expect(() => lstatSync(link)).toThrow()
    })
  })

  it('unlinks directory links without removing their external targets', async () => {
    await withTemporaryDirectory((root) => {
      const fixture = join(root, 'fixture')
      const external = join(root, 'external')
      const marker = join(external, 'marker')
      const link = join(fixture, 'external-link')
      mkdirSync(fixture)
      mkdirSync(external)
      writeFileSync(marker, 'preserved')
      directoryLink(external, link)

      unlinkFixtureLinks(fixture)

      expect(() => lstatSync(link)).toThrow()
      expect(lstatSync(marker).isFile()).toBe(true)
    })
  })
})

async function withWindowsFileHold(
  release: 'timed' | 'manual',
  run: (root: string) => Promise<void>,
): Promise<void> {
  await withTemporaryDirectory(async (root) => {
    const file = join(root, 'held.txt')
    writeFileSync(file, 'owned fixture')
    const script = [
      `$f=[System.IO.File]::Open('${file.replaceAll("'", "''")}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::ReadWrite)`,
      "try { [Console]::WriteLine('READY')",
      release === 'timed' ? 'Start-Sleep -Milliseconds 700' : '[Console]::ReadLine() | Out-Null',
      '} finally { $f.Dispose() }',
    ].join('; ')
    const child = spawn('powershell.exe', [
      '-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ], { stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(120_000) })
    const closed = once(child, 'close')
    const lines = createInterface({ input: child.stdout })
    child.stderr.resume()
    try {
      const ready = once(lines, 'line')
      await Promise.race([
        ready.then(([line]) => { expect(line).toBe('READY') }),
        closed.then(() => { throw new Error('Windows file holder exited before readiness') }),
      ])
      await run(root)
    } finally {
      child.stdin.end('release\n')
      await closed
      lines.close()
    }
  })
}

describe.skipIf(process.platform !== 'win32')('Windows dependency fixture file holds', () => {
  it('waits for a short file hold and removes its owned directory', async () => {
    await withWindowsFileHold('timed', async (root) => {
      await removeFixtureRoot(root)
      expect(() => lstatSync(root)).toThrow()
    })
  }, 130_000)

  it('rejects a hold that outlasts the removal budget', async () => {
    await withWindowsFileHold('manual', async (root) => {
      await expect(removeFixtureRoot(root)).rejects.toMatchObject({ code: 'EBUSY' })
      expect(lstatSync(root).isDirectory()).toBe(true)
    })
  }, 130_000)
})

describe('dependency policy diagnostics', () => {
  it('propagates the original exception when no policy violation was collected', async () => {
    const original = new Error('fixture preparation failed')
    await expect(verifyPolicyScenarios([], async () => { throw original })).rejects.toBe(original)
  })

  it('leaves normally collected violations available to the final report', async () => {
    const failures: string[] = []
    await verifyPolicyScenarios(failures, async () => { failures.push('policy violation') })
    expect(failures).toEqual(['policy violation'])
  })

  it('retains collected violations and cleanup rejection without entering another fixture', async () => {
    const failures: string[] = []
    const cleanup = Object.assign(new Error('cleanup failed'), { code: 'EPERM' })
    const nextFixture = vi.fn()
    const result = verifyPolicyScenarios(failures, async () => {
      failures.push('stale run local: requested command ran')
      await finishFixture(undefined, async () => { throw cleanup })
      nextFixture()
    })
    const failure: unknown = await result.catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error('expected aggregated policy failure')
    const violation: unknown = failure.errors[0]
    expect(violation).toBeInstanceOf(Error)
    if (!(violation instanceof Error)) throw new Error('expected collected policy violations')
    expect(violation.message).toContain('stale run local: requested command ran')
    expect(failure.errors[1]).toBe(cleanup)
    expect(nextFixture).not.toHaveBeenCalled()
  })
})
