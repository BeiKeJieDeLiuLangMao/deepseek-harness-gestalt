import { describe, expect, it, vi } from 'vitest'
import {
  liveModelSelection, type Agent, type AgentOptions, type AgentSetup, type CreateAgentOptions,
  type ModelSelection,
} from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { Context as CordisContext } from '@deepseek-ai/cordis'
import {
  SESSION_FORMAT_VERSION, SessionId, SessionLogOffset,
  type SessionEvent, type SessionHeader,
} from '@deepseek-ai/dsh-session'
import {
  SessionPersistenceRevision,
  type SessionAccess, type SessionHandle, type SessionPersistenceSnapshot,
} from '@deepseek-ai/dsh-session-persistence'
import { buildSidechatApi } from '../src/sidechat-routes.ts'
import type {
  SidebarContext as Context,
  SidebarSessionPersistenceService,
} from '../src/context-types.ts'

function persistedSidechat(
  events: readonly unknown[] = [],
  options: {
    readonly header?: Partial<SessionHeader>
    readonly inheritedEventCount?: number
    readonly listed?: boolean
    readonly readFailure?: Error
  } = {},
) {
  const header = (id: SessionId): SessionHeader => ({
    ...options.header,
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: options.header?.createdAt ?? 1,
    isSeeded: options.header?.isSeeded ?? false,
  })
  const close = vi.fn(() => Promise.resolve())
  const read = vi.fn(() => options.readFailure === undefined
    ? Promise.resolve({ eventState: 'shared-frozen' as const, events: events as readonly SessionEvent[] })
    : Promise.reject(options.readFailure))
  const open = vi.fn(async (id: SessionId, access: SessionAccess): Promise<SessionHandle> => ({
    id,
    access,
    header: header(id),
    inheritedEventCount: SessionLogOffset(options.inheritedEventCount ?? 0),
    read,
    append: () => Promise.resolve(),
    flush: () => Promise.resolve(),
    close,
    [Symbol.asyncDispose]: close,
  }))
  const stat = vi.fn(async (id: SessionId) => ({
    header: header(id),
    revision: SessionPersistenceRevision(`test:${id}`),
  }))
  const list = vi.fn(async (): Promise<readonly SessionPersistenceSnapshot[]> => options.listed === true
    ? [{
        header: header(SessionId('cold-child')),
        revision: SessionPersistenceRevision('test:cold-child'),
      }]
    : [])
  const persistence = { open, stat, list } satisfies SidebarSessionPersistenceService
  return { persistence, open, read, close, stat, list }
}

