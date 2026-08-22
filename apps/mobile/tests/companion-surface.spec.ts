import { describe, expect, it, vi } from 'vitest'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseRelayCredential,
  parseRelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import { CompanionForegroundRuntime } from '../src/companion-lifecycle.ts'
import { MobileCompanionSurface } from '../src/companion-surface.ts'

const grant = {
  routeId: parseRelayRouteId('route-surface'),
  endpoint: 'mobile' as const,
  credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
  revision: 1,
}

describe('MobileCompanionSurface', () => {
  it('does not project a stale generation or transmit any mutation before its replacement resync', () => {
    const runtime = new CompanionForegroundRuntime()
    const mutations = mutationChannel()
    const surface = new MobileCompanionSurface(runtime, mutations)
    runtime.configure(grant)
    runtime.markConnectionOpen()
    const first = surface.bindValidatedDesktopResync()
    if (first === undefined) throw new Error('expected Desktop resync receiver')
    first.acceptValidatedDesktopResync({
      type: 'desktop-resync', version: 1, authenticated: true,
      sessions: [{ id: 'session-first', title: 'First', summary: 'Authenticated' }],
      streaming: false,
    })

    runtime.forgetConnection()
    runtime.markConnectionOpen()
    first.acceptValidatedDesktopResync({
      type: 'desktop-resync', version: 1, authenticated: true,
      sessions: [{ id: 'session-stale', title: 'Stale', summary: 'Rejected' }],
      streaming: true,
    })

    expect(surface.getSnapshot()).toEqual({
      sessions: [{ id: 'session-first', title: 'First', summary: 'Authenticated' }],
      streaming: false,
      search: { query: '', status: 'idle', items: [], hasMore: false },
    })
    expect(() => { surface.create({}) }).toThrow('requires foreground synchronization')
    expect(() => { surface.submit('session-first', 'continue') }).toThrow('requires foreground synchronization')
    expect(() => { surface.cancel('session-first') }).toThrow('requires foreground synchronization')
    expect(() => { surface.attach('session-first', selectedFile()) }).toThrow('requires foreground synchronization')
    expect(() => { surface.search('needle') }).toThrow('requires foreground synchronization')
    expect(() => {
      surface.settle({ operationId: 'approval', kind: 'approval', summary: 'write', authorized: ['once'] })
    }).toThrow('requires foreground synchronization')
    expect(Object.values(mutations).every(mock => mock.mock.calls.length === 0)).toBe(true)
  })

  it('routes mutations only after the current generation accepts its validated projection', () => {
    const runtime = new CompanionForegroundRuntime()
    const mutations = mutationChannel()
    const surface = new MobileCompanionSurface(runtime, mutations)
    runtime.configure(grant)
    runtime.markConnectionOpen()
    const resync = surface.bindValidatedDesktopResync()
    if (resync === undefined) throw new Error('expected Desktop resync receiver')
    resync.acceptValidatedDesktopResync({
      type: 'desktop-resync', version: 1, authenticated: true, sessions: [], streaming: false,
    })

    surface.create({ workspace: 'Work' })
    surface.submit('session-one', 'continue')
    surface.cancel('session-one')
    const file = selectedFile()
    surface.attach('session-one', file)
    surface.search('needle')
    const interaction = { operationId: 'question', kind: 'ask-user' as const, summary: 'Continue?', authorized: ['A'] }
    surface.settle(interaction)

    expect(mutations.create).toHaveBeenCalledWith({ workspace: 'Work' })
    expect(mutations.submit).toHaveBeenCalledWith('session-one', 'continue')
    expect(mutations.cancel).toHaveBeenCalledWith('session-one')
    expect(mutations.attach).toHaveBeenCalledWith('session-one', file)
    expect(mutations.search).toHaveBeenCalledWith('needle')
    expect(mutations.settle).toHaveBeenCalledWith(interaction)
  })

  it('projects only Desktop-authoritative search hits and stable Host failures', () => {
    const runtime = new CompanionForegroundRuntime()
    const surface = new MobileCompanionSurface(runtime, mutationChannel())
    runtime.configure(grant)
    runtime.markConnectionOpen()
    const resync = surface.bindValidatedDesktopResync()
    if (resync === undefined) throw new Error('expected Desktop resync receiver')
    resync.acceptValidatedDesktopResync({
      type: 'desktop-resync', version: 1, authenticated: true,
      sessions: [
        { id: 'session-hit', title: 'Indexed', summary: 'metadata does not contain query' },
        { id: 'session-local-only', title: 'needle in title', summary: 'must not be searched locally' },
      ],
      streaming: false,
    })
    surface.search('needle')
    expect(surface.getSnapshot().search).toEqual({ query: 'needle', status: 'loading', items: [], hasMore: false })
    surface.acceptValidatedCompanionResult({
      type: 'session-search',
      operationId: parseCompanionOperationId('search-needle'),
      items: [{ sessionId: parseCompanionSessionId('session-hit'), snippet: 'Desktop indexed needle' }],
      hasMore: false,
    })
    expect(surface.getSnapshot().search).toEqual({
      query: 'needle',
      status: 'ready',
      items: [{ sessionId: 'session-hit', snippet: 'Desktop indexed needle' }],
      hasMore: false,
    })
    surface.acceptValidatedCompanionResult({
      type: 'operation-failed',
      operationId: parseCompanionOperationId('search-needle'),
      failure: { kind: 'http', code: 'HOST_HTTP_STATUS', message: 'Desktop Host returned HTTP 400', status: 400 },
    })
    expect(surface.getSnapshot().search).toMatchObject({
      status: 'error',
      error: { kind: 'http', code: 'HOST_HTTP_STATUS', status: 400 },
    })
  })
})

function mutationChannel() {
  return {
    create: vi.fn(),
    submit: vi.fn(),
    cancel: vi.fn(),
    attach: vi.fn(),
    search: vi.fn(() => parseCompanionOperationId('search-needle')),
    settle: vi.fn(),
  }
}

function selectedFile(): File {
  return { name: 'notes.txt', arrayBuffer: async () => new ArrayBuffer(0) } as File
}
