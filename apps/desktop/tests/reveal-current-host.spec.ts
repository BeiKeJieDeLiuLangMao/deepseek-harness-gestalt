import { describe, expect, it, vi } from 'vitest'
import { bindCurrentOverlay, revealCurrentHost } from '../src/reveal-current-host.ts'

function gate() {
  let release: () => void = () => { throw new Error('gate not initialized') }
  let fail: (error: Error) => void = () => { throw new Error('gate not initialized') }
  const promise = new Promise<void>((resolve, reject) => { release = resolve; fail = reject })
  return { promise, release, fail }
}

function fixture() {
  const target = { destroyed: false }
  const running = {
    url: 'http://127.0.0.1:1234',
    launchUrl: 'http://127.0.0.1:1234/?token=secret',
  }
  const state: { current: typeof running | undefined; window: typeof target; shuttingDown: boolean; closed: boolean } = {
    current: running, window: target, shuttingDown: false, closed: false,
  }
  const revealGate = gate()
  const bindGate = gate()
  const view = { id: 'overlay' }
  const reveal = vi.fn(async () => { await revealGate.promise })
  const publish = vi.fn()
  const dispose = vi.fn()
  const showError = vi.fn(async () => {})
  const validWindow = () => !target.destroyed && state.window === target
  const installOverlay = vi.fn(async (): Promise<void> => {
    await bindCurrentOverlay(view, {
      bind: async () => { await bindGate.promise },
      current: () => validWindow() && state.current === running && !state.closed && !state.shuttingDown,
      publish, dispose,
    })
  })
  const done = revealCurrentHost(target, running, {
    current: () => state.current, shuttingDown: () => state.shuttingDown, closed: () => state.closed,
    validWindow, reveal, installOverlay, showError,
  })
  return { target, running, state, view, revealGate, bindGate, reveal, installOverlay, publish, dispose, showError, done }
}

type Fixture = ReturnType<typeof fixture>
const changes = ['shutdown', 'closed', 'replacement', 'missing', 'destroyed-window', 'replaced-window'] as const
function invalidate(test: Fixture, change: typeof changes[number]) {
  if (change === 'shutdown') test.state.shuttingDown = true
  if (change === 'closed') test.state.closed = true
  if (change === 'replacement') test.state.current = { ...test.running }
  if (change === 'missing') test.state.current = undefined
  if (change === 'destroyed-window') test.target.destroyed = true
  if (change === 'replaced-window') test.state.window = { destroyed: false }
}

describe('reopened window ownership across reveal and overlay binding', () => {
  it('publishes only after binding on the exact captured target and Host', async () => {
    const test = fixture()
    expect(test.reveal).toHaveBeenCalledWith(test.target, test.running.launchUrl)
    expect(test.installOverlay).not.toHaveBeenCalled()
    test.revealGate.release()
    await Promise.resolve()
    await Promise.resolve()
    expect(test.publish).not.toHaveBeenCalled()
    test.bindGate.release()
    await test.done
    expect(test.installOverlay).toHaveBeenCalledExactlyOnceWith(test.target, test.running.url)
    expect(test.publish).toHaveBeenCalledExactlyOnceWith(test.view)
    expect(test.dispose).not.toHaveBeenCalled()
  })

  it.each(changes)('skips overlay installation after %s during reveal', async (change) => {
    const test = fixture()
    invalidate(test, change)
    test.revealGate.release()
    await test.done
    expect(test.installOverlay).not.toHaveBeenCalled()
    expect(test.publish).not.toHaveBeenCalled()
  })

  it.each(changes)('disposes without publication after %s during bind', async (change) => {
    const test = fixture()
    test.revealGate.release()
    await vi.waitFor(() => { expect(test.installOverlay).toHaveBeenCalledTimes(1) })
    invalidate(test, change)
    test.bindGate.release()
    await test.done
    expect(test.publish).not.toHaveBeenCalled()
    expect(test.dispose).toHaveBeenCalledExactlyOnceWith(test.view)
  })

  it.each(['reveal', 'bind'] as const)('observes %s rejection and reports only to the valid window', async (stage) => {
    const test = fixture()
    if (stage === 'reveal') test.revealGate.fail(new Error('presentation failed'))
    else {
      test.revealGate.release()
      await vi.waitFor(() => { expect(test.installOverlay).toHaveBeenCalledTimes(1) })
      test.bindGate.fail(new Error('presentation failed'))
    }
    await expect(test.done).resolves.toBeUndefined()
    expect(test.showError).toHaveBeenCalledExactlyOnceWith(test.target, expect.objectContaining({ message: 'presentation failed' }))
    expect(test.publish).not.toHaveBeenCalled()
    expect(test.reveal).toHaveBeenCalledTimes(1)
    if (stage === 'bind') expect(test.dispose).toHaveBeenCalledExactlyOnceWith(test.view)
  })

  it.each(['replacement', 'shutdown'] as const)('does not render a rejected reveal after %s on the same live window', async (change) => {
    const test = fixture()
    invalidate(test, change)
    test.revealGate.fail(new Error('obsolete reveal failed'))
    await expect(test.done).resolves.toBeUndefined()
    expect(test.target.destroyed).toBe(false)
    expect(test.state.window).toBe(test.target)
    expect(test.showError).not.toHaveBeenCalled()
    expect(test.installOverlay).not.toHaveBeenCalled()
  })

  it.each(['destroyed-window', 'replaced-window'] as const)('does not display a late binding error on a %s', async (change) => {
    const test = fixture()
    test.revealGate.release()
    await vi.waitFor(() => { expect(test.installOverlay).toHaveBeenCalledTimes(1) })
    invalidate(test, change)
    test.bindGate.fail(new Error('late bind failed'))
    await expect(test.done).resolves.toBeUndefined()
    expect(test.showError).not.toHaveBeenCalled()
    expect(test.publish).not.toHaveBeenCalled()
    expect(test.dispose).toHaveBeenCalledExactlyOnceWith(test.view)
  })
})
