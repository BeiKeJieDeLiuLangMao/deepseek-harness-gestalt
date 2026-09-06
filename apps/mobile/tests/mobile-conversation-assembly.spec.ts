// @vitest-environment jsdom
import { createElement, useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseCompanionOperationId,
  parseRelayCredential,
  parseRelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { CompanionForegroundRuntime } from '../src/companion-lifecycle.ts'
import { MobileBrowse } from '../src/MobileBrowse.tsx'
import {
  MobileCompanionSurface,
  type MobileCompanionConnectionChannel,
  type ValidatedDesktopSurfaceResync,
} from '../src/companion-surface.ts'
import { fixedMobilePresentationClock } from '../src/mobile-clock.ts'

afterEach(cleanup)

const grant = {
  routeId: parseRelayRouteId('route-assembly'),
  endpoint: 'mobile' as const,
  credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
  revision: 1,
}

function connectedRuntime(): CompanionForegroundRuntime {
  const runtime = new CompanionForegroundRuntime()
  runtime.configure(grant)
  runtime.markConnectionOpen()
  return runtime
}

function connectionChannel(): MobileCompanionConnectionChannel {
  const mutations = {
    refreshSurface: vi.fn(() => ({
      operationId: parseCompanionOperationId('refresh'), completion: Promise.resolve(),
    })),
    create: vi.fn(() => ({
      operationId: parseCompanionOperationId('create'), completion: Promise.resolve(),
    })),
    submit: vi.fn(() => ({
      operationId: parseCompanionOperationId('submit'), completion: Promise.resolve(),
    })),
    cancel: vi.fn(() => ({
      operationId: parseCompanionOperationId('cancel'), completion: Promise.resolve(),
    })),
    attach: vi.fn(() => ({
      operationId: parseCompanionOperationId('attach'), completion: Promise.resolve(),
    })),
    search: vi.fn(() => ({
      operationId: parseCompanionOperationId('search'), completion: Promise.resolve(),
    })),
    observeSession: vi.fn(() => ({
      operationId: parseCompanionOperationId('observe'), completion: Promise.resolve(),
    })),
    loadOlder: vi.fn(() => ({
      operationId: parseCompanionOperationId('history'), completion: Promise.resolve(),
    })),
    settle: vi.fn(async () => ({ accepted: true as const })),
  }
  return {
    mutations,
    content: { loadImage: vi.fn(async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=') },
  }
}

function desktopResync(): ValidatedDesktopSurfaceResync {
  return {
    type: 'desktop-resync',
    version: 1,
    authenticated: true,
    desktopName: 'Studio Desktop',
    sessions: {
      ids: ['session-one'],
      byId: {
        'session-one': {
          id: 'session-one', title: 'One', displayTitle: 'One',
          running: true, blank: false, updatedAt: 1,
        },
      },
      current: 'session-one',
      phase: 'ready',
      subagentsByParent: {},
      jobsBySession: {},
      currentAddress: null,
    },
    workspaces: [],
    conversations: [{
      sessionId: 'session-one',
      nodes: [
        { kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: 'hello' }], source: {} },
        {
          kind: 'context', seq: 2, time: 2, content: [{ type: 'text', text: 'Injected context' }],
          source: null, provenance: { role: 'inject', label: 'AGENTS.md' }, form: null,
        },
      ],
      turnTimings: [],
      turnEnds: [],
      partial: null,
      runningCalls: [],
      pending: [{
        kind: 'question',
        interactionId: 'question-rpc',
        sessionId: 'session-one',
        payload: {
          questions: [
            { id: 'q1', question: 'Continue?', options: [{ label: 'Yes' }] },
            { id: 'q2', question: 'Notes?' },
          ],
        },
      }],
      queue: [],
      running: true,
      subagent: null,
      composerPhase: 'active',
      removed: false,
      openState: 'open',
      openError: null,
      hasMore: false,
      loadingOlder: false,
      promptError: null,
      blank: false,
      lastAgentError: null,
    }],
  }
}

function AssembledBrowse({
  surface, channel,
}: {
  surface: MobileCompanionSurface
  channel: MobileCompanionConnectionChannel
}) {
  const snapshot = useSyncExternalStore(
    listener => surface.subscribe(listener),
    () => surface.getSnapshot(),
  )
  const conversation = snapshot.conversations[SessionId('session-one')]
  return createElement(MobileBrowse, {
    desktopName: snapshot.desktopName,
    connection: 'online',
    onOpenAccount: () => {},
    sessions: snapshot.sessions,
    workspaces: snapshot.workspaces,
    conversations: snapshot.conversations,
    locale: 'en',
    theme: 'light',
    loadImage: (sessionId, attachment) => channel.content.loadImage(sessionId, attachment),
    canMutate: surface.mayMutate(),
    clock: fixedMobilePresentationClock(1),
    search: snapshot.search,
    onSubmit: (sessionId, text) => surface.submit(sessionId, text),
    onCancel: (sessionId) => { void surface.cancel(sessionId) },
    onLoadOlder: (sessionId) => { void surface.loadOlder(sessionId, conversation?.nodes[0]?.seq) },
  })
}

describe('Mobile Browse conversation assembly', () => {
  it('opens a Desktop JSON projection through Surface into Browse and settles Ask User custom plus skip', async () => {
    const runtime = connectedRuntime()
    const channel = connectionChannel()
    const surface = new MobileCompanionSurface(runtime)
    const receiver = surface.bindAuthenticatedConnection(channel)
    if (receiver === undefined) throw new Error('expected Desktop resync receiver')
    receiver.acceptValidatedDesktopResync(desktopResync())

    render(createElement(AssembledBrowse, { surface, channel }))
    expect(screen.getByRole('heading', { name: 'One' })).toBeTruthy()
    expect(screen.getByText('hello')).toBeTruthy()
    fireEvent.click(screen.getByText('AGENTS.md').closest('[data-expandable]') as HTMLElement)
    expect(screen.getByText('Injected context')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }))
    fireEvent.change(screen.getByPlaceholderText('Type your answer'), { target: { value: 'later' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => { expect(channel.mutations.settle).toHaveBeenCalledOnce() })
    expect(channel.mutations.settle).toHaveBeenCalledWith({
      kind: 'question',
      sessionId: SessionId('session-one'),
      interactionId: 'question-rpc',
      result: {
        ok: true,
        value: {
          answer: {
            answers: [
              { id: 'q1', selected: [] },
              { id: 'q2', selected: [], custom: 'later' },
            ],
          },
        },
      },
    })
  })
})
