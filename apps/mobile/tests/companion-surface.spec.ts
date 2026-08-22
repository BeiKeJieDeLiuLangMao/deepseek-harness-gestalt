import { describe, expect, it, vi } from 'vitest'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { CompanionForegroundRuntime } from '../src/companion-lifecycle.ts'
import {
  MobileCompanionSurface,
  type MobileCompanionConnectionChannel,
  type ValidatedDesktopSurfaceResync,
} from '../src/companion-surface.ts'

const grant = {
  routeId: parseRelayRouteId('route-surface'),
  endpoint: 'mobile' as const,
  credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
  revision: 1,
}

describe('MobileCompanionSurface', () => {
  it('round-trips an explicit JSON projection without Maps, classes, or callbacks', () => {
    const dto = projection('session-one', 'One', true)
    const parsed = JSON.parse(JSON.stringify(dto)) as ValidatedDesktopSurfaceResync
    expect(parsed).toEqual(dto)
    expect(parsed.conversations[0]?.turnTimings).toEqual([])
    expect(parsed.conversations[0]?.pending[0]).toEqual({
      kind: 'approval', interactionId: 'approval-rpc', sessionId: 'session-one',
      payload: { approvalId: 'approval-id', toolName: 'write', reason: 'Allow write' },
    })
  })

  it('rejects class-backed values before they can synchronize a connection', () => {
    const runtime = connectedRuntime()
    const surface = new MobileCompanionSurface(runtime)
    const receiver = surface.bindAuthenticatedConnection(connectionChannel())
    if (receiver === undefined) throw new Error('expected Desktop resync receiver')
    const invalid = projection('session-one', 'One') as unknown as { conversations: unknown }
    invalid.conversations = new Map()

    expect(() => {
      receiver.acceptValidatedDesktopResync(invalid as ValidatedDesktopSurfaceResync)
    }).toThrow('must contain only JSON-compatible values')
    expect(runtime.getState().synchronized).toBe(false)
  })

  it('does not synchronize when a JSON projection cannot build presentation carriers', () => {
    const runtime = connectedRuntime()
    const surface = new MobileCompanionSurface(runtime)
    const receiver = surface.bindAuthenticatedConnection(connectionChannel())
    if (receiver === undefined) throw new Error('expected Desktop resync receiver')
    const invalid = { ...projection('session-one', 'One'), sessions: null }

    expect(() => {
      receiver.acceptValidatedDesktopResync(invalid as unknown as ValidatedDesktopSurfaceResync)
    }).toThrow()
    expect(runtime.getState().synchronized).toBe(false)
    expect(surface.mayMutate()).toBe(false)
  })

  it('binds projection, content, and mutation channels to one physical connection generation', () => {
    const runtime = connectedRuntime()
    const firstChannel = connectionChannel()
    const surface = new MobileCompanionSurface(runtime)
    const first = surface.bindAuthenticatedConnection(firstChannel)
    if (first === undefined) throw new Error('expected Desktop resync receiver')
    first.acceptValidatedDesktopResync(projection('session-first', 'First'))
    surface.submit('session-first', 'continue')

    runtime.forgetConnection()
    runtime.markConnectionOpen()
    first.acceptValidatedDesktopResync(projection('session-stale', 'Stale'))
    expect(() => { surface.submit('session-first', 'stale') }).toThrow('requires foreground synchronization')

    const replacementChannel = connectionChannel()
    const replacement = surface.bindAuthenticatedConnection(replacementChannel)
    if (replacement === undefined) throw new Error('expected replacement resync receiver')
    replacement.acceptValidatedDesktopResync(projection('session-replacement', 'Replacement'))
    surface.submit('session-replacement', 'current')

    expect(firstChannel.mutations.submit).toHaveBeenCalledTimes(1)
    expect(firstChannel.mutations.submit).toHaveBeenCalledWith('session-first', 'continue')
    expect(replacementChannel.mutations.submit).toHaveBeenCalledOnce()
    expect(replacementChannel.mutations.submit).toHaveBeenCalledWith('session-replacement', 'current')
    expect(surface.getSnapshot().sessions.ids).toEqual(['session-replacement'])
  })

  it('adapts pending ids and data into local responders and returns carrier receipts', async () => {
    const runtime = connectedRuntime()
    const channel = connectionChannel()
    channel.mutations.settle.mockResolvedValueOnce({ accepted: true })
      .mockResolvedValueOnce({ accepted: false, reason: 'not-pending' })
    const surface = new MobileCompanionSurface(runtime)
    const receiver = surface.bindAuthenticatedConnection(channel)
    if (receiver === undefined) throw new Error('expected Desktop resync receiver')
    receiver.acceptValidatedDesktopResync(projection('session-one', 'One', true))

    const conversation = surface.getSnapshot().conversations['session-one' as SessionId]
    const approval = conversation?.pending[0]
    const question = conversation?.pending[1]
    if (approval === undefined || question === undefined) throw new Error('expected adapted pending interactions')
    const approvalResult = { ok: true as const, value: { outcome: 'allowed-once' } }
    const questionResult = { ok: true as const, value: { answers: [{ id: 'q1', selected: ['Yes'] }] } }

    await expect(approval.respond(approvalResult)).resolves.toEqual({ accepted: true })
    await expect(question.respond(questionResult)).resolves.toEqual({ accepted: false, reason: 'not-pending' })
    expect(channel.mutations.settle).toHaveBeenNthCalledWith(1, {
      kind: 'approval', sessionId: 'session-one', interactionId: 'approval-rpc', result: approvalResult,
    })
    expect(channel.mutations.settle).toHaveBeenNthCalledWith(2, {
      kind: 'question', sessionId: 'session-one', interactionId: 'question-rpc', result: questionResult,
    })
  })

  it('refuses an old local responder after a replacement generation synchronizes', async () => {
    const runtime = connectedRuntime()
    const firstChannel = connectionChannel()
    const surface = new MobileCompanionSurface(runtime)
    const first = surface.bindAuthenticatedConnection(firstChannel)
    if (first === undefined) throw new Error('expected Desktop resync receiver')
    first.acceptValidatedDesktopResync(projection('session-one', 'One', true))
    const oldWait = surface.getSnapshot().conversations['session-one' as SessionId]?.pending[0]
    if (oldWait === undefined) throw new Error('expected old pending interaction')

    runtime.forgetConnection()
    runtime.markConnectionOpen()
    const replacementChannel = connectionChannel()
    const replacement = surface.bindAuthenticatedConnection(replacementChannel)
    if (replacement === undefined) throw new Error('expected replacement resync receiver')
    replacement.acceptValidatedDesktopResync(projection('session-two', 'Two'))

    await expect(oldWait.respond({ ok: true, value: { outcome: 'allowed-once' } }))
      .rejects.toThrow('stale connection generation')
    expect(firstChannel.mutations.settle).not.toHaveBeenCalled()
    expect(replacementChannel.mutations.settle).not.toHaveBeenCalled()
  })

  it('addresses history loading through the current generation only', () => {
    const runtime = connectedRuntime()
    const firstChannel = connectionChannel()
    const surface = new MobileCompanionSurface(runtime)
    const first = surface.bindAuthenticatedConnection(firstChannel)
    if (first === undefined) throw new Error('expected Desktop resync receiver')
    first.acceptValidatedDesktopResync(projection('session-one', 'One'))
    surface.loadOlder('session-one')
    expect(firstChannel.mutations.loadOlder).toHaveBeenCalledWith('session-one')

    runtime.forgetConnection()
    runtime.markConnectionOpen()
    expect(() => { surface.loadOlder('session-one') }).toThrow('requires foreground synchronization')
  })
})

