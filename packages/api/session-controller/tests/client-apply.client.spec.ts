import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import type {
  ConnectionGeneration,
  ConnectionHandle,
} from '@deepseek-ai/dsh-client-connection/client'
import {
  RemoteStreamCarrierError,
  RemoteStream,
  type RemoteStreamOptions,
} from '@deepseek-ai/dsh-api-gateway/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SessionClient from '../src/client/index.ts'
import { ClientSessions } from '../src/client/sessions/service.ts'
import { ReceivingQuestionBook } from '../src/client/sessions/receiving.ts'
import { FakeApiClient, fakeRemote } from './fake-api.client.ts'

const GENERATION: ConnectionGeneration = { id: 1, host: { home: '/home/fixture' } }

const sid = (value: string): SessionId => value as SessionId

type RemoteListener = (...args: never[]) => void

interface Bench {
  readonly ctx: Context
  readonly api: FakeApiClient
  readonly fiber: Fiber
  readonly sessions: ClientSessions
  readonly memberQuestion: {
    snapshot: ReturnType<typeof vi.fn>
    settle: ReturnType<typeof vi.fn>
  }
  dispatch(event: string, ...args: unknown[]): void
  publishGeneration(generation: ConnectionGeneration | undefined): void
}

const contexts = new Set<Context>()

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([...contexts].map(async (ctx) => { await ctx.fiber.dispose() }))
  contexts.clear()
})

async function mount(initialGeneration?: ConnectionGeneration): Promise<Bench> {
  const ctx = new Context()
  contexts.add(ctx)
  await ctx.plugin(TypertRegistry)
  const api = new FakeApiClient()
  const remote = fakeRemote(api)
  const listeners = new Map<string, Set<RemoteListener>>()
  const generationListeners = new Set<() => void>()
  let generation = initialGeneration
  const connection: ConnectionHandle = {
    isLoopback: true,
    generation: {
      getSnapshot: () => generation,
      subscribe: (listener) => {
        generationListeners.add(listener)
        return () => { generationListeners.delete(listener) }
      },
    },
    state: { getSnapshot: () => 'connected' as const, subscribe: () => () => {} },
    rpc: {
      call: () => Promise.reject(new Error('unexpected generic RPC call')),
    },
    reconnect: () => {},
    registerGenerationSource: () => () => {},
    start: () => ({ stop: () => {} }),
  }
  const memberQuestion = {
    snapshot: vi.fn(async () => ({ ok: true as const, value: { revision: 0, pending: [], terminal: [] } })),
    settle: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'unused', message: 'unused', details: {} },
    })),
  }
  ctx.reflect.provide('remote', {
    ...remote,
    memberQuestion,
    $stream: <Item>(options: RemoteStreamOptions<Item>) => (
      new RemoteStream(connection, options)
    ),
    get $host() {
      return { home: generation?.host.home, isLoopback: connection.isLoopback }
    },
    $on: (event: string, listener: RemoteListener) => {
      const eventListeners = listeners.get(event) ?? new Set<RemoteListener>()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
      return () => { eventListeners.delete(listener) }
    },
  })
  ctx.reflect.provide('remote.commands', remote.commands)
  ctx.reflect.provide('remote.session', remote.session)
  ctx.reflect.provide('remote.subagents', remote.subagents)
  ctx.reflect.provide('remote.memberQuestion', memberQuestion)
  const fiber = ctx.plugin(SessionClient)
  await fiber
  const sessions = ctx.sessions as ClientSessions
  return {
    ctx,
    api,
    fiber,
    sessions,
    memberQuestion,
    dispatch: (event, ...args) => {
      for (const listener of listeners.get(event) ?? []) listener(...args as never[])
    },
    publishGeneration: (next) => {
      generation = next
      for (const listener of [...generationListeners]) listener()
    },
  }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index++) await Promise.resolve()
}

