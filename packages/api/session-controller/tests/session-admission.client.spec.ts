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
import { describe, expect, it, vi } from 'vitest'
import type { MessageId, SessionId } from '@deepseek-ai/dsh-session/types'
import { ClientSessions } from '../src/client/sessions/service.ts'
import type { SessionAdmissionAdapter, SessionAdmissionRoute } from '../src/client/contract/admission.ts'
import {
  FakeApiClient,
  fakeRemote,
  ok,
  type RuntimeRemotes,
} from './fake-api.client.ts'

const sid = (s: string): SessionId => s as SessionId
const mid = (m: string): MessageId => m as MessageId

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
    )

    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(promptHandler).toHaveBeenCalledTimes(1)
    expect(promptHandler).toHaveBeenCalledWith(
      provisionalId,
      [{ type: 'text', text: 'start side chat' }],
      'queue',
      undefined,
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
          ok: false,
          error: {
            code: 'attachment-error',
            message: 'Images unsupported in Side Chat.',
            details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
          },
        })
      }),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    svc.registerAdmission(sessionId, route)

    // First attempt fails with error receipt
    const result1 = await binding.session.prompt([{ type: 'text', text: 'attempt 1' }], 'queue')
    expect(result1.ok).toBe(false)
    expect(result1.error.code).toBe('attachment-error')

    // Must NOT fall back to remote
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])
    expect(binding.session.getSnapshot().promptError).toEqual({
      op: 'send',
      error: {
        code: 'attachment-error',
        message: 'Images unsupported in Side Chat.',
        details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
      },
    })
    // Failed first prompt keeps session blank
    expect(binding.session.getSnapshot().blank).toBe(true)

    // Second attempt throws an unexpected Error
    route.prompt = vi.fn(() => Promise.reject(new Error('Network drop in adapter')))
    const result2 = await binding.session.prompt([{ type: 'text', text: 'attempt 2' }], 'queue')
    expect(result2.ok).toBe(false)
    expect(result2.error.code).toBe('gateway/internal')
    expect(result2.error.message).toBe('Network drop in adapter')

    // Still no remote call
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])
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
      ok: false,
      error: { code: 'cancel-failed', message: 'unable to stop' },
    }))

    const failedResult = await binding.session.cancel()
    expect(failedResult.ok).toBe(false)
    expect(api.calls.filter(c => c.method === 'session.cancel')).toEqual([])
    expect(binding.session.getSnapshot().promptError).toEqual({
      op: 'stop',
      error: { code: 'cancel-failed', message: 'unable to stop' },
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
    const res2 = await binding.session.updateQueue(mid('item-2'), { kind: 'up' })
    expect(res2.ok).toBe(false)
    expect(res2.error.code).toBe('gateway/internal')
    expect(res2.error.message).toContain('does not support queue mutation')
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
    expect(unhandledRes.ok).toBe(false)
    expect(unhandledRes.error.code).toBe('gateway/internal')
    expect(unhandledRes.error.message).toContain('does not support commands')
    expect(promptMock).not.toHaveBeenCalled()
    expect(executeSpy).not.toHaveBeenCalled()

    drop()
  })

  it('manages pattern-based SessionAdmissionAdapter registrations and rejects duplicate adapter ids', async () => {
    const { svc } = bench()
    const targetId = sid('subagent-sidechat-123')
    const otherId = sid('session-normal-456')

    const promptMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))

    const adapter: SessionAdmissionAdapter = {
      id: 'test-adapter',
      handles: sessionId => sessionId === targetId,
      prompt: promptMock,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }

    const drop = svc.registerAdmissionAdapter(adapter)

    // Duplicate registration rejected
    expect(() => {
      svc.registerAdmissionAdapter(adapter)
    }).toThrowError('sessions.registerAdmissionAdapter: duplicate adapter "test-adapter"')

    expect(svc.resolveAdmission(targetId)).toBe(adapter)
    expect(svc.resolveAdmission(otherId)).toBeUndefined()

    // Exact registration takes precedence over adapter
    const exactPrompt = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const exactRoute: SessionAdmissionRoute = {
      prompt: exactPrompt,
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    }
    const dropExact = svc.registerAdmission(targetId, exactRoute)
    expect(svc.resolveAdmission(targetId)).toBe(exactRoute)

    dropExact()
    expect(svc.resolveAdmission(targetId)).toBe(adapter)

    drop()
    expect(svc.resolveAdmission(targetId)).toBeUndefined()
  })

  it('dispatches prompt, cancel, queue, and command through a matching adapter on an existing binding', async () => {
    const { svc, api, remote } = bench()
    const sessionId = sid('session-adapter-dispatch')

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
    const cancelMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const updateQueueMock = vi.fn(() => Promise.resolve(ok({ accepted: true as const })))
    const commandMock = vi.fn(() => Promise.resolve(ok({ matched: true })))
    const executeSpy = vi.spyOn(remote.commands, 'execute')

    const adapter: SessionAdmissionAdapter = {
      id: 'dispatch-adapter',
      handles: candidate => candidate === sessionId,
      prompt: promptMock,
      cancel: cancelMock,
      updateQueue: updateQueueMock,
      command: commandMock,
    }
    const drop = svc.registerAdmissionAdapter(adapter)

    await expect(binding.session.prompt([{ type: 'text', text: 'via adapter' }], 'queue'))
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(binding.session.cancel())
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(binding.session.updateQueue(mid('item-adapter'), { kind: 'steer' }))
      .resolves.toEqual({ ok: true, value: { accepted: true } })
    await expect(binding.session.command('/permission full'))
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

    drop()
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
    expect(api.calls.some(c => c.method === 'subagents.prompt')).toBe(true)
    expect(api.calls.filter(c => c.method === 'session.prompt')).toEqual([])
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

  it('delegates modelRoute, commandCatalogSessionId, and skillCatalogSessionId to admission', () => {
    const { svc } = bench()
    const sessionId = sid('session-catalogs-1')
    const parentId = sid('session-parent-0')

    const customModelRoute = {
      models: vi.fn(() => Promise.resolve(ok({}))),
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

    expect(svc.modelRoute(sessionId)).toBe(customModelRoute)
    expect(svc.commandCatalogSessionId(sessionId)).toBeUndefined()
    expect(svc.skillCatalogSessionId(sessionId)).toBe(parentId)

    drop()

    expect(svc.modelRoute(sessionId)).toBeUndefined()
    expect(svc.commandCatalogSessionId(sessionId)).toBe(sessionId)
    expect(svc.skillCatalogSessionId(sessionId)).toBe(sessionId)
  })
})
