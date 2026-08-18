import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it, vi } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import { createProcessInspector } from '../src/process-inspector.ts'
import type { ProcessIdentity, ProcessInspector } from '../src/process-inspector.ts'
import { taskkillProcessTree } from '../src/spawn.ts'

type ExitTrigger = 'direct' | 'uncaught-exception' | 'unhandled-rejection' | 'dispose'
type ManagedKind = 'ordinary' | 'terminal'
interface TreeState { root: number; descendant: number }

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const hostScript = fileURLToPath(new URL('./fixtures/process-exit-host.ts', import.meta.url))
const managedTreeScript = fileURLToPath(new URL('./fixtures/managed-tree.ts', import.meta.url))
const scenarioTimeoutMs = 30_000

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

async function readTree(path: string): Promise<TreeState> {
  return vi.waitFor(async () => {
    const text = await readFile(path, 'utf8')
    const state = JSON.parse(text) as Partial<TreeState>
    if (!Number.isSafeInteger(state.root) || !Number.isSafeInteger(state.descendant)
      || (state.root ?? 0) <= 0 || (state.descendant ?? 0) <= 0 || state.root === state.descendant) {
      throw new Error(`invalid managed-tree state: ${text}`)
    }
    return state as TreeState
  }, { interval: 10, timeout: scenarioTimeoutMs })
}

async function captureIdentities(inspector: ProcessInspector, state: TreeState): Promise<ProcessIdentity[]> {
  return vi.waitFor(() => {
    const expected = new Set([state.root, state.descendant])
    const identities = inspector.processTree(state.root).filter(identity => expected.has(identity.pid))
    if (identities.length !== expected.size) throw new Error('managed tree is not fully observable yet')
    return identities
  }, { interval: 10, timeout: scenarioTimeoutMs })
}

async function captureRootedTree(
  inspector: ProcessInspector,
  rootPid: number,
  minimumSize: number,
): Promise<ProcessIdentity[]> {
  return vi.waitFor(() => {
    const identities = inspector.processTree(rootPid)
    if (identities.length < minimumSize) throw new Error('managed tree is not fully observable yet')
    return identities
  }, { interval: 10, timeout: scenarioTimeoutMs })
}

async function waitForGone(state: TreeState): Promise<void> {
  await Promise.all([state.root, state.descendant].map(pid => vi.waitFor(() => {
    if (processExists(pid)) throw new Error(`managed pid ${pid} is still alive`)
  }, { interval: 25, timeout: 10_000 })))
}

function cleanupTree(state: TreeState | undefined, identities: ProcessIdentity[]): void {
  if (state === undefined) return
  if (process.platform === 'win32') {
    taskkillProcessTree(state.root)
    for (const pid of [state.descendant, state.root]) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (_alreadyGone) {
        // The exact recorded process already exited.
      }
    }
    return
  }
  const inspector = createProcessInspector()
  for (const identity of identities) {
    try {
      inspector.signalProcess(identity, 'SIGKILL')
    } catch (_alreadyGone) {
      // Exact start identity prevents PID-reuse cleanup from reaching another process.
    }
  }
  if (identities.length === 0) {
    for (const pid of [state.descendant, state.root]) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (_alreadyGone) {
        // The scenario failed before process identities became observable.
      }
    }
  }
}

function mergeIdentities(...groups: ProcessIdentity[][]): ProcessIdentity[] {
  return [...new Map(groups.flat().map(identity => [`${identity.pid}:${identity.started}`, identity])).values()]
}

function cleanupPublicationTree(
  rootPid: number,
  inspector: ProcessInspector | undefined,
  captured: ProcessIdentity[],
): ProcessIdentity[] {
  if (process.platform === 'win32') {
    taskkillProcessTree(rootPid)
    return captured
  }
  if (inspector === undefined) return captured
  let observed: ProcessIdentity[] = []
  try {
    observed = inspector.processTree(rootPid)
  } catch (_unreadableProcessTable) {
    // Identities captured before publication remain sufficient for this cleanup attempt.
  }
  const identities = mergeIdentities(captured, observed)
  for (const identity of identities) {
    try {
      inspector.signalProcess(identity, 'SIGKILL')
    } catch (_alreadyGone) {
      // Exact start identity prevents PID-reuse cleanup from reaching another process.
    }
  }
  return identities
}