describe('Session Controller Client apply', () => {
  it('injects every required generated Remote namespace including memberQuestion', () => {
    expect(SessionClient.inject).toEqual([
      'typert',
      'remote',
      'remote.commands',
      'remote.session',
      'remote.subagents',
      'remote.memberQuestion',
    ])
  })

  it('registers receivingQuestions through Cordis and unloads it with the fiber', async () => {
    const bench = await mount()
    expect(bench.ctx.receivingQuestions).toBeInstanceOf(ReceivingQuestionBook)
    expect(bench.ctx.get('receivingQuestions')).toBe(bench.ctx.receivingQuestions)
    const book = bench.ctx.receivingQuestions
    await vi.waitFor(() => {
      expect(bench.memberQuestion.snapshot).toHaveBeenCalled()
    })
    await bench.fiber.dispose()
    expect(bench.ctx.get('receivingQuestions')).toBeUndefined()
    await expect(book.decline('receiving-host-1' as SessionId)).rejects.toThrow(/disposed/)
  })

  it('forwards dock settle through the registered book onto generated Remote', async () => {
    const bench = await mount()
    const sessionId = sid('receiving-host-1')
    bench.memberQuestion.snapshot.mockResolvedValue({
      ok: true,
      value: {
        revision: 1,
        pending: [{
          questionId: 'question-1',
          receivingSessionId: sessionId,
          receivingAccountId: 'account-receiver',
          revision: 1,
          arrivedAt: 100,
          operation: {
            type: 'member-question',
            operationId: 'operation-1',
            questionId: 'question-1',
            projectId: 'project-1',
            originSessionId: 'origin-session-1',
            expiresAt: 10_000,
            origin: {
              projectName: 'Atlas',
              originSessionTitle: 'Release decision',
              askerAccountId: 'account-alice',
              askerRole: 'owner',
              askerDisplayName: 'Alice',
              askerAvatarUrl: 'https://example.com/alice.png',
            },
            background: 'Choose the launch channel.',
            questions: [{ id: 'channel', question: 'Which channel?', options: [{ label: 'Canary' }] }],
            references: [],
          },
        }],
        terminal: [],
      },
    })
    await bench.ctx.receivingQuestions.refresh()
    bench.memberQuestion.settle.mockResolvedValue({
      ok: true,
      value: {
        type: 'member-question-settled',
        operationId: 'operation-1',
        questionId: 'question-1',
        outcome: 'answered',
        settledAt: 500,
        settledByInstallationId: 'installation-a',
        settledByDeviceName: 'Desk A',
        answers: [{ id: 'channel', selected: ['Canary'] }],
      },
    })
    await bench.ctx.receivingQuestions.settle(sessionId, [
      { id: 'channel', selected: ['Canary'] },
    ])
    expect(bench.memberQuestion.settle).toHaveBeenCalledWith({
      receivingSessionId: sessionId,
      revision: 1,
      questionId: 'question-1',
      response: { kind: 'answered', answers: [{ id: 'channel', selected: ['Canary'] }] },
    })
  })

  it('lets a receivingQuestions consumer bind dock settle onto the registered book', async () => {
    const bench = await mount()
    const sessionId = sid('receiving-host-1')
    bench.memberQuestion.snapshot.mockResolvedValue({
      ok: true,
      value: {
        revision: 1,
        pending: [{
          questionId: 'question-1',
          receivingSessionId: sessionId,
          receivingAccountId: 'account-receiver',
          revision: 1,
          arrivedAt: 100,
          operation: {
            type: 'member-question',
            operationId: 'operation-1',
            questionId: 'question-1',
            projectId: 'project-1',
            originSessionId: 'origin-session-1',
            expiresAt: 10_000,
            origin: {
              projectName: 'Atlas',
              originSessionTitle: 'Release decision',
              askerAccountId: 'account-alice',
              askerRole: 'owner',
              askerDisplayName: 'Alice',
              askerAvatarUrl: 'https://example.com/alice.png',
            },
            background: 'Choose the launch channel.',
            questions: [{ id: 'channel', question: 'Which channel?', options: [{ label: 'Canary' }] }],
            references: [],
          },
        }],
        terminal: [],
      },
    })
    await bench.ctx.receivingQuestions.refresh()
    bench.memberQuestion.settle.mockResolvedValue({
      ok: true,
      value: {
        type: 'member-question-settled',
        operationId: 'operation-1',
        questionId: 'question-1',
        outcome: 'answered',
        settledAt: 500,
        settledByInstallationId: 'installation-a',
        settledByDeviceName: 'Desk A',
        answers: [{ id: 'channel', selected: ['Canary'] }],
      },
    })
    let injected: ((answers: { id: string; selected: string[] }[]) => Promise<void>) | undefined
    const consumer = bench.ctx.plugin({
      inject: ['receivingQuestions'],
      apply: (ctx) => {
        injected = answers => ctx.receivingQuestions.settle(sessionId, answers)
      },
    })
    await consumer
    expect(bench.ctx.get('receivingQuestions')).toBe(bench.ctx.receivingQuestions)
    await injected!([{ id: 'channel', selected: ['Canary'] }])
    expect(bench.memberQuestion.settle).toHaveBeenCalledWith({
      receivingSessionId: sessionId,
      revision: 1,
      questionId: 'question-1',
      response: { kind: 'answered', answers: [{ id: 'channel', selected: ['Canary'] }] },
    })
  })

  it('routes Session Remote Events and connection generations into the object layer', async () => {
    const connected = vi.spyOn(ClientSessions.prototype, 'handleConnected')
    const error = vi.spyOn(ClientSessions.prototype, 'handleSessionError')
    const bench = await mount()
    expect(connected).not.toHaveBeenCalled()

    bench.dispatch('api-session/added', {
      sessionId: sid('session-1'),
      updatedAt: 1,
      running: false,
      blank: true,
    })
    await flush()
    expect(bench.sessions.list.getSnapshot().byId[sid('session-1')]).toMatchObject({
      running: false,
      updatedAt: 1,
    })

    bench.dispatch('api-session/status', sid('session-1'), true)
    bench.dispatch('api-session/activity', sid('session-1'), 9)
    bench.dispatch('api-session/error', sid('session-1'), 'agent failed')
    await flush()
    expect(bench.sessions.list.getSnapshot().byId[sid('session-1')]).toMatchObject({
      running: true,
      updatedAt: 9,
    })
    expect(error).toHaveBeenCalledWith(sid('session-1'), 'agent failed')

    bench.dispatch('api-session/removed', sid('session-1'))
    await flush()
    expect(bench.sessions.list.getSnapshot().byId[sid('session-1')]).toBeUndefined()

    bench.ctx.emit('connection/reset')
    expect(connected).toHaveBeenCalledOnce()
  })

  it('accepts the control baseline, retries a carrier generation, and reports terminal protocol failure', async () => {
    const accept = vi.spyOn(ClientSessions.prototype, 'handleControlFrame')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bench = await mount(GENERATION)
    await flush()

    expect(accept).toHaveBeenCalledWith({
      type: 'baseline',
      value: { queues: {}, jobs: {}, projections: {} },
    })

    bench.api.failStreams(new RemoteStreamCarrierError('generation lost'))
    await flush()
    expect(accept.mock.calls.filter(([frame]) => frame.type === 'baseline')).toHaveLength(2)

    bench.api.pushControl({ type: 'baseline', value: bench.api.controlBaseline } as never)
    await vi.waitFor(() => {
      expect(logged).toHaveBeenCalledWith(
        '[session-controller] control stream failed:',
        expect.objectContaining({ message: 'session control stream emitted more than one opening snapshot' }),
      )
    })
  })

  it('materializes Host-addressed Agent scopes before the Session list arrives', async () => {
    const bench = await mount()
    const adapter = bench.ctx.typert.contexts.getClient('agent')
    const first = adapter?.resolve(sid('agent-early'))

    expect(first).toBeDefined()
    expect(bench.sessions.scopeOf(first as Context)).toBe(sid('agent-early'))
    expect(adapter?.resolve(sid('agent-early'))).toBe(first)
  })

  it('projects Agent Context identity in both directions and withdraws the adapter on disposal', async () => {
    const bench = await mount(GENERATION)
    await flush()
    expect(bench.sessions.list.getSnapshot().phase).toBe('ready')

    bench.dispatch('api-session/added', {
      sessionId: sid('agent-1'),
      updatedAt: 1,
      running: false,
      blank: true,
    })
    await flush()
    const scoped = bench.sessions.scope(sid('agent-1'))
    const adapter = bench.ctx.typert.contexts.getClient('agent')
    expect(scoped).toBeDefined()
    expect(adapter?.identity(bench.ctx)).toBeUndefined()
    expect(adapter?.identity(scoped!)).toBe(sid('agent-1'))
    expect(adapter?.resolve(sid('agent-1'))).toBe(scoped)

    await bench.fiber.dispose()
    expect(bench.ctx.typert.contexts.getClient('agent')).toBeUndefined()
  })

  it('waits for a Host generation before retrying the control stream', async () => {
    const accept = vi.spyOn(ClientSessions.prototype, 'handleControlFrame')
    const bench = await mount()
    await flush()
    expect(accept.mock.calls.filter(([frame]) => frame.type === 'baseline')).toHaveLength(1)

    bench.api.failStreams(new RemoteStreamCarrierError('offline'))
    await flush()
    expect(accept.mock.calls.filter(([frame]) => frame.type === 'baseline')).toHaveLength(1)

    bench.publishGeneration(GENERATION)
    await flush()
    expect(accept.mock.calls.filter(([frame]) => frame.type === 'baseline')).toHaveLength(2)
  })
})
