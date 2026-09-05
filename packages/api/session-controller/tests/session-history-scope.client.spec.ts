/**
 * owned-suffix history display: Host seedLength trims the Client event
 * window without deleting the durable log. Later session/end-seed markers
 * hide themselves and do not raise that floor.
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

  it('keeps owned messages after a later session/end-seed in the snapshot', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'parent answer')
    const forkMarker = endSeed(SessionSeq(parent.length))
    const own = plainTurn(SessionSeq(parent.length + 1), 1, 'side', 'side answer')
    const resumeMarker = endSeed(SessionSeq(parent.length + 1 + own.length))
    const after = plainTurn(SessionSeq(resumeMarker.seq + 1), 2, 'later', 'later answer')
    const api = new FakeApiClient()
    api.historySeedLength = parent.length
    api.onHistory = (payload: { beforeSeq?: number }) => payload.beforeSeq === undefined
      ? Promise.resolve(ok(historyValue(
        [...parent, forkMarker, ...own, resumeMarker, ...after],
        true,
      )))
      : Promise.resolve(ok(historyValue(parent, false)))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })
    await session.open()
    expect(eventSeqs(session)).toEqual([...own, ...after].map(event => event.seq))
    expect(session.getSnapshot().hasMore).toBe(false)
    await session.loadOlder()
    expect(eventSeqs(session)).toEqual([...own, ...after].map(event => event.seq))
    expect(api.callsOf('session.history')).toEqual([])
  })

  it('keeps owned history after a live session/end-seed append', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'parent answer')
    const forkMarker = endSeed(SessionSeq(parent.length))
    const own = plainTurn(SessionSeq(parent.length + 1), 1, 'side', 'side answer')
    const api = new FakeApiClient()
    api.historySeedLength = parent.length
    api.onHistory = () => Promise.resolve(ok(historyValue([...parent, forkMarker, ...own], false)))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })
    await session.open()
    const resumeSeq = SessionSeq(parent.length + 1 + own.length)
    await api.pushFollow(SID, {
      type: 'event',
      event: {
        type: 'session/end-seed',
        seq: resumeSeq,
        time: 1_700_000_000_000 + resumeSeq,
        data: {},
      },
    } as never)
    session.applyHistoryScope()
    expect(eventSeqs(session)).toEqual(own.map(event => event.seq))
  })

  it('keeps a packed own record whose logical range starts at Host seedLength', async () => {
    const parent = plainTurn(SessionSeq(0), 0, 'parent', 'hidden')
    const packed = {
      type: 'chunks' as const,
      event: {
        type: 'chunkrow/text-chunks' as const,
        seq: 6,
        time: 6,
        data: { turn: 1, step: 0, index: 0, texts: ['own'], dt: [0] },
      },
    }
    const api = new FakeApiClient()
    api.historySeedLength = 6
    api.onHistory = () => Promise.resolve(ok({
      records: [
        ...parent.map(event => ({ type: 'event' as const, event: event as never })),
        packed,
      ],
      hasMore: false,
    }))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })
    await session.open()
    expect(session.eventSource.getSnapshot().entries).toEqual([packed])
  })

  it('drops a packed row that starts below Host seedLength instead of splitting it', async () => {
    const packed = {
      type: 'chunks' as const,
      event: {
        type: 'chunkrow/text-chunks' as const,
        seq: 4,
        time: 4,
        data: { turn: 0, step: 0, index: 0, texts: ['a', 'b', 'c'], dt: [0, 0, 0] },
      },
    }
    const own = plainTurn(SessionSeq(7), 1, 'side', 'visible')
    const api = new FakeApiClient()
    api.historySeedLength = 6
    api.onHistory = () => Promise.resolve(ok({
      records: [packed, ...own.map(event => ({ type: 'event' as const, event: event as never }))],
      hasMore: false,
    }))
    const session = new Session(SID, fakeRemote(api), { admission: () => suffixRoute() })
    await session.open()
    expect(eventSeqs(session)).toEqual(own.map(event => event.seq))
  })
})
