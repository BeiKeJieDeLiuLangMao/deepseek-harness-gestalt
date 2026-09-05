/**
 * Command directory uses ISessions.commandCatalogSessionId for display list
 * only. Execute stays on the composer Session. Omitting the helper hides
 * the generic catalog; a failed list is an error.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ClientSessions } from '../../../api/session-controller/src/client/sessions/service.ts'
import { FakeApiClient, fakeRemote, ok } from '../../../api/session-controller/tests/fake-api.client.ts'
import { loadCommandCatalog } from '../src/client/catalog.ts'

const sid = (value: string): SessionId => value as SessionId

describe('loadCommandCatalog', () => {
  it('hides the generic catalog when a feature omits the helper and lists ordinary Sessions as self', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const svc = new ClientSessions(ctx, fakeRemote(api))
    const ordinaryId = sid('session-ordinary')
    const featureId = sid('session-sidechat')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId: ordinaryId, updatedAt: 1, running: false, blank: false }],
    }))
    await svc.refresh()
    svc.stageProvisional({
      sessionId: featureId,
      parentSessionId: ordinaryId,
      origin: 'subagent',
      title: 'New thread',
    })
    svc.registerAdmission(featureId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      command: vi.fn(() => Promise.resolve(ok({ matched: true }))),
    })
    const listed: SessionId[] = []
    const commands = {
      list: async (sessionId: SessionId) => {
        listed.push(sessionId)
        return { ok: true as const, value: [{ name: 'plan', description: 'plan' }] }
      },
    }
    await expect(loadCommandCatalog(svc, commands, featureId)).resolves.toEqual([])
    await expect(loadCommandCatalog(svc, commands, ordinaryId)).resolves.toEqual([
      { name: 'plan', description: 'plan' },
    ])
    expect(listed).toEqual([ordinaryId])
  })

  it('throws when the Host command list fails after a catalog identity is given', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const svc = new ClientSessions(ctx, fakeRemote(api))
    const sessionId = sid('session-ordinary')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId, updatedAt: 1, running: false, blank: false }],
    }))
    await svc.refresh()
    const commands = {
      list: async () => ({
        ok: false as const,
        error: { code: 'gateway/internal', message: 'provider missing' },
      }),
    }
    await expect(loadCommandCatalog(svc, commands, sessionId))
      .rejects.toThrow('command.list failed: gateway/internal: provider missing')
  })
})
