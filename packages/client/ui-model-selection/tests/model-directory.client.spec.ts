/**
 * ModelDirectory against live ClientSessions.modelRoute: ordinary Sessions
 * load the Host catalog and select through session.selectModel; a registered
 * admission route intercepts select without a dummy availability object.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session/types'
import { ClientSessions } from '../../../api/session-controller/src/client/sessions/service.ts'
import {
  FakeApiClient,
  fakeRemote,
  ok,
} from '../../../api/session-controller/tests/fake-api.client.ts'
import { ModelCatalogDirectory } from '../src/client/catalog.ts'
import { ModelDirectory } from '../src/client/directory.ts'

const sid = (value: string): SessionId => value as SessionId

const CATALOG = {
  default: { provider: 'fixture', model: 'fixture' },
  routableProviders: ['fixture'],
  groups: [{
    id: 'fixture',
    name: 'Fixture',
    models: [{ id: 'fixture', name: 'Fixture' }],
  }],
  failures: [],
}

describe('ModelDirectory over ClientSessions.modelRoute', () => {
  it('loads and selects through the stock Host catalog for an ordinary Session, then follows admission', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const remotes = fakeRemote(api)
    remotes.session.modelCatalog = () => Promise.resolve(ok(CATALOG))
    const svc = new ClientSessions(ctx, remotes)
    const sessionId = sid('session-ordinary-model')
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
    expect(svc.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')

    binding!.session.projections.apply('modelSelection', { lastUsed: null, next: null }, SessionSeq(1))
    const catalog = new ModelCatalogDirectory({ remote: { session: remotes.session } } as never)
    const directory = new ModelDirectory(
      () => svc.modelRoute(sessionId),
      catalog,
      binding!.session.projections.faceOf('modelSelection'),
    )

    const loaded = await directory.load()
    expect(loaded.groups).toEqual(CATALOG.groups)
    expect(loaded.current).toEqual(CATALOG.default)

    await directory.select({ provider: 'fixture', model: 'fixture' })
    expect(api.callsOf('session.selectModel')).toEqual([{
      sessionId,
      provider: 'fixture',
      model: 'fixture',
    }])

    const admissionSelect = vi.fn(() => Promise.resolve(ok({
      selected: { provider: 'owned', model: 'm' },
    })))
    const drop = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => ({
        models: () => Promise.resolve(ok(CATALOG)),
        selectModel: admissionSelect,
      }),
    })
    await directory.select({ provider: 'owned', model: 'm' })
    expect(admissionSelect).toHaveBeenCalledTimes(1)
    expect(api.callsOf('session.selectModel')).toHaveLength(1)

    drop()
    await directory.select({ provider: 'fixture', model: 'fixture' })
    expect(api.callsOf('session.selectModel')).toHaveLength(2)
  })
})
