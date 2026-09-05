/**
 * owned-suffix history display: Host seedLength / last session/end-seed
 * trim the Client event window without deleting the durable log.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { Session } from '../src/client/sessions/session.ts'
import { ClientSessions } from '../src/client/sessions/service.ts'
import type { SessionAdmissionRoute } from '../src/client/contract/admission.ts'
import { FakeApiClient, fakeRemote, ok } from './fake-api.client.ts'
import { historyValue, plainTurn } from './event-script.client.ts'

const SID = 'fk-sidechat' as SessionId
const ORDINARY = 'fk-ordinary' as SessionId

function eventSeqs(session: Session): number[] {
  return session.eventSource.getSnapshot().entries.map(entry => entry.event.seq)
}

function endSeed(seq: SessionSeq): SessionEvent {
  return {
    type: 'session/end-seed',
    seq,
    time: 1_700_000_000_000 + seq,
    data: {},
  } as SessionEvent
}

function suffixRoute(): SessionAdmissionRoute {
  return {
    prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    historyScope: 'owned-suffix',
  }
}

describe('Session owned-suffix history', () => {
  it('hides the inherited prefix and stops paging into the parent seed', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'parent answer')
    const marker = endSeed(SessionSeq(parent.length))
    const own = plainTurn(SessionSeq(parent.length + 1), 1, 'side', 'side answer')
    const api = new FakeApiClient()
    api.historySeedLength = parent.length + 1
    api.onHistory = (payload: { beforeSeq?: number }) => payload.beforeSeq === undefined
      ? Promise.resolve(ok(historyValue([...parent, marker, ...own], true)))
      : Promise.resolve(ok(historyValue(parent, false)))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })

    await session.open()
    expect(eventSeqs(session)).toEqual(own.map(event => event.seq))
    expect(session.getSnapshot().hasMore).toBe(false)

    await session.loadOlder()
    expect(eventSeqs(session)).toEqual(own.map(event => event.seq))
    expect(api.callsOf('session.history')).toEqual([])
  })

  it('uses Host seedLength when the opening page omits session/end-seed', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'hidden')
    const own = plainTurn(SessionSeq(6), 1, 'side', 'visible')
    const api = new FakeApiClient()
    api.historySeedLength = 6
    api.onHistory = () => Promise.resolve(ok(historyValue([...parent, ...own], false)))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })

    await session.open()
    expect(eventSeqs(session)).toEqual(own.map(event => event.seq))
  })

  it('leaves an ordinary Session window complete', async () => {
    const page = plainTurn(SessionSeq(0), 0, 'ask', 'answer')
    const api = new FakeApiClient()
    api.onHistory = () => Promise.resolve(ok(historyValue(page, false)))
    const session = new Session(ORDINARY, fakeRemote(api))
    await session.open()
    expect(eventSeqs(session)).toEqual(page.map(event => event.seq))
    expect(session.getSnapshot().hasMore).toBe(false)
  })

  it('applies late register and restore after revoke without reopening', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'parent answer')
    const marker = endSeed(SessionSeq(parent.length))
    const own = plainTurn(SessionSeq(parent.length + 1), 1, 'side', 'side answer')
    const ctx = new Context()
    const api = new FakeApiClient()
    api.historySeedLength = parent.length + 1
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId: SID, updatedAt: 100, running: false, blank: false }],
    }))
    api.onHistory = () => Promise.resolve(ok(historyValue([...parent, marker, ...own], true)))
    const svc = new ClientSessions(ctx, fakeRemote(api))
    await svc.refresh()
    const binding = svc.binding(SID)!
    await binding.session.open()
    const seqs = () => binding.eventSource.getSnapshot().entries.map(entry => entry.event.seq)
    expect(seqs()).toEqual([...parent, marker, ...own].map(event => event.seq))

    const drop = svc.registerAdmission(SID, suffixRoute())
    expect(seqs()).toEqual(own.map(event => event.seq))
    expect(binding.session.getSnapshot().hasMore).toBe(false)

    drop()
    expect(seqs()).toEqual([...parent, marker, ...own].map(event => event.seq))
    expect(binding.session.getSnapshot().hasMore).toBe(true)
  })

  it('keeps the owned suffix after resync while admission remains registered', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'parent answer')
    const marker = endSeed(SessionSeq(parent.length))
    const own = plainTurn(SessionSeq(parent.length + 1), 1, 'side', 'side answer')
    const api = new FakeApiClient()
    api.historySeedLength = parent.length + 1
    api.onHistory = () => Promise.resolve(ok(historyValue([...parent, marker, ...own], true)))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })
    await session.open()
    await session.resync()
    expect(eventSeqs(session)).toEqual(own.map(event => event.seq))
    expect(session.getSnapshot().hasMore).toBe(false)
  })
})