describe('sidechat route lifecycle', () => {
  it('creates the requested child only when the first prompt reaches the route', async () => {
    const inject = vi.fn()
    const followup = vi.fn()
    const append = vi.fn()
    const childCtx = new CordisContext()
    const child = {
      id: 'draft-child',
      ctx: childCtx,
      inject,
      followup,
      options: { provider: 'deepseek', model: 'chat' },
      session: { events: [], append, snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const parent = {
      id: 'parent',
      options: { provider: 'deepseek', model: 'chat' },
      session: { id: 'parent', events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const create = vi.fn<(options: CreateAgentOptions) => Promise<{
      agent: Agent
      dispose(): Promise<void>
    }>>(async (options) => {
      await options.setup?.(childCtx, child)
      return { agent: child, dispose: () => Promise.resolve() }
    })
    const ctx = {
      get: (name: string) => name === 'agents'
        ? { get: (id: string) => id === 'parent' ? parent : undefined, create }
        : undefined,
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    expect(create).not.toHaveBeenCalled()
    await expect(sidechat.routes['sidechat.start']({
      sessionId: 'parent',
      childId: 'draft-child',
      text: 'first question',
      requestId: 'request-sidechat-first',
    })).resolves.toEqual({ childId: 'draft-child', accepted: true })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'draft-child',
      meta: expect.objectContaining({ parentSession: 'parent', isSeeded: true, origin: 'subagent' }),
      agentOptions: expect.objectContaining({ provider: 'deepseek', model: 'chat' }),
    }))
    const createOptions = create.mock.calls[0]![0]
    expect(createOptions.seed).toHaveLength(createOptions.inheritedEventCount ?? 0)
    expect(append).toHaveBeenCalledWith('subagent/descriptor', expect.objectContaining({
      mode: 'continuable',
      provider: 'sidechat',
      label: 'Side: first question',
    }))
    expect(inject).toHaveBeenCalledOnce()
    expect(followup).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'user', rpcId: 'request-sidechat-first' },
    }))
    await sidechat.dispose()
  })

  it('waits for an in-flight first prompt and reports the Host publication result', async () => {
    let childLive = false
    let completeCreate!: (handle: { agent: Agent; dispose(): Promise<void> }) => void
    const creation = new Promise<{ agent: Agent; dispose(): Promise<void> }>((resolve) => {
      completeCreate = resolve
    })
    const child = {
      id: 'draft-child',
      ctx: { effect: vi.fn() },
      inject: vi.fn(),
      followup: vi.fn(),
      options: { provider: 'deepseek', model: 'chat' },
      session: { events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const parent = {
      id: 'parent',
      options: { provider: 'deepseek', model: 'chat' },
      session: { id: 'parent', events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const disposeHandle = vi.fn(async () => { childLive = false })
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') {
          return {
            get: (id: string) => id === 'parent' ? parent : id === 'draft-child' && childLive ? child : undefined,
            create: () => creation,
          }
        }
        if (name === 'sessionPersistence') return { list: () => Promise.resolve([]) }
        return undefined
      },
    } as unknown as Context
    const sidechat = buildSidechatApi(ctx)

    const starting = sidechat.routes['sidechat.start']({
      sessionId: 'parent', childId: 'draft-child', text: 'first question',
    })
    const closing = sidechat.routes['sidechat.dispose']({ childId: 'draft-child' })
    expect(disposeHandle).not.toHaveBeenCalled()
    childLive = true
    completeCreate({ agent: child, dispose: disposeHandle })

    await expect(starting).resolves.toEqual({ childId: 'draft-child', accepted: true })
    await expect(closing).resolves.toEqual({ accepted: true, published: true })
    expect(disposeHandle).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('reports a release failure and retains the handle for a close retry', async () => {
    let childLive = true
    const child = {
      id: 'child',
      ctx: { effect: vi.fn() },
      inject: vi.fn(),
      followup: vi.fn(),
      options: { provider: 'deepseek', model: 'chat' },
      session: { events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const parent = {
      id: 'parent',
      options: { provider: 'deepseek', model: 'chat' },
      session: { id: 'parent', events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const failure = new Error('release failed')
    const disposeHandle = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(async () => { childLive = false })
    const ctx = {
      get: (name: string) => name === 'agents'
        ? {
            get: (id: string) => id === 'parent' ? parent : id === 'child' && childLive ? child : undefined,
            create: () => Promise.resolve({ agent: child, dispose: disposeHandle }),
          }
        : undefined,
    } as unknown as Context
    const sidechat = buildSidechatApi(ctx)
    await sidechat.routes['sidechat.start']({
      sessionId: 'parent', childId: 'child', text: 'first question',
    })

    await expect(sidechat.routes['sidechat.dispose']({ childId: 'child' })).rejects.toBe(failure)
    await expect(sidechat.routes['sidechat.dispose']({ childId: 'child' }))
      .resolves.toEqual({ accepted: true, published: true })
    expect(disposeHandle).toHaveBeenCalledTimes(2)
    await sidechat.dispose()
  })

  it('reports an unsent draft as unpublished from the durable Session list', async () => {
    const list = vi.fn(() => Promise.resolve([]))
    const ctx = {
      get: (name: string) => name === 'sessionPersistence' ? { list } : undefined,
    } as unknown as Context
    const sidechat = buildSidechatApi(ctx)

    await expect(sidechat.routes['sidechat.dispose']({ childId: 'draft-child' }))
      .resolves.toEqual({ accepted: true, published: false })
    expect(list).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('reports a cold Side Chat as published from the formal durable snapshot', async () => {
    const persisted = persistedSidechat([], { listed: true })
    const ctx = {
      get: (name: string) => name === 'sessionPersistence' ? persisted.persistence : undefined,
    } as unknown as Context
    const sidechat = buildSidechatApi(ctx)

    await expect(sidechat.routes['sidechat.dispose']({ childId: 'cold-child' }))
      .resolves.toEqual({ accepted: true, published: true })
    expect(persisted.list).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('preserves the canonical composer queue posture', async () => {
    const followup = vi.fn()
    const steer = vi.fn()
    const agent = {
      followup,
      steer,
      session: {
        events: [{
          type: 'user/message',
          data: { content: [{ type: 'text', text: 'Side conversation boundary' }] },
        }],
        snapshotEvents() {
          return this.events
        },
      },
    } as unknown as Agent
    const ctx = {
      get: (name: string) => name === 'agents' ? { get: () => agent } : undefined,
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await sidechat.routes['sidechat.prompt']({ childId: 'child', text: 'redirect', mode: 'steer' })

    expect(steer).toHaveBeenCalledOnce()
    expect(followup).not.toHaveBeenCalled()
    await sidechat.dispose()
  })

  it('mutates queued Side Chat messages through the owning live Agent', async () => {
    const queued = createUserMessage({ content: [{ type: 'text', text: 'queued' }], source: { kind: 'user' } })
    const remove = vi.fn()
    const steer = vi.fn()
    const agent = {
      status: 'running',
      steer,
      inbox: { nextTurn: [queued], nextStep: [], remove, replace: vi.fn() },
    } as unknown as Agent
    const ctx = {
      get: (name: string) => name === 'agents' ? { get: () => agent } : undefined,
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.updateQueue']({
      childId: 'child', itemId: queued.id, action: { kind: 'steer' },
    })).resolves.toEqual({ accepted: true })

    expect(remove).toHaveBeenCalledWith(queued.id)
    expect(steer).toHaveBeenCalledWith(queued)
    await sidechat.dispose()
  })

  it('synchronizes a Side Chat permission selection with its direct parent', async () => {
    const set = vi.fn()
    const parent = { id: 'parent', session: { header: {} } } as unknown as Agent
    const child = {
      id: 'child',
      session: { header: { parentSession: 'parent' } },
    } as unknown as Agent
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') return { get: (id: string) => id === 'parent' ? parent : id === 'child' ? child : undefined }
        if (name === 'permissionPresets') return { names: ['workspace-write'], set }
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.permission']({
      childId: 'child', parentSessionId: 'parent', preset: 'workspace-write',
    })).resolves.toEqual({ selected: 'workspace-write' })

    expect(set).toHaveBeenNthCalledWith(1, parent.session, 'workspace-write')
    expect(set).toHaveBeenNthCalledWith(2, child.session, 'workspace-write')
    await sidechat.dispose()
  })

  it('rejects a provisional permission request without an owned live child', async () => {
    const set = vi.fn()
    const parent = { id: 'parent', session: { header: {} } } as unknown as Agent
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') return { get: (id: string) => id === 'parent' ? parent : undefined }
        if (name === 'permissionPresets') return { names: ['workspace-write'], set }
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.permission']({
      childId: 'draft-child',
      parentSessionId: 'parent',
      preset: 'workspace-write',
      provisional: true,
    })).rejects.toThrow('Side Chat session "draft-child" is not running')

    expect(set).not.toHaveBeenCalled()
    await sidechat.dispose()
  })

  it('retains a validated model choice until a cold child resumes', async () => {
    const llm = {
      resolveCallConfig: vi.fn(() => Promise.resolve({
        provider: 'deepseek',
        model: 'pro',
        reasoningEffort: 'high',
      })),
      listProviders: () => [{ id: 'deepseek' }],
    }
    const persisted = persistedSidechat()
    const ctx = {
      get: (name: string) => {
        if (name === 'llm') return llm
        if (name === 'sessionPersistence') return persisted.persistence
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.selectModel']({
      childId: 'cold-child',
      selection: { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' },
    })).resolves.toEqual({
      selected: { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' },
    })
    await expect(sidechat.routes['sidechat.model']({ childId: 'cold-child' })).resolves.toEqual({
      current: { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' },
      routable: true,
    })
    expect(persisted.stat).toHaveBeenCalledWith('cold-child')
    expect(persisted.open).not.toHaveBeenCalled()
    await sidechat.dispose()
  })

  it('keeps a concurrent provisional selection authoritative for first creation', async () => {
    const preset = Promise.withResolvers<{ id: string }>()
    const resolvePreset = vi.fn(() => preset.promise)
    const create = vi.fn(() => Promise.resolve({
      agent: {
        id: 'draft-child',
        ctx: { effect: vi.fn() },
        inject: vi.fn(),
        followup: vi.fn(),
        options: { provider: 'provider-b', model: 'model-b' },
        session: { events: [], snapshotEvents: () => [], header: {} },
      } as unknown as Agent,
      dispose: () => Promise.resolve(),
    }))
    const parent = {
      id: 'parent',
      options: { provider: 'provider-a', model: 'model-a' },
      session: { id: 'parent', events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') return { get: (id: string) => id === 'parent' ? parent : undefined, create }
        if (name === 'agentPresets') return { resolve: resolvePreset, mount: () => Promise.resolve() }
        if (name === 'llm') {
          return {
            resolveCallConfig: (selection: ModelSelection) => Promise.resolve(selection),
            listProviders: () => [{ id: 'provider-a' }, { id: 'provider-b' }],
          }
        }
        return undefined
      },
    } as unknown as Context
    const sidechat = buildSidechatApi(ctx)

    const starting = sidechat.routes['sidechat.start']({
      sessionId: 'parent',
      childId: 'draft-child',
      text: 'first question',
      selection: { provider: 'provider-a', model: 'model-a' },
    })
    await vi.waitFor(() => { expect(resolvePreset).toHaveBeenCalledOnce() })
    await expect(sidechat.routes['sidechat.selectModel']({
      childId: 'draft-child',
      selection: { provider: 'provider-b', model: 'model-b' },
      provisional: true,
    })).resolves.toEqual({ selected: { provider: 'provider-b', model: 'model-b' } })
    await expect(sidechat.routes['sidechat.model']({
      childId: 'draft-child',
      parentSessionId: 'parent',
      provisional: true,
    })).resolves.toEqual({
      current: { provider: 'provider-b', model: 'model-b' },
      routable: true,
    })

    preset.resolve({ id: 'standard' })
    await expect(starting).resolves.toEqual({ childId: 'draft-child', accepted: true })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      agentOptions: expect.objectContaining({ provider: 'provider-b', model: 'model-b' }),
    }))
    await sidechat.dispose()
  })

  it('uses the live parent model for a provisional Side Chat', async () => {
    const stat = vi.fn(() => Promise.reject(new Error('draft is not persisted')))
    const parent = {
      id: 'parent',
      options: { provider: 'deepseek', model: 'chat' },
      session: { events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') return { get: (id: string) => id === 'parent' ? parent : undefined }
        if (name === 'sessionPersistence') return { stat }
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.model']({
      childId: 'draft-child', parentSessionId: 'parent', provisional: true,
    })).resolves.toEqual({
      current: { provider: 'deepseek', model: 'chat' },
      routable: true,
    })
    expect(stat).not.toHaveBeenCalled()
    await sidechat.dispose()
  })

  it('falls back to the descriptor before the child records its own request header', async () => {
    const events = [
      {
        type: 'request/header',
        seq: 0,
        time: 1,
        data: {
          header: { config: { provider: 'parent-provider', model: 'parent-model' } },
          reason: 'initial',
        },
      },
      {
        type: 'subagent/descriptor',
        seq: 1,
        time: 2,
        data: snapshotSubagentDescriptor({
          mode: 'continuable',
          provider: 'sidechat',
          label: 'Side: persisted',
          agentProvider: 'child-provider',
          agentModel: 'child-model',
        }),
      },
    ]
    const persisted = persistedSidechat(events, { inheritedEventCount: 1 })
    const ctx = {
      get: (name: string) => {
        if (name === 'sessionPersistence') return persisted.persistence
        if (name === 'llm') return { listProviders: () => [{ id: 'child-provider' }] }
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.model']({ childId: 'cold-child' })).resolves.toEqual({
      current: { provider: 'child-provider', model: 'child-model' },
      routable: true,
    })
    expect(persisted.open).toHaveBeenCalledWith('cold-child', 'read')
    expect(persisted.close).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('uses the nested child descriptor instead of inherited parent model events', async () => {
    const events = [
      {
        type: 'subagent/descriptor',
        seq: 0,
        time: 1,
        data: snapshotSubagentDescriptor({
          mode: 'continuable',
          provider: 'sidechat',
          label: 'Side: parent',
          agentProvider: 'parent-initial',
          agentModel: 'parent-initial-model',
        }),
      },
      {
        type: 'request/header',
        seq: 1,
        time: 2,
        data: {
          header: { config: { provider: 'parent-current', model: 'parent-current-model' } },
          reason: 'change',
        },
      },
      {
        type: 'subagent/descriptor',
        seq: 2,
        time: 3,
        data: snapshotSubagentDescriptor({
          mode: 'continuable',
          provider: 'sidechat',
          label: 'Side: child',
          agentProvider: 'child-provider',
          agentModel: 'child-model',
        }),
      },
    ]
    const persisted = persistedSidechat(events, { inheritedEventCount: 2 })
    const ctx = {
      get: (name: string) => {
        if (name === 'sessionPersistence') return persisted.persistence
        if (name === 'llm') return { listProviders: () => [{ id: 'child-provider' }] }
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.model']({ childId: 'nested-child' })).resolves.toEqual({
      current: { provider: 'child-provider', model: 'child-model' },
      routable: true,
    })
    expect(persisted.close).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('closes a persisted model reader when its log read fails', async () => {
    const readFailure = new Error('stored read failed')
    const persisted = persistedSidechat([], { readFailure })
    const ctx = {
      get: (name: string) => name === 'sessionPersistence' ? persisted.persistence : undefined,
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.model']({ childId: 'cold-child' }))
      .rejects.toBe(readFailure)
    expect(persisted.close).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('closes a persisted model reader before an invalid request header fails', async () => {
    const persisted = persistedSidechat([{
      type: 'request/header',
      seq: 0,
      time: 1,
      data: { header: {} },
    }])
    const ctx = {
      get: (name: string) => name === 'sessionPersistence' ? persisted.persistence : undefined,
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.model']({ childId: 'cold-child' }))
      .rejects.toBeInstanceOf(TypeError)
    expect(persisted.close).toHaveBeenCalledOnce()
    await sidechat.dispose()
  })

  it('closes the persisted reader before preset composition fails', async () => {
    const compositionFailure = new Error('preset composition failed')
    const persisted = persistedSidechat([], { header: { agentPreset: 'broken' } })
    const resume = vi.fn()
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') return { get: () => undefined, resume }
        if (name === 'agentPresets') {
          return { resolve: () => Promise.reject(compositionFailure), mount: vi.fn() }
        }
        if (name === 'sessionPersistence') return persisted.persistence
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.prompt']({
      childId: 'cold-child', text: 'continue', mode: 'queue',
    })).rejects.toBe(compositionFailure)
    expect(persisted.close).toHaveBeenCalledOnce()
    expect(resume).not.toHaveBeenCalled()
    await sidechat.dispose()
  })

  it('restores the last used model before a persisted Side Chat resumes', async () => {
    const events = [
      {
        type: 'subagent/descriptor',
        seq: 0,
        time: 1,
        data: snapshotSubagentDescriptor({
          mode: 'continuable',
          provider: 'sidechat',
          label: 'Side: persisted',
          agentProvider: 'initial-provider',
          agentModel: 'initial-model',
        }),
      },
      {
        type: 'request/header',
        seq: 1,
        time: 2,
        data: {
          header: {
            config: { provider: 'grok', model: 'grok-4.6', reasoningEffort: 'high' },
          },
          reason: 'change',
        },
      },
      {
        type: 'user/message',
        seq: 2,
        time: 3,
        data: { content: [{ type: 'text', text: 'Side conversation boundary.' }] },
      },
    ]
    const agentCtx = new CordisContext()
    let resumedAgent: Agent | undefined
    const resume = vi.fn(async (options: {
      agentOptions?: AgentOptions
      setup?: AgentSetup
    }) => {
      const child = {
        id: 'cold-child',
        ctx: agentCtx,
        options: options.agentOptions ?? {},
        session: { events, snapshotEvents: () => events, header: {} },
        followup: vi.fn(),
      } as unknown as Agent
      await options.setup?.(agentCtx, child)
      resumedAgent = child
      return { agent: resumedAgent, dispose: () => Promise.resolve() }
    })
    const persisted = persistedSidechat(events)
    const ctx = {
      get: (name: string) => {
        if (name === 'agents') return { get: () => undefined, resume }
        if (name === 'sessionPersistence') return persisted.persistence
        if (name === 'llm') return { listProviders: () => [{ id: 'grok' }] }
        return undefined
      },
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    await expect(sidechat.routes['sidechat.model']({ childId: 'cold-child' })).resolves.toEqual({
      current: { provider: 'grok', model: 'grok-4.6', reasoningEffort: 'high' },
      routable: true,
    })
    await sidechat.routes['sidechat.prompt']({ childId: 'cold-child', text: 'continue', mode: 'queue' })

    expect(resume).toHaveBeenCalledWith(expect.objectContaining({
      agentOptions: { provider: 'grok', model: 'grok-4.6' },
    }))
    expect(liveModelSelection(resumedAgent!)).toEqual({
      provider: 'grok', model: 'grok-4.6', reasoningEffort: 'high',
    })
    expect(persisted.open).toHaveBeenCalledTimes(2)
    expect(persisted.close).toHaveBeenCalledTimes(2)
    await sidechat.dispose()
    await agentCtx.fiber.dispose()
  })

  it('waits for admitted resume work and disposes its handle before teardown completes', async () => {
    let completeResume: ((handle: { agent: Agent; dispose(): Promise<void> }) => void) | undefined
    const resumed = new Promise<{ agent: Agent; dispose(): Promise<void> }>((resolve) => {
      completeResume = resolve
    })
    const inject = vi.fn()
    const followup = vi.fn()
    const disposeHandle = vi.fn(() => Promise.resolve())
    const agent = {
      inject,
      followup,
      options: {},
      session: { events: [], snapshotEvents: () => [], header: {} },
    } as unknown as Agent
    const resume = vi.fn(() => resumed)
    const ctx = {
      get: (name: string) => name === 'agents'
        ? { get: () => undefined, resume }
        : undefined,
    } as unknown as Context

    const sidechat = buildSidechatApi(ctx)
    const prompting = sidechat.routes['sidechat.prompt']({ childId: 'child', text: 'hello', mode: 'queue' })
    await vi.waitFor(() => { expect(resume).toHaveBeenCalledOnce() })

    const teardown = sidechat.dispose()
    await expect(sidechat.routes['sidechat.cancel']({ childId: 'child' }))
      .rejects.toThrow('side chat is stopping')

    completeResume?.({ agent, dispose: disposeHandle })
    await prompting
    await teardown

    expect(inject).toHaveBeenCalledOnce()
    expect(followup).toHaveBeenCalledOnce()
    expect(disposeHandle).toHaveBeenCalledOnce()
  })
})
