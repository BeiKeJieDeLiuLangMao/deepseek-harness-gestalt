import { describe, expect, it, vi } from 'vitest'
import type {
  ProcessIdentity, ProcessInspector, ProcessSnapshot,
} from '@deepseek-ai/dsh-subprocess-local/src/process-inspector.ts'
import {
  captureOwnedProcessTree, removeScratchIfOwnersQuiescent, terminateOwnedProcesses,
} from './electron-runner-infrastructure.ts'

describe('Electron runner owned-process handling', () => {
  it('captures the exact root and its auxiliary descendants', () => {
    const root = { pid: 40, started: 'root-start' }
    const renderer = { pid: 41, started: 'renderer-start' }
    const utility = { pid: 42, started: 'utility-start' }
    const inspector = fakeInspector({
      tree: pid => pid === root.pid ? [utility, renderer, root] : [],
    })

    expect(captureOwnedProcessTree([root.pid], inspector)).toEqual([utility, renderer, root])
  })

  it('fails closed when an owned root has no process identity', () => {
    const inspector = fakeInspector({ tree: () => [] })

    expect(() => captureOwnedProcessTree([40], inspector))
      .toThrow('could not establish process identity for owned root 40')
  })

  it('does not signal a reused PID whose start identity differs', async () => {
    const signalProcess = vi.fn()
    const inspector = fakeInspector({ isAlive: () => false, signalProcess })

    await terminateOwnedProcesses([{ pid: 40, started: 'previous-start' }], inspector)

    expect(signalProcess).not.toHaveBeenCalled()
  })

  it('terminates and joins a matching owned identity', async () => {
    const identity = { pid: 40, started: 'owned-start' }
    let alive = true
    const signalProcess = vi.fn((candidate: ProcessIdentity) => {
      expect(candidate).toEqual(identity)
      alive = false
    })
    const inspector = fakeInspector({ isAlive: () => alive, signalProcess })

    await terminateOwnedProcesses([identity], inspector)

    expect(signalProcess).toHaveBeenCalledExactlyOnceWith(identity, 'SIGTERM')
  })

  it('retains scratch when an acquired owner did not reach quiescence', async () => {
    const removeTree = vi.fn<typeof import('node:fs/promises').rm>()

    await expect(removeScratchIfOwnersQuiescent('/private/scratch', false, removeTree))
      .resolves.toBe(false)
    expect(removeTree).not.toHaveBeenCalled()
  })
})

function fakeInspector(overrides: {
  readonly isAlive?: (identity: ProcessIdentity) => boolean
  readonly signalProcess?: (identity: ProcessIdentity, signal: 'SIGTERM' | 'SIGKILL') => void
  readonly tree?: ( (pid: number) => ProcessIdentity[])
}): ProcessInspector {
  const snapshot: ProcessSnapshot = {
    tree: overrides.tree ?? (() => []),
    session: () => [],
    alive: overrides.isAlive ?? (() => false),
  }
  return {
    foregroundPgid: () => undefined,
    isStdinWaiting: () => false,
    snapshot: () => snapshot,
    isAlive: overrides.isAlive ?? (() => false),
    signalGroup: () => {},
    signalProcess: overrides.signalProcess ?? (() => {}),
  }
}
