import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  observeSmokeChild, retainSmokeEvidence, stopSmokeChild,
} from './electron-smoke-lifecycle.ts'

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly kill = vi.fn(() => {
    this.signalCode = 'SIGTERM'
    this.emit('exit', null, 'SIGTERM')
    return true
  })
}

describe('Electron smoke lifecycle', () => {
  it('captures output and joins an owned running child after termination', async () => {
    const child = new FakeChild()
    const observed = observeSmokeChild(child as never)
    child.stdout.emit('data', Buffer.from('out'))
    child.stderr.emit('data', Buffer.from('err'))
    await stopSmokeChild(child as never, observed.exited)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(observed.output()).toBe('outerr')
  })

  it('does not signal an owned child that already exited', async () => {
    const child = new FakeChild()
    child.exitCode = 0
    const observed = observeSmokeChild(child as never)
    await stopSmokeChild(child as never, observed.exited)
    expect(child.kill).not.toHaveBeenCalled()
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
      await import('node:fs/promises').then(({ rm }) => rm(evidencePath, { force: true }))
    }
  })
})
