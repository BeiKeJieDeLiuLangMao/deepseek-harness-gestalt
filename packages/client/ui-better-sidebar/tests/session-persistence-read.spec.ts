import { describe, expect, it, vi } from 'vitest'
import {
  SessionId, SessionLogOffset,
  type SessionEvent, type SessionHeader,
} from '@deepseek-ai/dsh-session'
import type {
  SessionAccess, SessionHandle,
} from '@deepseek-ai/dsh-session-persistence'
import type { SidebarSessionPersistenceService } from '../src/context-types.ts'
import {
  readPersistedSession,
  readPersistedSessionCwd,
  tryReadPersistedSessionEvents,
} from '../src/session-persistence-read.ts'

function persistenceReader(events: readonly SessionEvent[], readFailure?: Error) {
  const close = vi.fn(() => Promise.resolve())
  const read = vi.fn(() => readFailure === undefined
    ? Promise.resolve(events)
    : Promise.reject(readFailure))
  const open = vi.fn(async (id: SessionId, access: SessionAccess): Promise<SessionHandle> => ({
    id,
    access,
    header: {
      version: 0,
      id,
      createdAt: 1,
      isSeeded: false,
      cwd: '/workspace',
    } satisfies SessionHeader,
    inheritedEventCount: SessionLogOffset(0),
    read,
    append: () => Promise.resolve(),
    flush: () => Promise.resolve(),
    close,
    [Symbol.asyncDispose]: close,
  }))
  const persistence = {
    open,
    stat: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
  } satisfies SidebarSessionPersistenceService
  return { persistence, open, read, close }
}

describe('persisted sidebar Session reads', () => {
  it('returns formal header and event values after closing the read handle', async () => {
    const sessionId = SessionId('persisted-session')
    const events = [{
      type: 'permission/preset',
      seq: 0,
      time: 1,
      data: { preset: 'read-only' },
    }] as const satisfies readonly SessionEvent[]
    const fixture = persistenceReader(events)

    await expect(readPersistedSession(fixture.persistence, sessionId)).resolves.toEqual({
      meta: expect.objectContaining({ id: sessionId, cwd: '/workspace' }),
      events,
    })
    expect(fixture.open).toHaveBeenCalledWith(sessionId, 'read')
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(fixture.read.mock.invocationCallOrder[0]).toBeLessThan(fixture.close.mock.invocationCallOrder[0]!)
  })

  it('preserves a read failure after closing the handle', async () => {
    const failure = new Error('persisted read failed')
    const fixture = persistenceReader([], failure)

    await expect(readPersistedSession(fixture.persistence, SessionId('persisted-session')))
      .rejects.toBe(failure)
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('reads cold Host-route cwd metadata and closes its handle', async () => {
    const fixture = persistenceReader([])

    await expect(readPersistedSessionCwd(fixture.persistence, SessionId('cold-cwd')))
      .resolves.toBe('/workspace')
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('propagates a cold Host-route cwd failure after closing its handle', async () => {
    const failure = new Error('cwd read failed')
    const fixture = persistenceReader([], failure)

    await expect(readPersistedSessionCwd(fixture.persistence, SessionId('cold-cwd')))
      .rejects.toBe(failure)
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('reads cold Changes events and closes its handle', async () => {
    const events = [{
      type: 'permission/preset',
      seq: 0,
      time: 1,
      data: { preset: 'read-only' },
    }] as const satisfies readonly SessionEvent[]
    const fixture = persistenceReader(events)

    await expect(tryReadPersistedSessionEvents(fixture.persistence, SessionId('cold-changes')))
      .resolves.toBe(events)
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('maps an unavailable cold Changes read to empty after closing its handle', async () => {
    const fixture = persistenceReader([], new Error('changes read failed'))

    await expect(tryReadPersistedSessionEvents(fixture.persistence, SessionId('cold-changes')))
      .resolves.toBeUndefined()
    expect(fixture.close).toHaveBeenCalledOnce()
  })
})
