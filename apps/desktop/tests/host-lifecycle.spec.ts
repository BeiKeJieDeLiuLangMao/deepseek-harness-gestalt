import { describe, expect, it, vi } from 'vitest'
import { DesktopHostLifecycle } from '../src/host-lifecycle.ts'
import type { DesktopBrowserRuntime } from '../src/browser-runtime.ts'
import type { DesktopProjectMembershipAgentRuntime } from '../src/project-membership-agent-runtime.ts'
import type { RunningWebHost, WebHostExit } from '../src/spawn-web-host.ts'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function browser() {
  return {
    origin: 'http://browser.invalid', tokenFile: 'token', tokenDir: 'tokens',
    present: vi.fn(), conceal: vi.fn(), raisePresented: vi.fn(), dispose: vi.fn(async () => {}),
  }
}

const exit: WebHostExit = { pid: 123, code: 0, signal: null, requestedStop: { kind: 'stop' } }
function host(): RunningWebHost {
  return {
    // The owner never accesses ChildProcess methods; only the injected stop/exit promises are used.
    child: new EventEmitter() as ChildProcess,
    exited: Promise.resolve(exit), url: 'http://host.invalid', stop: vi.fn(async () => exit),
  }
}
function fixture() {
  const runtime = browser()
  const membership = {
    origin: 'http://membership.invalid', tokenFile: 'token', dispose: vi.fn(async () => {}),
  }
  const running = host()
  const dependencies = {
    createBrowser: vi.fn(async (): Promise<DesktopBrowserRuntime> => runtime),
    createMembership: vi.fn(async (): Promise<DesktopProjectMembershipAgentRuntime> => membership),
    spawn: vi.fn(async (_browser: DesktopBrowserRuntime, _membership: DesktopProjectMembershipAgentRuntime,
      _signal: AbortSignal, _timeoutMs?: number) => running),
  }
  const owner = new DesktopHostLifecycle(dependencies)
  return { owner, runtime, membership, running, dependencies }
}
async function turn(): Promise<void> { await new Promise<void>((resolve) => { setImmediate(resolve) }) }

