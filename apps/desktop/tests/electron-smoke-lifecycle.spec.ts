import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  observeSmokeChild, retainSmokeEvidence, stopSmokeChild,
} from './electron-smoke-lifecycle.ts'

const childFixture = new URL('./fixtures/electron-smoke-child.mjs', import.meta.url)

describe('Electron smoke lifecycle', () => {
  it('escalates an owned child that ignores SIGTERM and joins its exit', async () => {
    const child = spawn(process.execPath, [childFixture.pathname, 'ignore-term'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const observed = observeSmokeChild(child)
    await expect.poll(() => observed.output()).toContain('ready')
    await expect(stopSmokeChild(child, observed.exited)).resolves.toBeUndefined()
    expect(child.signalCode).toBe('SIGKILL')
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

  it('removes the isolated root when evidence writing fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'electron-smoke-lifecycle-failure-'))
    const smokeLog = join(root, 'smoke.log')
    await writeFile(smokeLog, 'smoke evidence')
    await expect(retainSmokeEvidence({
      evidencePath: join(root, 'evidence.log'), root, smokeLog, processOutput: '',
    })).rejects.toThrow('must be outside')
    await expect(stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
