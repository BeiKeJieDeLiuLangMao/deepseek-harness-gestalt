import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopHostLifecycle } from '../src/host-lifecycle.ts'
import { DesktopShutdown } from '../src/shutdown.ts'
import { spawnWebHost, WebHostStartupCleanupError } from '../src/spawn-web-host.ts'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  spawn.mockReset()
})

function controlledChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: 123, exitCode: null, signalCode: null,
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true),
  })
  spawn.mockReturnValue(child)
  return child
}

const command = { node: 'fake', args: [], cwd: 'fake' }

describe('pre-ready Host cleanup outcome', () => {
  it('owns an already-aborted child until its controlled exit', async () => {
    vi.useFakeTimers()
    const child = controlledChild()
    const controller = new AbortController()
    controller.abort()
    let settled = false
    const pending = spawnWebHost({ ...command, signal: controller.signal }).catch((error: unknown) => {
      settled = true
      return error
    })
    await Promise.resolve()
    expect(child.kill).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(settled).toBe(false)
    child.emit('exit', null, 'SIGTERM')
    expect(await pending).toMatchObject({ message: 'dsh web startup aborted' })
  })

  it('ignores stdout and stderr after readiness without changing exit facts', async () => {
    const child = controlledChild()
    const pending = spawnWebHost(command)
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:34567\n')
    const running = await pending
    const observed = vi.fn()
    void running.exited.then(observed)
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:45678\n')
    child.stderr.emit('data', 'late diagnostic')
    await Promise.resolve()
    expect(await pending).toBe(running)
    expect(running.url).toBe('http://127.0.0.1:34567')
    expect(observed).not.toHaveBeenCalled()
    const stopped = running.stop()
    child.emit('exit', null, 'SIGTERM')
    const record = await stopped
    expect(record).toBe(await running.exited)
    expect(record).toEqual({ pid: 123, code: null, signal: 'SIGTERM', requestedStop: { kind: 'stop' } })
  })

  it('rejects the exact pre-ready child error and removes timeout and abort handling', async () => {
    vi.useFakeTimers()
    const child = controlledChild()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const failure = new Error('spawn failed')
    const pending = spawnWebHost({ ...command, signal: controller.signal }).catch((error: unknown) => error)
    child.emit('error', failure)
    expect(await pending).toBe(failure)
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    controller.abort()
    await vi.runAllTimersAsync()
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('does not turn a post-ready child error into readiness failure or observed exit', async () => {
    const child = controlledChild()
    const pending = spawnWebHost(command)
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:34567\n')
    const running = await pending
    const observed = vi.fn()
    void running.exited.then(observed)
    child.emit('error', new Error('late child error'))
    expect(await pending).toBe(running)
    const stopped = running.stop()
    await Promise.resolve()
    expect(observed).not.toHaveBeenCalled()
    child.emit('exit', 7, null)
    expect(await stopped).toBe(await running.exited)
    expect(await stopped).toEqual({ pid: 123, code: 7, signal: null, requestedStop: { kind: 'stop' } })
  })

  it('rejects quiet pre-ready exit without a diagnostic suffix', async () => {
    vi.useFakeTimers()
    const child = controlledChild()
    const pending = spawnWebHost(command).catch((error: unknown) => error)
    child.emit('exit', 2, null)
    expect(await pending).toMatchObject({
      message: 'dsh web exited before announcing a URL (code 2, signal null)',
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds and redacts a long abort kill warning while retaining exact stop rejection', async () => {
    const child = controlledChild()
    const controller = new AbortController()
    const secret = 'synthetic-secret-value'
    const failure = new Error(`${secret} ${'x'.repeat(300)}`)
    child.kill.mockImplementation(() => { throw failure })
    const warning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})
    const pending = spawnWebHost({ ...command, signal: controller.signal, env: { TEST_TOKEN: secret } })
    child.stdout.emit('data', 'dsh web: http://127.0.0.1:34567\n')
    const running = await pending
    controller.abort()
    await expect(running.stop()).rejects.toBe(failure)
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      `${`Error: [REDACTED] ${'x'.repeat(300)}`.slice(0, 200)}…`,
      { type: 'WebHostAbortStopFailed', code: 'DSH_WEB_HOST_ABORT_STOP_FAILED' },
    )
    child.emit('exit', null, 'SIGTERM')
    expect((await running.exited).requestedStop).toEqual({ kind: 'abort' })
  })

  it('retains exact timeout cleanup failure through an ordinary failed retry before shutdown', async () => {
    vi.useFakeTimers()
    try {
      const cleanupFailure = { reason: 'raw timeout stop failure' }
      const child = Object.assign(new EventEmitter(), {
        pid: 123, exitCode: null, signalCode: null,
        stdout: new EventEmitter(), stderr: new EventEmitter(),
        kill: vi.fn(() => { throw cleanupFailure }),
      })
      spawn.mockReturnValue(child)
      const disposeBrowser = vi.fn(async () => {})
      const disposeMembership = vi.fn(async () => {})
      const retryFailure = new Error('ordinary retry failed')
      let attempts = 0
      const owner = new DesktopHostLifecycle({
        createBrowser: async () => ({ origin: 'browser', tokenFile: 'token', tokenDir: 'tokens',
          present: vi.fn(), conceal: vi.fn(), raisePresented: vi.fn(), dispose: disposeBrowser }),
        createMembership: async () => ({ origin: 'membership', tokenFile: 'token', dispose: disposeMembership }),
        spawn: (_b, _m, signal) => {
          attempts += 1
          if (attempts > 1) throw retryFailure
          return spawnWebHost({ node: 'fake', args: [], cwd: 'fake', signal }, 10)
        },
      })
      const start = owner.start().catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(10)
      const failure = await start
      expect(failure).toBeInstanceOf(WebHostStartupCleanupError)
      if (!(failure instanceof WebHostStartupCleanupError)) throw new Error('expected typed cleanup failure')
      expect(failure.cleanupError).toBe(cleanupFailure)
      expect(failure.startupError.message).toContain('within 10ms')
      expect(await owner.start().catch((error: unknown) => error)).toBe(retryFailure)
      const shutdownFailure = await owner.shutdown().catch((error: unknown) => error)
      expect(shutdownFailure).toBeInstanceOf(AggregateError)
      if (!(shutdownFailure instanceof AggregateError)) throw new Error('expected cleanup aggregate')
      expect(shutdownFailure.errors).toEqual([failure])
      expect(shutdownFailure.errors[0]).toBe(failure)
      expect(disposeBrowser).toHaveBeenCalledOnce()
      expect(disposeMembership).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  for (const fails of [true, false]) {
    it(`uses actual spawn cleanup facts when fake stop failure=${String(fails)}`, async () => {
      const cleanupFailure = { reason: 'raw fake kill failure' }
      let release!: () => void
      const cleanupGate = new Promise<void>((resolve) => { release = resolve })
      let releaseMembership!: () => void
      const membershipGate = new Promise<void>((resolve) => { releaseMembership = resolve })
      const child = Object.assign(new EventEmitter(), {
        pid: 123, exitCode: null, signalCode: null,
        stdout: new EventEmitter(), stderr: new EventEmitter(),
        kill: vi.fn(() => { if (fails) throw cleanupFailure; return true }),
      })
      let announce!: () => void
      const spawned = new Promise<void>((resolve) => { announce = resolve })
      spawn.mockImplementation(() => { announce(); return child })
      const browser = {
        origin: 'browser', tokenFile: 'token', tokenDir: 'tokens',
        present: vi.fn(), conceal: vi.fn(), raisePresented: vi.fn(), dispose: vi.fn(() => cleanupGate),
      }
      const membership = { origin: 'membership', tokenFile: 'token', dispose: vi.fn(() => membershipGate) }
      const owner = new DesktopHostLifecycle({
        createBrowser: async () => browser, createMembership: async () => membership,
        spawn: (_browser, _membership, signal) => spawnWebHost({ node: 'fake', args: [], cwd: 'fake', signal }),
      })
      const start = owner.start().catch((error: unknown) => error)
      await spawned
      const exit = vi.fn()
      const reportError = vi.fn()
      const shutdown = new DesktopShutdown({
        stopHost: () => owner.shutdown(), cleanup: async () => {}, exit, reportError,
      })
      const done = shutdown.request(0, 'exit')
      expect(exit).not.toHaveBeenCalled()
      if (!fails) {
        await new Promise<void>((resolve) => { setImmediate(resolve) })
        expect(exit).not.toHaveBeenCalled()
        child.emit('exit', null, 'SIGTERM')
      }
      const failure = await start
      await new Promise<void>((resolve) => { setImmediate(resolve) })
      expect(browser.dispose).toHaveBeenCalledOnce()
      expect(membership.dispose).toHaveBeenCalledOnce()
      expect(exit).not.toHaveBeenCalled()
      expect(reportError).not.toHaveBeenCalled()
      release()
      await new Promise<void>((resolve) => { setImmediate(resolve) })
      expect(exit).not.toHaveBeenCalled()
      expect(reportError).not.toHaveBeenCalled()
      releaseMembership()
      await done
      if (fails) {
        expect(failure).toBeInstanceOf(AggregateError)
        expect(failure).toBeInstanceOf(WebHostStartupCleanupError)
        if (!(failure instanceof WebHostStartupCleanupError)) throw new Error('expected typed cleanup failure')
        expect(failure.kind).toBe('startup-cleanup-failed')
        expect(failure.startupError.message).toBe('dsh web startup aborted')
        expect(failure.cleanupError).toBe(cleanupFailure)
        expect(failure.cause).toBe(failure.startupError)
        expect(failure.errors).toEqual([failure.startupError, cleanupFailure])
        expect(failure.errors[0]).toBe(failure.startupError)
        expect(failure.errors[1]).toBe(cleanupFailure)
      }
      expect(browser.dispose).toHaveBeenCalledOnce()
      expect(membership.dispose).toHaveBeenCalledOnce()
      expect(child.kill).toHaveBeenCalledOnce()
      expect(reportError).toHaveBeenCalledTimes(fails ? 1 : 0)
      expect(exit).toHaveBeenCalledExactlyOnceWith(fails ? 1 : 0)
    })
  }
})
