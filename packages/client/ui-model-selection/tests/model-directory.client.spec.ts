/**
 * ModelDirectory against live ClientSessions.modelRoute: ordinary Sessions
 * load the Host catalog and select through session.selectModel; a registered
 * admission route intercepts select without a dummy availability object.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionModelRoute } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
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
        projections: {
          asOfSeq: 1,
          values: { modelSelection: { lastUsed: null, next: null } },
        },
      }],
    }))
    await svc.refresh()
    const binding = svc.binding(sessionId)
    expect(binding).toBeDefined()
    expect(svc.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')

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
    const admissionInspect = vi.fn(() => Promise.resolve(ok({
      current: { provider: 'owned', model: 'm' },
      routable: true,
    })))
    const drop = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => ({
        inspect: admissionInspect,
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

  it('loads and updates feature-owned selection when no durable projection exists', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const remotes = fakeRemote(api)
    remotes.session.modelCatalog = () => Promise.resolve(ok(CATALOG))
    const svc = new ClientSessions(ctx, remotes)
    const sessionId = sid('session-feature-model')
    svc.stageProvisional({
      sessionId,
      parentSessionId: sid('session-parent'),
      origin: 'subagent',
      title: 'Feature session',
    })
    const inspect = vi.fn()
      .mockResolvedValueOnce(ok({
        current: { provider: 'owned', model: 'initial' },
        routable: false,
      }))
      .mockResolvedValueOnce(ok({
        current: { provider: 'owned', model: 'normalized' },
        routable: true,
      }))
      .mockResolvedValueOnce(ok({
        current: { provider: 'owned', model: 'restored' },
        routable: true,
      }))
    const selectModel = vi.fn(() => Promise.resolve(ok({
      selected: { provider: 'owned', model: 'accepted' },
    })))
    svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => ({ inspect, selectModel }),
    })
    const binding = svc.binding(sessionId)!
    const catalog = new ModelCatalogDirectory({ remote: { session: remotes.session } } as never)
    const directory = new ModelDirectory(
      () => svc.modelRoute(sessionId),
      catalog,
      binding.session.projections.faceOf('modelSelection'),
      listener => svc.subscribeAdmission(listener),
    )

    await expect(directory.load()).resolves.toMatchObject({
      current: { provider: 'owned', model: 'initial' },
      routable: false,
      groups: CATALOG.groups,
      status: 'ready',
    })
    expect(inspect).toHaveBeenCalledOnce()

    await directory.select({ provider: 'owned', model: 'next' })
    expect(selectModel).toHaveBeenCalledOnce()
    expect(directory.store.getSnapshot()).toMatchObject({
      current: { provider: 'owned', model: 'normalized' },
      routable: true,
      status: 'ready',
    })
    expect(inspect).toHaveBeenCalledTimes(2)

    directory.resetConnected()
    await vi.waitFor(() => {
      expect(directory.store.getSnapshot()).toMatchObject({
        current: { provider: 'owned', model: 'restored' },
        routable: true,
        status: 'ready',
      })
    })
    expect(inspect).toHaveBeenCalledTimes(3)
  })

  it('keeps a reconnected feature inspection authoritative over a late prior generation', async () => {
    type FeatureRoute = Extract<SessionModelRoute, { kind: 'feature' }>
    type InspectionResult = Awaited<ReturnType<FeatureRoute['inspect']>>
    const stale = Promise.withResolvers<InspectionResult>()
    const fresh = Promise.withResolvers<InspectionResult>()
    const inspect = vi.fn<FeatureRoute['inspect']>()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise)
    const route: FeatureRoute = {
      kind: 'feature',
      inspect,
      selectModel: () => Promise.resolve(ok({
        selected: { provider: 'owned', model: 'selected' },
      })),
    }
    const remotes = fakeRemote(new FakeApiClient())
    remotes.session.modelCatalog = () => Promise.resolve(ok(CATALOG))
    const directory = new ModelDirectory(
      () => route,
      new ModelCatalogDirectory({ remote: { session: remotes.session } } as never),
      createSnapshotStore<unknown>(undefined),
    )

    const staleLoad = directory.load()
    await vi.waitFor(() => { expect(inspect).toHaveBeenCalledOnce() })
    directory.resetConnected()
    await vi.waitFor(() => { expect(inspect).toHaveBeenCalledTimes(2) })
    fresh.resolve(ok({
      current: { provider: 'owned', model: 'fresh' },
      routable: true,
    }))
    await vi.waitFor(() => {
      expect(directory.store.getSnapshot()).toMatchObject({
        current: { provider: 'owned', model: 'fresh' },
        routable: true,
        status: 'ready',
      })
    })
    stale.resolve(ok({
      current: { provider: 'owned', model: 'stale' },
      routable: false,
    }))
    await staleLoad
    expect(directory.store.getSnapshot()).toMatchObject({
      current: { provider: 'owned', model: 'fresh' },
      routable: true,
    })
  })

  it('publishes a feature inspection failure through the directory error state', async () => {
    const route: Extract<SessionModelRoute, { kind: 'feature' }> = {
      kind: 'feature',
      inspect: () => Promise.resolve({
        ok: false,
        error: new RemoteError('gateway/internal', 'feature model owner unavailable', {}),
      }),
      selectModel: () => Promise.resolve(ok({
        selected: { provider: 'owned', model: 'selected' },
      })),
    }
    const remotes = fakeRemote(new FakeApiClient())
    remotes.session.modelCatalog = () => Promise.resolve(ok(CATALOG))
    const directory = new ModelDirectory(
      () => route,
      new ModelCatalogDirectory({ remote: { session: remotes.session } } as never),
      createSnapshotStore<unknown>(undefined),
    )

    await expect(directory.load()).rejects.toThrow(
      'session model inspection failed: gateway/internal: feature model owner unavailable',
    )
    expect(directory.store.getSnapshot()).toMatchObject({
      current: null,
      routable: null,
      status: 'error',
      error: 'gateway/internal: feature model owner unavailable',
    })
  })

  it('refuses select after a live explicit modelRoute hide', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const remotes = fakeRemote(api)
    remotes.session.modelCatalog = () => Promise.resolve(ok(CATALOG))
    const svc = new ClientSessions(ctx, remotes)
    const sessionId = sid('session-live-hide')
    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId,
        updatedAt: 100,
        running: false,
        blank: false,
        projections: {
          asOfSeq: 1,
          values: { modelSelection: { lastUsed: null, next: null } },
        },
      }],
    }))
    await svc.refresh()
    const binding = svc.binding(sessionId)!
    const catalog = new ModelCatalogDirectory({ remote: { session: remotes.session } } as never)
    const directory = new ModelDirectory(
      () => svc.modelRoute(sessionId),
      catalog,
      binding.session.projections.faceOf('modelSelection'),
      listener => svc.subscribeAdmission(listener),
    )
    await directory.load()
    expect(directory.store.getSnapshot().available).toBe(true)
    const drop = svc.registerAdmission(sessionId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      modelRoute: () => undefined,
    })
    expect(directory.store.getSnapshot().available).toBe(false)
    await expect(directory.select({ provider: 'fixture', model: 'fixture' }))
      .rejects.toThrow(/unavailable for this session/)
    expect(api.callsOf('session.selectModel')).toEqual([])
    drop()
    expect(directory.store.getSnapshot().available).toBe(true)
  })
})
