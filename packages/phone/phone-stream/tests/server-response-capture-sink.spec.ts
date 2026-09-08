import { EventEmitter, getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@deepseek-ai/dsh-host-webserver/http'
import { PhoneDevicesError } from '@deepseek-ai/dsh-phone-runtime'
import { ServerResponseCaptureSink } from '../src/server-response-capture-sink.ts'

class FakeResponse extends EventEmitter {
  headersSent = false
  writableFinished = false
  readonly writeHead = vi.fn(() => { this.headersSent = true })
  readonly write = vi.fn(() => false)
  readonly end = vi.fn((_data?: unknown) => { this.writableFinished = true })
  readonly destroy = vi.fn()
}

function expectPendingListeners(response: FakeResponse, signal: AbortSignal): void {
  expect(response.listenerCount('drain')).toBe(1)
  expect(response.listenerCount('close')).toBe(1)
  expect(response.listenerCount('error')).toBe(1)
  expect(getEventListeners(signal, 'abort')).toHaveLength(1)
}
function expectNoListeners(response: FakeResponse, signal: AbortSignal): void {
  expect(response.listenerCount('drain')).toBe(0)
  expect(response.listenerCount('close')).toBe(0)
  expect(response.listenerCount('error')).toBe(0)
  expect(getEventListeners(signal, 'abort')).toHaveLength(0)
}

describe('ServerResponseCaptureSink', () => {
  it('resolves drain and removes every listener', async () => {
    const response = new FakeResponse(); const signal = new AbortController()
    const writing = new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)
    expectPendingListeners(response, signal.signal)
    response.emit('drain'); await writing
    expectNoListeners(response, signal.signal)
  })

  it('resolves expected abort and removes every listener', async () => {
    const response = new FakeResponse(); const signal = new AbortController()
    const writing = new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)
    expectPendingListeners(response, signal.signal)
    const reason = new Error('stop'); signal.abort(reason); await expect(writing).rejects.toBe(reason)
    expectNoListeners(response, signal.signal)
  })

  it('normalizes an abort without an Error reason', async () => {
    const response = new FakeResponse(); const signal = new AbortController()
    const writing = new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)
    signal.abort('operator stop')
    await expect(writing).rejects.toThrow('capture response aborted')
    expectNoListeners(response, signal.signal)
  })

  it('rejects response close and removes every listener', async () => {
    const response = new FakeResponse(); const signal = new AbortController()
    const writing = new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)
    expectPendingListeners(response, signal.signal)
    response.emit('close')
    await expect(writing).rejects.toThrow('capture response closed before drain')
    expectNoListeners(response, signal.signal)
  })

  it('rejects the exact response error and removes every listener', async () => {
    const response = new FakeResponse(); const signal = new AbortController(); const error = new Error('failed')
    const writing = new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)
    expectPendingListeners(response, signal.signal)
    response.emit('error', error)
    await expect(writing).rejects.toBe(error)
    expectNoListeners(response, signal.signal)
  })

  it('installs no listeners for a pre-aborted signal', async () => {
    const response = new FakeResponse(); const signal = new AbortController(); const reason = new Error('stop'); signal.abort(reason)
    await expect(new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)).rejects.toBe(reason)
    expectNoListeners(response, signal.signal)
  })


  it('contains an abort fired synchronously during listener registration', async () => {
    const response = new FakeResponse(); const controller = new AbortController(); const reason = new Error('stop')
    const original = response.once.bind(response)
    response.once = ((event: string, listener: (...args: unknown[]) => void) => {
      const result = original(event, listener)
      if (event === 'error') controller.abort(reason)
      return result
    }) as typeof response.once
    await expect(new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), controller.signal)).rejects.toBe(reason)
    expectNoListeners(response, controller.signal)
  })

  it('installs no listeners when response accepts the write', async () => {
    const response = new FakeResponse(); response.write.mockReturnValueOnce(true)
    const signal = new AbortController()
    await new ServerResponseCaptureSink(response as never, false).write(Uint8Array.of(1), signal.signal)
    expectNoListeners(response, signal.signal)
  })

  it('ends normally, maps pre-header failure, and destroys post-header failure or abort', () => {
    const normal = new FakeResponse(); new ServerResponseCaptureSink(normal as never, false).end()
    expect(normal.end).toHaveBeenCalledOnce(); expect(normal.destroy).not.toHaveBeenCalled()
    const early = new FakeResponse(); new ServerResponseCaptureSink(early as never, false).fail(new Error('failed'))
    expect(early.writeHead).toHaveBeenCalled(); expect(early.destroy).not.toHaveBeenCalled()
    const late = new FakeResponse(); late.headersSent = true; const lateError = new Error('failed'); new ServerResponseCaptureSink(late as never, false).fail(lateError)
    expect(late.destroy).toHaveBeenCalledWith(lateError)
    const aborted = new FakeResponse(); new ServerResponseCaptureSink(aborted as never, false).abort()
    expect(aborted.destroy).toHaveBeenCalledWith(); expect(aborted.writeHead).not.toHaveBeenCalled()
  })

  it('exposes raw and normalized multipart content types', () => {
    const raw = new FakeResponse(); new ServerResponseCaptureSink(raw as never, false).expose('video/h264')
    expect(raw.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'content-type': 'video/h264' }))
    const multipart = new FakeResponse(); new ServerResponseCaptureSink(multipart as never, true).expose('ignored')
    expect(multipart.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'content-type': 'multipart/x-mixed-replace; boundary=frame',
    }))
  })

  it('maps protocol and fleet failures before headers', () => {
    const cases: ReadonlyArray<readonly [unknown, number, string, string]> = [
      [new HttpError(418, 'teapot', 'short and stout'), 418, 'teapot', 'short and stout'],
      [new PhoneDevicesError('PHONE_DEVICE_NOT_FOUND', 'missing'), 404, 'not-found', 'missing'],
      [new PhoneDevicesError('PHONE_AGENT_PROFILE_REQUIRED', 'profile required'), 409, 'PHONE_AGENT_PROFILE_REQUIRED', 'profile required'],
      [new PhoneDevicesError('PHONE_REAL_DEVICE_ISSUE', 'locked', { issue: 'device-locked' }), 502, 'PHONE_REAL_DEVICE_ISSUE', 'locked'],
      ['upstream refused', 502, 'upstream', 'upstream refused'],
    ]
    for (const [failure, status, code, message] of cases) {
      const response = new FakeResponse()
      new ServerResponseCaptureSink(response as never, false).fail(failure)
      expect(response.writeHead).toHaveBeenCalledWith(status, expect.any(Object))
      expect(JSON.parse(String(response.end.mock.calls[0]?.[0]))).toMatchObject({ error: { code, message } })
    }
  })

  it('destroys a post-header response without forwarding a non-Error cause', () => {
    const response = new FakeResponse(); response.headersSent = true
    new ServerResponseCaptureSink(response as never, false).fail('late failure')
    expect(response.destroy).toHaveBeenCalledWith(undefined)
  })
})