describe('DesktopHostLifecycle', () => {
  it('joins admitted browser initialization before shutdown and disposes its late result', async () => {
    const ready = deferred<DesktopBrowserRuntime>()
    const entered = deferred<undefined>()
    const runtime = browser()
    const createMembership = vi.fn(async () => ({ origin: 'membership', tokenFile: 'token', dispose: vi.fn(async () => {}) }))
    const spawn = vi.fn(async () => { throw new Error('Host must not spawn') })
    const owner = new DesktopHostLifecycle({
      createBrowser: () => { entered.resolve(undefined); return ready.promise }, createMembership, spawn,
    })
    const started = owner.start().catch((error: unknown) => error)
    await entered.promise
    let completed = false
    const shutdown = owner.shutdown().then(() => { completed = true })
    await new Promise<void>((resolve) => { setImmediate(resolve) })
    const completedBeforeReadiness = completed
    ready.resolve(runtime)
    await started
    await shutdown
    expect(completedBeforeReadiness).toBe(false)
    expect(runtime.dispose).toHaveBeenCalledOnce()
    expect(createMembership).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('owns and disposes late membership without reading a cleared browser', async () => {
    const f = fixture()
    const gate = deferred<DesktopProjectMembershipAgentRuntime>()
    f.dependencies.createMembership.mockImplementation(() => gate.promise)
    const start = f.owner.start().catch((error: unknown) => error)
    await turn()
    const shutdown = f.owner.shutdown()
    gate.resolve(f.membership)
    expect(await start).toMatchObject({ message: 'dsh web startup aborted' })
    await shutdown
    expect(f.dependencies.spawn).not.toHaveBeenCalled()
    expect(f.runtime.dispose).toHaveBeenCalledOnce()
    expect(f.membership.dispose).toHaveBeenCalledOnce()
    expect(f.owner.browser).toBeUndefined()
  })

  it('joins a pre-ready spawn until controlled exit and retains a late ready Host', async () => {
    for (const resolves of [false, true]) {
      const f = fixture()
      const gate = deferred<RunningWebHost>()
      f.dependencies.spawn.mockImplementation(() => gate.promise)
      const start = f.owner.start().catch((error: unknown) => error)
      await turn()
      let complete = false
      const shutdown = f.owner.shutdown().then(() => { complete = true })
      await turn()
      expect(complete).toBe(false)
      if (resolves) gate.resolve(f.running)
      else gate.reject(new Error('aborted after child exit'))
      await start
      await shutdown
      expect(f.running.stop).toHaveBeenCalledTimes(resolves ? 1 : 0)
      expect(f.owner.current).toBeUndefined()
    }
  })

  it('joins retiring old Host before disposal and prevents replacement spawn', async () => {
    const f = fixture()
    await f.owner.start()
    const stopped = deferred<WebHostExit>()
    vi.mocked(f.running.stop).mockImplementation(() => stopped.promise)
    const replacement = f.owner.replace().catch((error: unknown) => error)
    await turn()
    expect(f.owner.current).toBeUndefined()
    const shutdown = f.owner.shutdown()
    await turn()
    expect(f.runtime.dispose).not.toHaveBeenCalled()
    stopped.resolve(exit)
    expect(await replacement).toMatchObject({ message: 'dsh web startup aborted' })
    await shutdown
    expect(f.running.stop).toHaveBeenCalledOnce()
    expect(f.dependencies.spawn).toHaveBeenCalledOnce()
  })

  it('publishes admission and shutdown before creator, abort, and disposer reentry', async () => {
    const f = fixture()
    let joined: Promise<RunningWebHost> | undefined
    f.dependencies.createBrowser.mockImplementation(async () => {
      joined = f.owner.start()
      return f.runtime
    })
    let reentered: Promise<void> | undefined
    f.dependencies.spawn.mockImplementation(async (_b, _m, signal) => {
      signal.addEventListener('abort', () => { reentered = f.owner.shutdown() })
      return f.running
    })
    const start = f.owner.start()
    await start
    expect(joined).toBe(start)
    // Abort dispatch is synchronous; capture the memoized task through reentry itself.
    vi.mocked(f.runtime.dispose).mockImplementation(async () => { expect(f.owner.shutdown()).toBe(shutdown) })
    const shutdown = f.owner.shutdown()
    expect(reentered).toBe(shutdown)
    expect(f.owner.shutdown()).toBe(shutdown)
    await shutdown
    await expect(f.owner.start()).rejects.toThrow('aborted')
    expect(f.dependencies.createBrowser).toHaveBeenCalledOnce()
  })

  it('reuses runtimes after spawn failure and on replacement', async () => {
    const f = fixture()
    f.dependencies.spawn.mockRejectedValueOnce(new Error('spawn failed'))
    await expect(f.owner.start()).rejects.toThrow('spawn failed')
    expect(await f.owner.start(123)).toBe(f.running)
    const next = host()
    f.dependencies.spawn.mockResolvedValueOnce(next)
    expect(await f.owner.replace(456)).toBe(next)
    expect(f.dependencies.createBrowser).toHaveBeenCalledOnce()
    expect(f.dependencies.createMembership).toHaveBeenCalledOnce()
    expect(f.runtime.dispose).not.toHaveBeenCalled()
    expect(f.owner.browser).toBe(f.runtime)
    await f.owner.shutdown()
    expect(f.running.stop).toHaveBeenCalledOnce()
    expect(next.stop).toHaveBeenCalledOnce()
  })

  it('rolls back returned browser on membership rejection and permits retry', async () => {
    const f = fixture()
    f.dependencies.createMembership.mockRejectedValueOnce(new Error('membership failed'))
    await expect(f.owner.start()).rejects.toThrow('membership failed')
    expect(f.runtime.dispose).toHaveBeenCalledOnce()
    expect(f.owner.browser).toBeUndefined()
    const fresh = browser()
    f.dependencies.createBrowser.mockResolvedValueOnce(fresh)
    await f.owner.start()
    await f.owner.shutdown()
    expect(fresh.dispose).toHaveBeenCalledOnce()
    expect(f.runtime.dispose).toHaveBeenCalledOnce()
  })

  it('settles rejected initialization during shutdown without a mutual await cycle', async () => {
    for (const initializer of ['createBrowser', 'createMembership'] as const) {
      const f = fixture()
      const gate = deferred<never>()
      f.dependencies[initializer].mockImplementation(() => gate.promise)
      const start = f.owner.start().catch((error: unknown) => error)
      await turn()
      const shutdown = f.owner.shutdown()
      gate.reject(new Error('initializer failed'))
      expect(await start).toMatchObject({ message: 'initializer failed' })
      await shutdown
      expect(f.dependencies.spawn).not.toHaveBeenCalled()
      expect(f.runtime.dispose).toHaveBeenCalledTimes(initializer === 'createMembership' ? 1 : 0)
    }
  })

  it('aggregates cleanup failures only after other exact handles finish', async () => {
    const f = fixture()
    await f.owner.start()
    vi.mocked(f.running.stop).mockImplementation(() => { throw new Error('stop failed') })
    vi.mocked(f.runtime.dispose).mockRejectedValue(new Error('browser failed'))
    const disposed = deferred<undefined>()
    vi.mocked(f.membership.dispose).mockImplementation(() => disposed.promise)
    let settled = false
    const shutdown = f.owner.shutdown().catch((error: unknown) => { settled = true; return error })
    await turn()
    expect(settled).toBe(false)
    expect(f.membership.dispose).toHaveBeenCalledOnce()
    disposed.reject(new Error('membership failed'))
    expect(await shutdown).toMatchObject({ errors: [
      expect.objectContaining({ message: 'stop failed' }),
      expect.objectContaining({ message: 'browser failed' }),
      expect.objectContaining({ message: 'membership failed' }),
    ] })
  })

  it('retains rollback failures for shutdown while still settling startup', async () => {
    const f = fixture()
    f.dependencies.createMembership.mockRejectedValue(new Error('init failed'))
    vi.mocked(f.runtime.dispose).mockRejectedValue(new Error('rollback failed'))
    await expect(f.owner.start()).rejects.toThrow('initialization cleanup failed')
    await expect(f.owner.shutdown()).rejects.toThrow('shutdown failed')
    expect(f.runtime.dispose).toHaveBeenCalledOnce()
  })

  it('admits replacement without a previous Host and joins concurrent replacement', async () => {
    const f = fixture()
    const first = f.owner.replace()
    expect(f.owner.replace()).toBe(first)
    await first
    await f.owner.shutdown()
  })

  it('settles a synchronous creator shutdown request without starting membership', async () => {
    const f = fixture()
    let shutdown: Promise<void> | undefined
    f.dependencies.createBrowser.mockImplementation(async () => {
      shutdown = f.owner.shutdown()
      return f.runtime
    })
    await expect(f.owner.start()).rejects.toThrow('aborted')
    await shutdown
    expect(f.runtime.dispose).toHaveBeenCalledOnce()
    expect(f.dependencies.createMembership).not.toHaveBeenCalled()
  })

  it('retries a rejected browser initializer without disposing unreturned resources', async () => {
    const f = fixture()
    f.dependencies.createBrowser.mockRejectedValueOnce(new Error('browser failed'))
    await expect(f.owner.start()).rejects.toThrow('browser failed')
    expect(f.dependencies.createMembership).not.toHaveBeenCalled()
    expect(f.runtime.dispose).not.toHaveBeenCalled()
    await f.owner.start()
    await f.owner.shutdown()
  })

  it('joins rollback already in progress when shutdown is requested', async () => {
    const f = fixture()
    f.dependencies.createMembership.mockRejectedValue(new Error('membership failed'))
    const gate = deferred<undefined>()
    f.runtime.dispose.mockImplementation(() => gate.promise)
    const started = f.owner.start().catch((error: unknown) => error)
    await turn()
    const shutdown = f.owner.shutdown()
    gate.resolve(undefined)
    await started
    await shutdown
    expect(f.runtime.dispose).toHaveBeenCalledOnce()
  })

  it('closes admission before a scheduled startup invokes creators', async () => {
    const f = fixture()
    const start = f.owner.start()
    const shutdown = f.owner.shutdown()
    await expect(start).rejects.toThrow('aborted')
    await shutdown
    expect(f.dependencies.createBrowser).not.toHaveBeenCalled()
  })
})