function connectedRuntime(): CompanionForegroundRuntime {
  const runtime = new CompanionForegroundRuntime()
  runtime.configure(grant)
  runtime.markConnectionOpen()
  return runtime
}

function connectionChannel() {
  const mutations = {
    create: vi.fn<MobileCompanionConnectionChannel['mutations']['create']>(),
    submit: vi.fn<MobileCompanionConnectionChannel['mutations']['submit']>(),
    cancel: vi.fn<MobileCompanionConnectionChannel['mutations']['cancel']>(),
    attach: vi.fn<MobileCompanionConnectionChannel['mutations']['attach']>(),
    loadOlder: vi.fn<MobileCompanionConnectionChannel['mutations']['loadOlder']>(),
    settle: vi.fn<MobileCompanionConnectionChannel['mutations']['settle']>(),
  }
  return {
    mutations,
    content: { loadImage: vi.fn(async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=') },
  } satisfies MobileCompanionConnectionChannel
}

function projection(id: string, title: string, pending = false): ValidatedDesktopSurfaceResync {
  return {
    type: 'desktop-resync',
    version: 1,
    authenticated: true,
    desktopName: `${title} Desktop`,
    sessions: {
      ids: [id],
      byId: {
        [id]: { id, title, displayTitle: title, running: pending, blank: false, updatedAt: 1 },
      },
      current: null,
      phase: 'ready',
      subagentsByParent: {},
      jobsBySession: {},
      currentAddress: null,
    },
    workspaces: [],
    conversations: [{
      sessionId: id,
      nodes: [],
      turnTimings: [],
      turnEnds: [],
      partial: null,
      runningCalls: [],
      pending: pending
        ? [{
          kind: 'approval', interactionId: 'approval-rpc', sessionId: id,
          payload: { approvalId: 'approval-id' as never, toolName: 'write', reason: 'Allow write' },
        }, {
          kind: 'question', interactionId: 'question-rpc', sessionId: id,
          payload: { questions: [{ id: 'q1', question: 'Continue?', options: [{ label: 'Yes' }] }] },
        }]
        : [],
      queue: [],
      running: pending,
      subagent: null,
      composerPhase: 'active',
      removed: false,
      openState: 'open',
      openError: null,
      hasMore: true,
      loadingOlder: false,
      promptError: null,
      blank: false,
      lastAgentError: null,
    }],
  }
}
