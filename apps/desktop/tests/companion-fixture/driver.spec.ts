import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFixtureRequest, isFixtureResponse } from './wire.ts'

const launch = vi.hoisted(() => ({ child: undefined as unknown }))
vi.mock('node:child_process', () => ({ fork: () => launch.child }))
import { FixtureTransportClosedError, launchCompanionFixture } from './driver.ts'

class Child extends EventEmitter {
  pid: number | undefined = 123
  connected = true
  stderr = new EventEmitter()
  send = vi.fn((_message: unknown, callback: (error: Error | null) => void) => { callback(null) })
  kill = vi.fn(() => true)
  disconnect = vi.fn(() => { this.connected = false; this.emit('disconnect') })
}
function fixture() {
  const child = new Child()
  launch.child = child
  return { child, driver: launchCompanionFixture() }
}
afterEach(() => { vi.useRealTimers() })

describe('suite-local fixture process ownership', () => {
  it('publishes disposal before a synchronous send callback reenters it', async () => {
    const { child, driver } = fixture()
    let reentered: Promise<void> | undefined
    child.send.mockImplementation((message, callback) => {
      if (!isFixtureRequest(message) || message.command.type !== 'dispose') throw new Error('expected dispose command')
      // Reenter once so the unfenced implementation fails without recursive overflow.
      if (child.send.mock.calls.length === 1) reentered = driver.dispose()
      callback(null)
      child.emit('message', { id: message.id, ok: true, value: undefined })
      queueMicrotask(() => { child.emit('exit', 0, null) })
    })
    const disposed = driver.dispose()
    await disposed
    expect(reentered).toBe(disposed)
    expect(child.send).toHaveBeenCalledTimes(1)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it.each(['disconnect-first', 'exit-first'] as const)('reports typed transport closure for %s and joins disposal', async (order) => {
    const { child, driver } = fixture()
    const pending = expect(driver.request({ type: 'codec' })).rejects.toBeInstanceOf(FixtureTransportClosedError)
    if (order === 'disconnect-first') {
      child.disconnect()
      child.emit('exit', 1, null)
    } else {
      child.emit('exit', 1, null)
      child.disconnect()
    }
    await pending
    const disposed = driver.dispose()
    expect(driver.dispose()).toBe(disposed)
    await disposed
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('does not join another child exit after disconnection', async () => {
    const { child, driver } = fixture()
    const unrelated = new Child()
    child.disconnect()
    const done = vi.fn()
    const disposed = driver.dispose()
    void disposed.then(done)
    unrelated.emit('exit', 0, null)
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    child.emit('exit', 0, null)
    await disposed
    expect(done).toHaveBeenCalledTimes(1)
  })

  it.each(['owned-exit', 'deadline'] as const)('retains live process error through %s', async (outcome) => {
    vi.useFakeTimers()
    const { child, driver } = fixture()
    const original = new Error('live process failure')
    child.emit('error', original)
    const disposed = driver.dispose()
    const failed = disposed.catch((error: unknown) => error)
    if (outcome === 'owned-exit') child.emit('exit', 1, null)
    else await vi.advanceTimersByTimeAsync(5_000)
    const aggregate = await failed
    if (!(aggregate instanceof AggregateError)) throw new Error('expected fixture disposal failure')
    expect(aggregate.errors).toContain(original)
    if (outcome === 'deadline') {
      expect(aggregate.errors.some((error: unknown) => error instanceof Error && error.message.includes('quiesce'))).toBe(true)
    }
    expect(driver.dispose()).toBe(disposed)
  })

  it('retains deadline rejection when kill succeeds without exit and an exit arrives later', async () => {
    vi.useFakeTimers()
    const { child, driver } = fixture()
    child.disconnect()
    const disposed = driver.dispose()
    const failed = expect(disposed).rejects.toThrow('disposal failed')
    await vi.advanceTimersByTimeAsync(5_000)
    await failed
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    child.emit('exit', 0, null)
    expect(driver.dispose()).toBe(disposed)
    await expect(driver.dispose()).rejects.toThrow('disposal failed')
  })

  it('settles failed spawn without waiting for an impossible exit', async () => {
    const { child, driver } = fixture()
    child.pid = undefined
    const pending = expect(driver.request({ type: 'codec' })).rejects.toThrow('spawn failed')
    child.emit('error', new Error('spawn failed'))
    await pending
    const disposed = driver.dispose()
    expect(driver.dispose()).toBe(disposed)
    await expect(disposed).rejects.toThrow('spawn failed')
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('rejects pending requests on disconnect and joins exact child exit once', async () => {
    const { child, driver } = fixture()
    const pending = expect(driver.request({ type: 'codec' })).rejects.toThrow('disconnected')
    child.disconnect()
    await pending
    const disposed = driver.dispose()
    expect(driver.dispose()).toBe(disposed)
    child.emit('exit', 0, null)
    await disposed
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('bounds quiescence failure and retains thrown kill failure in repeated disposal', async () => {
    vi.useFakeTimers()
    const { child, driver } = fixture()
    child.connected = false
    child.kill.mockImplementation(() => { throw new Error('kill failed') })
    const disposed = driver.dispose()
    const failed = disposed.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5_000)
    const aggregate = await failed
    if (!(aggregate instanceof AggregateError)) throw new Error('expected fixture disposal failure')
    const causes: unknown = aggregate.errors
    if (!Array.isArray(causes)) throw new Error('expected fixture disposal causes to be an array')
    expect(causes).toHaveLength(2)
    const deadlineError: unknown = causes[0]
    const killError: unknown = causes[1]
    if (!(deadlineError instanceof Error) || !(killError instanceof Error)) {
      throw new Error('expected fixture disposal causes to be errors')
    }
    expect(deadlineError.message).toContain('quiesce')
    expect(killError.message).toBe('kill failed')
    expect(driver.dispose()).toBe(disposed)
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  })

  it.each([null, { id: 1, ok: 'yes' }, { id: 9, ok: true, value: new Uint8Array() }])(
    'rejects malformed or unmatched response %j', async (response) => {
      const { child, driver } = fixture()
      const pending = expect(driver.request({ type: 'codec' })).rejects.toThrow('Companion fixture response')
      child.emit('message', response)
      await pending
      child.emit('exit', 0, null)
      await expect(driver.dispose()).rejects.toThrow('Companion fixture response')
    },
  )

  it('accepts only correlated response envelopes and closed command discriminants', () => {
    expect(isFixtureResponse({ id: 1, ok: true, value: Uint8Array.of(1) })).toBe(true)
    expect(isFixtureResponse({ id: -1, ok: false, error: 'bad' })).toBe(false)
    expect(isFixtureRequest({ id: 1, command: { type: 'settlement', token: 'question' } })).toBe(true)
    expect(isFixtureRequest({ id: 1, command: { type: 'settlement', token: 'other' } })).toBe(false)
    expect(isFixtureRequest({ id: 1, command: { type: 'append', id: 'session', event: 'arbitrary', data: {} } })).toBe(false)
  })
})
