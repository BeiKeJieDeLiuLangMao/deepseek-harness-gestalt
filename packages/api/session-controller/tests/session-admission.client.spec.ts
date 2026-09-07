/**
 * Client Session admission dispatch:
 * - exact SessionId registration with reference-safe disposers and single-owner replacement
 * - late registration / replacement / revocation on existing bindings
 * - real Session prompt / cancel / updateQueue / command dispatch
 * - provisional Session first-prompt routing without Host publication
 * - ordinary Sessions unaffected (stock Remote path preserved)
 * - intercepted failure does not double-dispatch or fall back to Remote
 * - slash commands route through command handler and never convert to prompt
 */

import { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRequestId } from '../src/types.ts'
import { ClientSessions } from '../src/client/sessions/service.ts'
import type {
  SessionAdmissionAdapter,
  SessionAdmissionFailure,
  SessionAdmissionModelRoute,
  SessionAdmissionRoute,
} from '../src/client/contract/admission.ts'
import type { SessionRemote } from '../src/client/transport.ts'
import {
  FakeApiClient,
  fakeRemote,
  ok,
  type RuntimeRemotes,
} from './fake-api.client.ts'

const sid = (s: string): SessionId => s as SessionId
const mid = (m: string): MessageId => m as MessageId

function failureOf<T>(result: RemoteResult<T>): RemoteFailure {
  if (result.ok) throw new Error('expected a Remote failure')
  return result.error
}

interface Bench {
  ctx: Context
  api: FakeApiClient
  remote: RuntimeRemotes
  svc: ClientSessions
}

function bench(): Bench {
  const ctx = new Context()
  const api = new FakeApiClient()
  const remote = fakeRemote(api)
  const svc = new ClientSessions(ctx, remote)
  return { ctx, api, remote, svc }
}