async function runManagedTreePublication(
  inspectWhilePaused: (statePath: string, identities: readonly ProcessIdentity[]) => Promise<void>,
  maxWriteBytes?: number,
): Promise<TreeState> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-subprocess-managed-tree-publish-'))
  const statePath = join(root, 'tree.json')
  const publishStartedPath = join(root, 'publish-started')
  const publishProceedPath = join(root, 'publish-proceed')
  const descendantStartedPath = join(root, 'descendant-started')
  const descendantProceedPath = join(root, 'descendant-proceed')
  const launch = resolveExampleLaunch({
    srcBin: managedTreeScript,
    mode: 'src',
    tsconfigPath: join(repoRoot, 'tsconfig.json'),
    configArgs: [
      statePath,
      publishStartedPath,
      publishProceedPath,
      descendantStartedPath,
      descendantProceedPath,
      ...(maxWriteBytes === undefined ? [] : [String(maxWriteBytes)]),
    ],
  })
  const child = execa(launch.command, launch.args, {
    cwd: repoRoot,
    env: launch.env,
    stdin: 'ignore',
    reject: false,
    timeout: scenarioTimeoutMs,
  })
  if (child.pid === undefined) throw new Error('managed-tree fixture did not publish a root pid')
  const rootPid = child.pid
  const inspector = process.platform === 'win32' ? undefined : createProcessInspector()
  let identities: ProcessIdentity[] = []
  try {
    if (inspector !== undefined) identities = await captureRootedTree(inspector, rootPid, 1)
    await vi.waitFor(() => readFile(descendantStartedPath, 'utf8'), {
      interval: 10,
      timeout: scenarioTimeoutMs,
    })
    if (inspector !== undefined) identities = mergeIdentities(
      identities,
      await captureRootedTree(inspector, rootPid, 2),
    )
    await writeFile(descendantProceedPath, 'proceed')
    await vi.waitFor(() => readFile(publishStartedPath, 'utf8'), {
      interval: 10,
      timeout: scenarioTimeoutMs,
    })
    await inspectWhilePaused(statePath, identities)
    await writeFile(publishProceedPath, 'proceed')
    return await readTree(statePath)
  } finally {
    try {
      identities = cleanupPublicationTree(rootPid, inspector, identities)
      child.kill('SIGKILL')
      await child
      if (inspector !== undefined) {
        await Promise.all(identities.map(identity => vi.waitFor(() => {
          if (inspector.isAlive(identity)) throw new Error(`managed pid ${identity.pid} is still alive`)
        }, { interval: 25, timeout: 10_000 })))
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}

async function runScenario(kind: ManagedKind, trigger: ExitTrigger) {
  const root = await mkdtemp(join(tmpdir(), `dsh-subprocess-host-exit-${kind}-${trigger}-`))
  const launch = resolveExampleLaunch({
    srcBin: hostScript,
    mode: 'src',
    tsconfigPath: join(repoRoot, 'tsconfig.json'),
    configArgs: [kind, trigger, root],
  })
  const child = execa(launch.command, launch.args, {
    cwd: repoRoot,
    env: launch.env,
    stdin: 'ignore',
    reject: false,
    timeout: scenarioTimeoutMs,
  })
  let state: TreeState | undefined
  let identities: ProcessIdentity[] = []
  let settled = false
  let treeGone = false
  try {
    state = await readTree(join(root, 'tree.json'))
    await vi.waitFor(() => readFile(join(root, 'ready'), 'utf8'), {
      interval: 10,
      timeout: scenarioTimeoutMs,
    })
    if (process.platform !== 'win32') identities = await captureIdentities(createProcessInspector(), state)
    await writeFile(join(root, 'proceed'), 'proceed')
    const outcome = await child
    settled = true
    await waitForGone(state)
    treeGone = true
    const disposeCounts = trigger === 'dispose'
      ? JSON.parse(await readFile(join(root, 'dispose.json'), 'utf8')) as {
        listenersBefore: number
        listenersAfterLoad: number
        listenersAfterDispose: number
      }
      : undefined
    return { outcome, disposeCounts }
  } finally {
    if (!settled) {
      child.kill('SIGKILL')
      await child.catch(() => {})
    }
    if (!treeGone) {
      cleanupTree(state, identities)
      if (state !== undefined) await waitForGone(state).catch(() => {})
    }
    await rm(root, { recursive: true, force: true })
  }
}

describe('synchronous cleanup on host exit', () => {
  it('publishes managed-tree state only after the document is complete', { timeout: 45_000 }, async () => {
    await runManagedTreePublication(async (statePath) => {
      await expect(readFile(statePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }, 1)
  })

  it.skipIf(process.platform === 'win32')(
    'removes the managed tree when publication inspection fails',
    { timeout: 45_000 },
    async () => {
      let captured: readonly ProcessIdentity[] = []
      await expect(runManagedTreePublication(async (_statePath, identities) => {
        captured = identities
        throw new Error('controlled publication inspection failure')
      })).rejects.toThrow('controlled publication inspection failure')
      expect(captured).toHaveLength(2)
      expect(captured.every(identity => !processExists(identity.pid))).toBe(true)
    },
  )

  it('removes the descendant when the first state write makes no progress', { timeout: 45_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-subprocess-managed-tree-zero-write-'))
    const statePath = join(root, 'tree.json')
    const descendantStartedPath = join(root, 'descendant-started')
    const descendantProceedPath = join(root, 'descendant-proceed')
    const launch = resolveExampleLaunch({
      srcBin: managedTreeScript,
      mode: 'src',
      tsconfigPath: join(repoRoot, 'tsconfig.json'),
      configArgs: [
        statePath,
        join(root, 'publish-started'),
        join(root, 'publish-proceed'),
        descendantStartedPath,
        descendantProceedPath,
        '0',
      ],
    })
    const child = execa(launch.command, launch.args, {
      cwd: repoRoot,
      env: launch.env,
      stdin: 'ignore',
      reject: false,
      timeout: scenarioTimeoutMs,
    })
    if (child.pid === undefined) throw new Error('managed-tree fixture did not publish a root pid')
    let state: TreeState | undefined
    let identities: ProcessIdentity[] = []
    let treeGone = false
    try {
      const descendant = Number(await vi.waitFor(() => readFile(descendantStartedPath, 'utf8'), {
        interval: 10,
        timeout: scenarioTimeoutMs,
      }))
      state = { root: child.pid, descendant }
      if (process.platform !== 'win32') identities = await captureIdentities(createProcessInspector(), state)
      await writeFile(descendantProceedPath, 'proceed')
      const outcome = await child
      expect(outcome.exitCode).toBe(1)
      expect(outcome.stderr).toContain('managed-tree state write made no progress')
      await waitForGone(state)
      treeGone = true
    } finally {
      child.kill('SIGKILL')
      await child
      if (!treeGone) {
        cleanupTree(state, identities)
        if (state !== undefined) await waitForGone(state)
      }
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each([
    { trigger: 'direct' as const, expectedCode: 23, diagnostic: undefined },
    { trigger: 'uncaught-exception' as const, expectedCode: 1, diagnostic: 'host-exit-uncaught-exception' },
    { trigger: 'unhandled-rejection' as const, expectedCode: 1, diagnostic: 'host-exit-unhandled-rejection' },
  ])('removes an ordinary managed tree after $trigger', { timeout: 45_000 }, async ({
    trigger,
    expectedCode,
    diagnostic,
  }) => {
    const { outcome } = await runScenario('ordinary', trigger)
    expect(outcome.exitCode).toBe(expectedCode)
    expect(outcome.signal).toBeUndefined()
    if (diagnostic !== undefined) expect(outcome.stderr).toContain(diagnostic)
  })

  it.skipIf(process.platform === 'win32')(
    'removes a terminal root and descendant after direct exit',
    { timeout: 45_000 },
    async () => {
      const { outcome } = await runScenario('terminal', 'direct')
      expect(outcome.exitCode).toBe(23)
      expect(outcome.signal).toBeUndefined()
    },
  )

  it('preserves normal terminate-and-join disposal and removes the exit listener', { timeout: 45_000 }, async () => {
    const { outcome, disposeCounts } = await runScenario('ordinary', 'dispose')
    expect(outcome.exitCode).toBe(0)
    expect(disposeCounts?.listenersAfterLoad).toBe((disposeCounts?.listenersBefore ?? 0) + 1)
    expect(disposeCounts?.listenersAfterDispose).toBe(disposeCounts?.listenersBefore)
  })
})
