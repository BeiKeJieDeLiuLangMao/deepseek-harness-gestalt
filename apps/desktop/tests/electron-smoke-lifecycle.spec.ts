import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  observeSmokeChild, retainSmokeEvidence, stopSmokeChild,
} from './electron-smoke-lifecycle.ts'

const childFixture = fileURLToPath(new URL('./fixtures/electron-smoke-child.mjs', import.meta.url))

describe('Electron smoke lifecycle', () => {
  it.skipIf(process.platform === 'win32')('escalates an owned child that ignores SIGTERM and joins its exit', async () => {
    const child = spawn(process.execPath, [childFixture, 'ignore-term'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const observed = observeSmokeChild(child)
    let failure: unknown
    try {
      await expect.poll(() => observed.output()).toContain('ready')
      await stopSmokeChild(child, observed.exited)
      expect(child.signalCode).toBe('SIGKILL')
    } catch (error) {
      failure = error
      throw error
    } finally {
      try { await stopSmokeChild(child, observed.exited) } catch (cleanupError) {
        if (failure === undefined) throw cleanupError
      }
    }
  })

  it('rejects a spawn failure instead of waiting for an exit that never arrives', async () => {
    const child = spawn(join(tmpdir(), `missing-electron-${process.pid}`), [], { stdio: ['ignore', 'pipe', 'pipe'] })
    const observed = observeSmokeChild(child)
    await expect(observed.exited).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stopSmokeChild(child, observed.exited)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains smoke and process logs before removing the isolated root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'electron-smoke-lifecycle-'))
    const smokeLog = join(root, 'smoke.log')
    const evidencePath = join(tmpdir(), `electron-smoke-evidence-${process.pid}.log`)
    await writeFile(smokeLog, 'smoke evidence')
    try {
      await retainSmokeEvidence({ evidencePath, root, smokeLog, processOutput: 'child evidence' })
      await expect(stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(evidencePath, 'utf8')).resolves.toContain('smoke evidence\n--- electron output ---\nchild evidence')
    } finally {
      await rm(evidencePath, { force: true })
    }
  })

  it('rejects dot-prefixed evidence names inside the isolated root and still removes it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'electron-smoke-lifecycle-failure-'))
    const smokeLog = join(root, 'smoke.log')
    await writeFile(smokeLog, 'smoke evidence')
    await expect(retainSmokeEvidence({
      evidencePath: join(root, '..evidence.log'), root, smokeLog, processOutput: '',
    })).rejects.toThrow('must be outside')
    await expect(stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows an evidence file in a legitimate sibling path', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'electron-smoke-lifecycle-parent-'))
    const root = join(parent, 'root')
    const smokeLog = join(root, 'smoke.log')
    const evidencePath = join(parent, 'evidence.log')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(root))
    await writeFile(smokeLog, 'smoke evidence')
    try {
      await retainSmokeEvidence({ evidencePath, root, smokeLog, processOutput: '' })
      await expect(readFile(evidencePath, 'utf8')).resolves.toContain('smoke evidence')
      await expect(stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