describe('Session Client admission dispatch', () => {
  it('routes stageProvisional first prompt through admission without Host publication', async () => {
    const { svc, api } = bench()
    const provisionalId = sid('provisional-sidechat-1')
    const parentId = sid('session-parent-1')

    const promptHandler = vi.fn((_sessionId, _content, _mode, _signal) =>
      Promise.resolve(ok({ accepted: true as const })),
    )

    const route: SessionAdmissionRoute = {
      prompt: promptHandler,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    const dropProvisional = svc.stageProvisional({
      sessionId: provisionalId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'Side Chat Draft',
    })

    const dropAdmission = svc.registerAdmission(provisionalId, route)

    const binding = svc.binding(provisionalId)
    expect(binding).toBeDefined()

    const result = await binding!.session.prompt(
      [{ type: 'text', text: 'start side chat' }],
      'queue',
      undefined,
      'request-sidechat-1' as SessionRequestId,
    )

    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(promptHandler).toHaveBeenCalledTimes(1)
    expect(promptHandler).toHaveBeenCalledWith(
      provisionalId,
      [{ type: 'text', text: 'start side chat' }],
      'queue',
      undefined,
      'request-sidechat-1',
    )

    // Stock Remote prompt must NOT have been called
    const remotePromptCalls = api.calls.filter(c => c.method === 'session.prompt' || c.method === 'subagents.prompt')
    expect(remotePromptCalls).toEqual([])

    // Blank bit flipped and promptAttempted recorded
    const snapshot = binding!.session.getSnapshot()
    expect(snapshot.blank).toBe(false)
    expect(snapshot.promptAttempted).toBe(true)

    dropAdmission()
    dropProvisional()
  })

  it('leaves ordinary Sessions unaffected, preserving stock Remote routing', async () => {
    const { svc, api, remote } = bench()
    const normalId = sid('session-normal-1')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId: normalId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    await svc.refresh()

    const binding = svc.binding(normalId)
    expect(binding).toBeDefined()

    // 1. prompt calls stock remote.session.prompt
    const promptResult = await binding!.session.prompt([{ type: 'text', text: 'hello remote' }], 'queue')
    expect(promptResult).toEqual({ ok: true, value: { accepted: true } })
    expect(api.calls.some(c => c.method === 'session.prompt')).toBe(true)

    // 2. cancel calls stock remote.session.cancel
    const cancelResult = await binding!.session.cancel()
    expect(cancelResult).toEqual({ ok: true, value: { accepted: true } })
    expect(api.calls.some(c => c.method === 'session.cancel')).toBe(true)

    // 3. updateQueue calls stock remote.session.updateQueue
    const queueResult = await binding!.session.updateQueue(mid('msg-1'), { kind: 'steer' })
    expect(queueResult).toEqual({ ok: true, value: { accepted: true } })
    expect(api.calls.some(c => c.method === 'session.updateQueue')).toBe(true)

    // 4. command calls stock remote.commands.execute
    const executeSpy = vi.spyOn(remote.commands, 'execute')
    const commandResult = await binding!.session.command('/test')
    expect(commandResult).toEqual({ ok: true, value: { matched: false } })
    expect(executeSpy).toHaveBeenCalledWith(normalId, '/test', [])
  })

  it('applies late registration to an existing Session binding', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-existing-1')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    await svc.refresh()

    // Obtain binding BEFORE registering admission
    const binding = svc.binding(sessionId)
    expect(binding).toBeDefined()

    const promptHandler = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const route: SessionAdmissionRoute = {
      prompt: promptHandler,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    // Late register
    const dropAdmission = svc.registerAdmission(sessionId, route)

    // Prompt through the existing binding
    const result = await binding!.session.prompt([{ type: 'text', text: 'late registration' }], 'queue')
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(promptHandler).toHaveBeenCalledTimes(1)
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])

    dropAdmission()
  })

  it('supports single-owner replacement and prevents an outdated disposer from revoking a new owner', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-multi-owner-1')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    await svc.refresh()

    const binding = svc.binding(sessionId)
    expect(binding).toBeDefined()

    const owner1Prompt = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const route1: SessionAdmissionRoute = {
      prompt: owner1Prompt,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    const owner2Prompt = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const route2: SessionAdmissionRoute = {
      prompt: owner2Prompt,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    // Register owner 1
    const dispose1 = svc.registerAdmission(sessionId, route1)

    // Register owner 2 (replaces owner 1)
    const dispose2 = svc.registerAdmission(sessionId, route2)

    // Should route to owner 2
    await binding!.session.prompt([{ type: 'text', text: 'msg for owner 2' }], 'queue')
    expect(owner1Prompt).not.toHaveBeenCalled()
    expect(owner2Prompt).toHaveBeenCalledTimes(1)

    // Call dispose1 (old disposer). Must NOT revoke owner 2!
    dispose1()

    // Should STILL route to owner 2
    await binding!.session.prompt([{ type: 'text', text: 'msg still for owner 2' }], 'queue')
    expect(owner2Prompt).toHaveBeenCalledTimes(2)
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])

    // Now call dispose2. Revokes owner 2.
    dispose2()

    // Next prompt falls back to stock Remote
    await binding!.session.prompt([{ type: 'text', text: 'msg for remote' }], 'queue')
    expect(api.calls.some(c => c.method === 'session.prompt')).toBe(true)
  })

  it('rejects duplicate registration when conflict strategy is "reject"', () => {
    const { svc } = bench()
    const sessionId = sid('session-reject-conflict')

    const route: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    svc.registerAdmission(sessionId, route)

    expect(() => {
      svc.registerAdmission(sessionId, route, { conflict: 'reject' })
    }).toThrowError(`sessions.registerAdmission: session "${sessionId}" already has an active admission route`)
  })

  it('does not fall back to Remote or double-dispatch when admission prompt fails or throws', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-fail-no-fallback')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: true,
      }],
    }))
    await svc.refresh()

    const binding = svc.binding(sessionId)!
    const promptCalls: string[] = []

    const route: SessionAdmissionRoute = {
      prompt: vi.fn((_id, content) => {
        promptCalls.push(content[0].type === 'text' ? content[0].text : '')
        return Promise.resolve({
          ok: false as const,
          error: {
            code: 'session/attachment-invalid',
            message: 'Images unsupported in Side Chat.',
            details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
          } satisfies SessionAdmissionFailure,
        })
      }),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    svc.registerAdmission(sessionId, route)

    // First attempt fails with error receipt
    const result1 = await binding.session.prompt([{ type: 'text', text: 'attempt 1' }], 'queue')
    const failure1 = failureOf(result1)
    expect(failure1).toBeInstanceOf(Error)
    expect(failure1).toMatchObject({
      code: 'session/attachment-invalid',
      message: 'Images unsupported in Side Chat.',
      details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
    })

    // Must NOT fall back to remote
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])
    expect(binding.session.getSnapshot().promptError).toMatchObject({
      op: 'send',
      error: {
        code: 'session/attachment-invalid',
        message: 'Images unsupported in Side Chat.',
        details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
      },
    })
    // Failed first prompt keeps session blank
    expect(binding.session.getSnapshot().blank).toBe(true)

    // Second attempt throws an unexpected Error
    route.prompt = vi.fn(() => Promise.reject(new Error('Network drop in adapter')))
    const result2 = await binding.session.prompt([{ type: 'text', text: 'attempt 2' }], 'queue')
    const failure2 = failureOf(result2)
    expect(failure2.code).toBe('gateway/internal')
    expect(failure2.message).toBe('Network drop in adapter')

    const existing = new RemoteError('gateway/bad-request', 'already remote', {})
    route.prompt = vi.fn(() => Promise.resolve({ ok: false as const, error: existing }))
    const returned = await binding.session.prompt([{ type: 'text', text: 'attempt 3' }], 'queue')
    expect(failureOf(returned)).toBe(existing)

    route.prompt = vi.fn(() => Promise.reject(existing))
    const thrown = await binding.session.prompt([{ type: 'text', text: 'attempt 4' }], 'queue')
    expect(failureOf(thrown)).toBe(existing)

    route.prompt = vi.fn(() => Promise.reject({
      code: 'session/attachment-invalid',
      message: 'marker-free failure',
      details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
    }))
    const markerFree = await binding.session.prompt([{ type: 'text', text: 'attempt 5' }], 'queue')
    expect(failureOf(markerFree)).toMatchObject({
      code: 'gateway/internal',
      message: '[object Object]',
      details: {},
    })

    // Still no remote call
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])
  })

  it('does not fall back to Remote when admission updateQueue or command throws', async () => {
    const { svc, api, remote } = bench()
    const sessionId = sid('session-throw-queue-command')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    await svc.refresh()
    const binding = svc.binding(sessionId)!
    const executeSpy = vi.spyOn(remote.commands, 'execute')

    const route: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      updateQueue: vi.fn(() => Promise.reject(new Error('queue adapter drop'))),
      command: vi.fn(() => Promise.reject(new Error('command adapter drop'))),
    }
    svc.registerAdmission(sessionId, route)

    const queueResult = await binding.session.updateQueue(mid('item-throw'), { kind: 'steer' })
    const queueFailure = failureOf(queueResult)
    expect(queueFailure.code).toBe('gateway/internal')
    expect(queueFailure.message).toBe('queue adapter drop')
    expect(api.calls.filter(c => c.method === 'session.updateQueue')).toEqual([])

    const commandResult = await binding.session.command('/permission full')
    const commandFailure = failureOf(commandResult)
    expect(commandFailure.code).toBe('gateway/internal')
    expect(commandFailure.message).toBe('command adapter drop')
    expect(executeSpy).not.toHaveBeenCalled()
    expect(route.prompt).not.toHaveBeenCalled()

    route.updateQueue = vi.fn((_sessionId, itemId) => Promise.resolve({
      ok: false as const,
      error: {
        code: 'session/queue-item-not-found',
        message: 'queued item is gone',
        details: { itemId },
      } satisfies SessionAdmissionFailure,
    }))
    const structuredQueue = await binding.session.updateQueue(mid('item-gone'), { kind: 'remove' })
    const structuredQueueFailure = failureOf(structuredQueue)
    expect(structuredQueueFailure).toBeInstanceOf(Error)
    expect(structuredQueueFailure).toMatchObject({
      code: 'session/queue-item-not-found',
      message: 'queued item is gone',
      details: { itemId: mid('item-gone') },
    })

    route.command = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: {
        code: 'gateway/bad-request',
        message: 'bad command',
        details: {},
      } satisfies SessionAdmissionFailure,
    }))
    const structuredCommand = await binding.session.command('/bad')
    const structuredCommandFailure = failureOf(structuredCommand)
    expect(structuredCommandFailure).toBeInstanceOf(Error)
    expect(structuredCommandFailure).toMatchObject({
      code: 'gateway/bad-request',
      message: 'bad command',
      details: {},
    })
  })

  it('routes cancel through admission and preserves failure promptError without falling back to Remote', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-cancel-1')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: true,
        blank: false,
      }],
    }))
    await svc.refresh()

    const binding = svc.binding(sessionId)!
    const cancelMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))

    const route: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: cancelMock,
    }

    const drop = svc.registerAdmission(sessionId, route)

    // Successful cancel
    const cancelResult = await binding.session.cancel()
    expect(cancelResult).toEqual({ ok: true, value: { accepted: true } })
    expect(cancelMock).toHaveBeenCalledWith(sessionId)
    expect(api.calls.filter(c => c.method === 'session.cancel')).toEqual([])

    // Failed cancel
    route.cancel = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: {
        code: 'gateway/internal',
        message: 'unable to stop',
        details: {},
      } satisfies SessionAdmissionFailure,
    }))

    const failedResult = await binding.session.cancel()
    expect(failureOf(failedResult)).toBeInstanceOf(Error)
    expect(api.calls.filter(c => c.method === 'session.cancel')).toEqual([])
    expect(binding.session.getSnapshot().promptError).toMatchObject({
      op: 'stop',
      error: { code: 'gateway/internal', message: 'unable to stop', details: {} },
    })

    drop()
  })

  it('routes updateQueue through admission, failing loud if unhandled without falling back to Remote', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-queue-1')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    await svc.refresh()

    const binding = svc.binding(sessionId)!
    const updateQueueMock = vi.fn((_id, _itemId, _action) =>
      Promise.resolve(ok({ accepted: true as const })),
    )

    const route: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      updateQueue: updateQueueMock,
    }

    const drop = svc.registerAdmission(sessionId, route)

    // Routes to admission
    const res1 = await binding.session.updateQueue(mid('item-1'), { kind: 'steer' })
    expect(res1).toEqual({ ok: true, value: { accepted: true } })
    expect(updateQueueMock).toHaveBeenCalledWith(sessionId, mid('item-1'), { kind: 'steer' })
    expect(api.calls.filter(c => c.method === 'session.updateQueue')).toEqual([])

    // If updateQueue omitted from admission, fails loud without calling Remote
    delete route.updateQueue
    const res2 = await binding.session.updateQueue(mid('item-2'), { kind: 'remove' })
    const failure2 = failureOf(res2)
    expect(failure2.code).toBe('gateway/internal')
    expect(failure2.message).toContain('does not support queue mutation')
    expect(api.calls.filter(c => c.method === 'session.updateQueue')).toEqual([])

    drop()
  })

  it('routes slash commands through admission without converting commands to prompt', async () => {
    const { svc, api, remote } = bench()
    const sessionId = sid('session-command-1')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    await svc.refresh()

    const binding = svc.binding(sessionId)!
    const promptMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const commandMock = vi.fn((_id, line) => Promise.resolve(ok({ matched: line === '/permission full' })))

    const route: SessionAdmissionRoute = {
      prompt: promptMock,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      command: commandMock,
    }

    const drop = svc.registerAdmission(sessionId, route)

    const executeSpy = vi.spyOn(remote.commands, 'execute')
    const cmdRes = await binding.session.command('/permission full')
    expect(cmdRes).toEqual({ ok: true, value: { matched: true } })
    expect(commandMock).toHaveBeenCalledWith(sessionId, '/permission full')

    // Must NEVER convert to prompt!
    expect(promptMock).not.toHaveBeenCalled()
    // Must NOT call remote commands
    expect(executeSpy).not.toHaveBeenCalled()

    // When command handler is omitted, fails loud and never converts to prompt or remote
    delete route.command
    const unhandledRes = await binding.session.command('/help')
    const unhandledFailure = failureOf(unhandledRes)
    expect(unhandledFailure.code).toBe('gateway/internal')
    expect(unhandledFailure.message).toContain('does not support commands')
    expect(promptMock).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()

    drop()
  })

  it('dispatches matching adapter handles through an existing Session binding and leaves unmatched Sessions on stock Remotes', async () => {
    const { svc, api, remote } = bench()
    const targetId = sid('subagent-sidechat-123')
    const otherId = sid('session-normal-456')

    api.onList = () => Promise.resolve(ok({
      items: [
        { sessionId: targetId, updatedAt: 100, running: false, blank: false },
        { sessionId: otherId, updatedAt: 100, running: false, blank: false },
      ],
    }))
    await svc.refresh()
    const hit = svc.binding(targetId)!
    const miss = svc.binding(otherId)!

    const promptMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const cancelMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const updateQueueMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const commandMock = vi.fn(() => Promise.resolve(ok({ matched: true })))
    const executeSpy = vi.spyOn(remote.commands, 'execute')

    const adapter: SessionAdmissionAdapter = {
      id: 'test-adapter',
      handles: sessionId => sessionId === targetId,
      prompt: promptMock,
      cancel: cancelMock,
      updateQueue: updateQueueMock,
      command: commandMock,
    }

    const drop = svc.registerAdmissionAdapter(adapter)
    expect(() => {
      svc.registerAdmissionAdapter(adapter)
    }).toThrowError('sessions.registerAdmissionAdapter: duplicate adapter "test-adapter"')

    await expect(hit.session.prompt([{ type: 'text', text: 'via adapter' }], 'queue'))
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(hit.session.cancel())
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(hit.session.updateQueue(mid('item-adapter'), { kind: 'steer' }))
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(hit.session.command('/permission full'))
      .resolves.toEqual({ ok: true, value: { matched: true } })

    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(updateQueueMock).toHaveBeenCalledTimes(1)
    expect(commandMock).toHaveBeenCalledTimes(1)
    expect(api.calls.filter(c =>
      c.method === 'session.prompt'
      || c.method === 'session.cancel'
      || c.method === 'session.updateQueue',
    )).toEqual([])
    expect(executeSpy).not.toHaveBeenCalled()

    await expect(miss.session.prompt([{ type: 'text', text: 'stock remote' }], 'queue'))
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(miss.session.cancel())
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(miss.session.updateQueue(mid('item-stock'), { kind: 'steer' }))
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(miss.session.command('/help'))
      .resolves.toEqual({ ok: true, value: { matched: false } })

    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(updateQueueMock).toHaveBeenCalledTimes(1)
    expect(commandMock).toHaveBeenCalledTimes(1)
    expect(api.calls.some(c => c.method === 'session.prompt' && (c.payload as { sessionId: string }).sessionId === otherId)).toBe(true)
    expect(api.calls.some(c => c.method === 'session.cancel' && (c.payload as { sessionId: string }).sessionId === otherId)).toBe(true)
    expect(api.calls.some(c => c.method === 'session.updateQueue' && (c.payload as { sessionId: string }).sessionId === otherId)).toBe(true)
    expect(executeSpy).toHaveBeenCalledWith(otherId, '/help', [])

    const exactRoute: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }
    const dropExact = svc.registerAdmission(targetId, exactRoute)
    expect(svc.resolveAdmission(targetId)).toBe(exactRoute)
    dropExact()
    expect(svc.resolveAdmission(targetId)).toBe(adapter)
    drop()
    expect(svc.resolveAdmission(targetId)).toBeUndefined()
  })

  it('does not treat titles or catalog subagent addresses as admission credentials', async () => {
    const { svc, api } = bench()
    const parentId = sid('session-parent-auth')
    const childId = sid('session-child-auth')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId: parentId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    api.onSubagentList = () => Promise.resolve(ok({
      entries: [{
        kind: 'child',
        id: childId,
        mode: 'continuable',
        label: 'Side Chat',
        activity: 'inactive',
        hasChildren: false,
      }],
      parentAvailable: true,
    }))
    await svc.refresh()
    await svc.refreshSubagents(parentId)
    svc.openSubagent({
      parentSessionId: parentId,
      childSessionId: childId,
      mode: 'continuable',
    })

    const child = svc.binding(childId)!
    expect(svc.list.getSnapshot().byId[childId]?.displayTitle).toBe('Side Chat')
    expect(svc.resolveAdmission(childId)).toBeUndefined()
    expect(svc.commandCatalogSessionId(childId)).toBeUndefined()
    expect(svc.skillCatalogSessionId(childId)).toBeUndefined()
    expect(svc.modelRoute(childId)).toBeUndefined()

    await child.session.prompt([{ type: 'text', text: 'not a credential' }], 'queue')
    await child.session.cancel()
    expect(api.calls.some(c => c.method === 'subagents.prompt')).toBe(true)
    expect(api.calls.some(c => c.method === 'subagents.interruptByParent')).toBe(true)
    expect(api.calls.filter(c => c.method === 'session.prompt' || c.method === 'session.cancel')).toEqual([])

    const promptMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const cancelMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const drop = svc.registerAdmission(childId, {
      prompt: promptMock,
      cancel: cancelMock,
    })
    api.calls.length = 0

    await child.session.prompt([{ type: 'text', text: 'owned child' }], 'queue')
    await child.session.cancel()
    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(api.calls.filter(c =>
      c.method === 'subagents.prompt'
      || c.method === 'subagents.interruptByParent'
      || c.method === 'session.prompt'
      || c.method === 'session.cancel',
    )).toEqual([])
    drop()
  })

  it('rejects admission registration after ClientSessions disposal', async () => {
    const { ctx, svc } = bench()
    const sessionId = sid('session-disposed-admission')
    const route: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }
    const adapter: SessionAdmissionAdapter = {
      id: 'disposed-adapter',
      handles: () => true,
      prompt: route.prompt,
      cancel: route.cancel,
    }

    await ctx.fiber.dispose()
    expect(() => { svc.registerAdmission(sessionId, route) })
      .toThrowError('sessions.registerAdmission: ClientSessions is disposed')
    expect(() => { svc.registerAdmissionAdapter(adapter) })
      .toThrowError('sessions.registerAdmissionAdapter: ClientSessions is disposed')
  })

  it('keeps commandCatalogSessionId and skillCatalogSessionId as lookup-only helpers', async () => {
    const { svc } = bench()
    const sessionId = sid('session-catalogs-1')
    const parentId = sid('session-parent-0')

    const customModelRoute = {
      inspect: vi.fn(() => Promise.resolve(ok({
        current: { provider: 'p', model: 'm' },
        routable: true,
      }))),
      selectModel: vi.fn(() => Promise.resolve(ok({ selected: { provider: 'p', model: 'm' } }))),
    }

    const route: SessionAdmissionRoute = {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => customModelRoute,
      commandCatalogSessionId: () => undefined, // hides commands
      skillCatalogSessionId: () => parentId, // points to parent
    }

    const drop = svc.registerAdmission(sessionId, route)

    const customRoute = svc.modelRoute(sessionId)
    await expect(customRoute?.inspect?.()).resolves.toMatchObject({ ok: true })
    await expect(customRoute?.selectModel?.({ provider: 'p', model: 'm' })).resolves.toMatchObject({
      ok: true,
    })
    expect(svc.commandCatalogSessionId(sessionId)).toBeUndefined()
    expect(svc.skillCatalogSessionId(sessionId)).toBe(parentId)

    drop()

    expect(svc.commandCatalogSessionId(sessionId)).toBe(sessionId)
    expect(svc.skillCatalogSessionId(sessionId)).toBe(sessionId)
  })

  it('serves stock selectModel for ordinary Sessions and hides catalog children without a feature route', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-stock-model')
    const parentId = sid('session-stock-parent')
    const childId = sid('session-stock-child')

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
      }, {
        sessionId: parentId,
        updatedAt: 100,
        running: false,
        blank: false,
      }],
    }))
    api.onSubagentList = () => Promise.resolve(ok({
      entries: [{
        kind: 'child',
        id: childId,
        mode: 'continuable',
        label: 'Child',
        activity: 'inactive',
        hasChildren: false,
      }],
      parentAvailable: true,
    }))
    api.onSelectModel = payload => Promise.resolve({
      ok: false,
      error: new RemoteError(
        'session/model-unavailable',
        `provider ${payload.provider} is not routable`,
        { provider: payload.provider, model: payload.model },
      ),
    })
    await svc.refresh()
    await svc.refreshSubagents(parentId)
    svc.openSubagent({
      parentSessionId: parentId,
      childSessionId: childId,
      mode: 'continuable',
    })

    const stock = svc.modelRoute(sessionId)
    expect(stock?.inspect).toBeUndefined()
    expect(stock?.selectModel).toBeTypeOf('function')
    api.onSelectModel = payload => Promise.resolve(ok({
      selected: {
        provider: payload.provider,
        model: payload.model,
        ...(payload.reasoningEffort === undefined ? {} : { reasoningEffort: payload.reasoningEffort }),
      },
    }))
    await expect(stock!.selectModel!({ provider: 'fixture', model: 'fixture' })).resolves.toEqual({
      ok: true,
      value: { selected: { provider: 'fixture', model: 'fixture' } },
    })
    expect(api.callsOf('session.selectModel')).toEqual([{
      sessionId,
      provider: 'fixture',
      model: 'fixture',
    }])

    expect(svc.modelRoute(childId)).toBeUndefined()
    expect(api.callsOf('session.selectModel')).toEqual([{
      sessionId,
      provider: 'fixture',
      model: 'fixture',
    }])

    const childSelect = vi.fn(() => Promise.resolve(ok({ selected: { provider: 'owned', model: 'child' } })))
    const dropChild = svc.registerAdmission(childId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => ({
        inspect: () => Promise.resolve(ok({
          current: { provider: 'owned', model: 'child' },
          routable: true,
        })),
        selectModel: childSelect,
      }),
    })
    await svc.modelRoute(childId)!.selectModel!({ provider: 'owned', model: 'child' })
    expect(childSelect).toHaveBeenCalledTimes(1)
    expect(api.callsOf('session.selectModel')).toHaveLength(1)
    dropChild()
    expect(svc.modelRoute(childId)).toBeUndefined()

    expect(svc.modelRoute(sid('ghost'))).toBeUndefined()

    const admissionInspect = vi.fn(() => Promise.resolve(ok({
      current: { provider: 'owned', model: 'm' },
      routable: true,
    })))
    const admissionSelect = vi.fn(() => Promise.resolve(ok({ selected: { provider: 'owned', model: 'm' } })))
    const drop = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => ({ inspect: admissionInspect, selectModel: admissionSelect }),
    })
    await expect(svc.modelRoute(sessionId)?.inspect?.()).resolves.toMatchObject({ ok: true })
    await svc.modelRoute(sessionId)!.selectModel!({ provider: 'owned', model: 'm' })
    expect(admissionSelect).toHaveBeenCalledTimes(1)
    expect(api.callsOf('session.selectModel')).toHaveLength(1)

    const hide = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => undefined,
    })
    expect(svc.modelRoute(sessionId)).toBeUndefined()
    hide()
    drop()
    expect(svc.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')

    api.onSelectModel = payload => Promise.resolve({
      ok: false,
      error: new RemoteError(
        'session/model-unavailable',
        `provider ${payload.provider} is not routable`,
        { provider: payload.provider, model: payload.model },
      ),
    })
    const rejected = await svc.modelRoute(sessionId)!.selectModel!({ provider: 'missing', model: 'nope' })
    expect(failureOf(rejected).code).toBe('session/model-unavailable')
  })

  it('normalizes feature model failures while preserving receiver, signal, and hidden methods', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-admission-model-failure')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId, updatedAt: 100, running: false, blank: false }],
    }))
    await svc.refresh()

    const signal = new AbortController().signal
    const modelRoute: SessionAdmissionModelRoute = {
      inspect(signalArg) {
        expect(this).toBe(modelRoute)
        expect(signalArg).toBe(signal)
        return Promise.resolve({
          ok: false as const,
          error: {
            code: 'session/model-unavailable',
            message: 'inspection unavailable',
            details: { provider: 'owned', model: 'catalog' },
          },
        })
      },
      selectModel(_selection, signalArg) {
        expect(this).toBe(modelRoute)
        expect(signalArg).toBe(signal)
        throw new Error('selection adapter drop')
      },
    }
    svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => modelRoute,
    })

    const routed = svc.modelRoute(sessionId)!
    const inspection = await routed.inspect!(signal)
    const inspectionFailure = failureOf(inspection)
    expect(inspectionFailure).toBeInstanceOf(Error)
    expect(inspectionFailure).toMatchObject({
      code: 'session/model-unavailable',
      message: 'inspection unavailable',
      details: { provider: 'owned', model: 'catalog' },
    })

    const selection = await routed.selectModel!({ provider: 'owned', model: 'broken' }, signal)
    expect(failureOf(selection)).toMatchObject({
      code: 'gateway/internal',
      message: 'selection adapter drop',
      details: {},
    })
    expect(api.callsOf('session.selectModel')).toEqual([])

    const replacementRoute: SessionAdmissionModelRoute = {
      inspect: () => Promise.resolve(ok({
        current: { provider: 'owned', model: 'ok' },
        routable: true,
      })),
      selectModel: () => Promise.resolve(ok({ selected: { provider: 'owned', model: 'ok' } })),
    }
    svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => replacementRoute,
    })
    expect(svc.modelRoute(sessionId)?.inspect).toBeTypeOf('function')
  })

  it('omits modelRoute without hiding stock, unlike an explicit undefined hide', async () => {
    const { svc, api } = bench()
    const sessionId = sid('session-omit-model')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId, updatedAt: 100, running: false, blank: false }],
    }))
    await svc.refresh()
    expect(svc.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')

    const dropOmit = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    })
    expect(svc.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')
    await svc.modelRoute(sessionId)!.selectModel!({ provider: 'fixture', model: 'omit' })
    expect(api.callsOf('session.selectModel')).toEqual([{
      sessionId,
      provider: 'fixture',
      model: 'omit',
    }])
    dropOmit()

    const dropHide = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => undefined,
    })
    expect(svc.modelRoute(sessionId)).toBeUndefined()
    dropHide()
    expect(svc.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')
  })

  it('honors abort on stock selectModel without a second Remote argument', async () => {
    const generatedSelectModelIsUnary:
    Parameters<SessionRemote['selectModel']>['length'] extends 1 ? true : false = true
    expect(generatedSelectModelIsUnary).toBe(true)
    const { svc, api } = bench()
    const sessionId = sid('session-stock-abort')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId, updatedAt: 100, running: false, blank: false }],
    }))
    await svc.refresh()
    await expect(
      svc.modelRoute(sessionId)!.selectModel!(
        { provider: 'fixture', model: 'fixture' },
        AbortSignal.abort(),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(api.callsOf('session.selectModel')).toEqual([])
    await expect(
      svc.modelRoute(sessionId)!.selectModel!({ provider: 'fixture', model: 'ok' }),
    ).resolves.toMatchObject({ ok: true })
    expect(api.callsOf('session.selectModel')).toEqual([{
      sessionId,
      provider: 'fixture',
      model: 'ok',
    }])
  })

  it('catalog subagent without admission has no model route', async () => {
    const { svc, api } = bench()
    const parentId = sid('session-catalog-parent')
    const childId = sid('session-catalog-child')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId: parentId, updatedAt: 100, running: false, blank: false }],
    }))
    api.onSubagentList = () => Promise.resolve(ok({
      entries: [{
        kind: 'child',
        id: childId,
        mode: 'continuable',
        label: 'Child',
        activity: 'inactive',
        hasChildren: false,
      }],
      parentAvailable: true,
    }))
    await svc.refresh()
    await svc.refreshSubagents(parentId)
    svc.openSubagent({
      parentSessionId: parentId,
      childSessionId: childId,
      mode: 'continuable',
    })

    expect(svc.modelRoute(parentId)?.selectModel).toBeTypeOf('function')
    expect(svc.modelRoute(childId)).toBeUndefined()
    expect(api.callsOf('session.selectModel')).toEqual([])

    const omit = svc.registerAdmission(childId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    })
    expect(svc.modelRoute(childId)).toBeUndefined()
    omit()

    const childSelect = vi.fn(() => Promise.resolve(ok({ selected: { provider: 'owned', model: 'child' } })))
    const childInspect = vi.fn(() => Promise.resolve(ok({
      current: { provider: 'owned', model: 'child' },
      routable: true,
    })))
    const drop = svc.registerAdmission(childId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => ({ inspect: childInspect, selectModel: childSelect }),
    })
    await svc.modelRoute(childId)!.selectModel!({ provider: 'owned', model: 'child' })
    expect(childSelect).toHaveBeenCalledTimes(1)
    expect(api.callsOf('session.selectModel')).toEqual([])
    drop()
    expect(svc.modelRoute(childId)).toBeUndefined()
  })

  it('does not stock-route a listed subagent-origin Session or retarget its parent', async () => {
    const { svc, api } = bench()
    const parentId = sid('session-listed-parent')
    const childId = sid('session-listed-child')
    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId: parentId,
        updatedAt: 100,
        running: false,
        blank: false,
      }, {
        sessionId: childId,
        updatedAt: 100,
        running: false,
        blank: false,
        parentSessionId: parentId,
        origin: 'subagent',
      }],
    }))
    await svc.refresh()
    expect(svc.modelRoute(parentId)?.selectModel).toBeTypeOf('function')
    expect(svc.modelRoute(childId)).toBeUndefined()
    expect(svc.binding(childId)).toBeDefined()
    expect(api.callsOf('session.selectModel')).toEqual([])
  })
})
