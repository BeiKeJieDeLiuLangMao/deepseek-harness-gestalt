/**
 * Host-backed GUI face persists accounts through imConfig remotes.
 */
import { describe, expect, it } from 'vitest'
import { createImGuiStore, emptyGuiSnapshot } from '../src/client/model.ts'
import { createHostImGuiFace, type ImConfigRemote, type ImDeliveryRemote, type ImSimulationRemote } from '../src/client/host-controller.ts'

function emptyDelivery(): ImDeliveryRemote {
  return {
    queryHistory: async () => ({ ok: true as const, value: [] }),
    listOutbound: async () => ({ ok: true as const, value: [] }),
    registerManualOutbound: async () => ({ ok: true as const, value: undefined as never }),
    cancelPendingAiOutbound: async () => ({ ok: true as const, value: [] }),
  } as unknown as ImDeliveryRemote
}

describe('IM Host GUI controller', () => {
  it('upserts an account then refreshes from Host lists', async () => {
    const calls: string[] = []
    const remote = {
      listAccounts: async () => {
        calls.push('listAccounts')
        return { ok: true as const, value: [] }
      },
      listRouteRules: async () => {
        calls.push('listRouteRules')
        return { ok: true as const, value: [] }
      },
      listSimulationConfigs: async () => {
        calls.push('listSimulationConfigs')
        return { ok: true as const, value: [] }
      },
      upsertAccount: async () => {
        calls.push('upsertAccount')
        return { ok: true as const, value: undefined as never }
      },
      pauseAccount: async () => ({ ok: true as const, value: undefined as never }),
      deleteAccount: async () => ({ ok: true as const, value: false }),
      deleteRouteRule: async () => ({ ok: true as const, value: false }),
      getSimulationConfig: async () => ({ ok: true as const, value: undefined }),
      createRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      updateRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      setSimulationConfig: async () => ({ ok: true as const, value: undefined as never }),
      deleteSimulationConfig: async () => ({ ok: true as const, value: false }),
    } as unknown as ImConfigRemote
    const face = createHostImGuiFace(createImGuiStore(emptyGuiSnapshot()), remote, emptyDelivery())
    await Promise.resolve()
    expect(calls.filter(name => name === 'upsertAccount')).toEqual([])
    face.connect('dingtalk', '陈小宇')
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toContain('upsertAccount')
  })

  it('marks an existing account disconnected instead of deleting it', async () => {
    const payloads: unknown[] = []
    const remote = {
      listAccounts: async () => ({ ok: true as const, value: [] }),
      listRouteRules: async () => ({ ok: true as const, value: [] }),
      listSimulationConfigs: async () => ({ ok: true as const, value: [] }),
      upsertAccount: async (options: unknown) => {
        payloads.push(options)
        return { ok: true as const, value: undefined as never }
      },
      pauseAccount: async () => ({ ok: true as const, value: undefined as never }),
      deleteAccount: async () => ({ ok: true as const, value: false }),
      deleteRouteRule: async () => ({ ok: true as const, value: false }),
      getSimulationConfig: async () => ({ ok: true as const, value: undefined }),
      createRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      updateRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      setSimulationConfig: async () => ({ ok: true as const, value: undefined as never }),
      deleteSimulationConfig: async () => ({ ok: true as const, value: false }),
    } as unknown as ImConfigRemote
    const store = createImGuiStore({
      ...emptyGuiSnapshot(),
      accounts: [{
        id: 'acc-dt',
        platform: 'dingtalk',
        displayName: '陈小宇',
        connected: true,
        paused: false,
        authState: 'ok',
        credentialRef: 'cred:dingtalk-dws',
      }],
    })
    const face = createHostImGuiFace(store, remote, emptyDelivery())
    await Promise.resolve()
    face.disconnect('acc-dt')
    await Promise.resolve()
    await Promise.resolve()
    expect(payloads).toEqual([{
      id: 'acc-dt',
      platform: 'dingtalk',
      displayName: '陈小宇',
      credentialRef: 'cred:dingtalk-dws',
      status: 'disconnected',
      paused: false,
    }])
  })

  it('queues manual send through imDelivery registerOutbound without claiming sent locally', async () => {
    const payloads: unknown[] = []
    const remote = {
      listAccounts: async () => ({ ok: true as const, value: [{
        id: 'acc-dt',
        platform: 'dingtalk' as const,
        displayName: '陈小宇',
        status: 'connected' as const,
        paused: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listRouteRules: async () => ({ ok: true as const, value: [{
        id: 'route-group',
        accountId: 'acc-dt',
        conversationKind: 'group' as const,
        target: { kind: 'specific' as const, conversationId: '度假开发联调群' },
        workspaceId: 'ws-tested',
        enabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listSimulationConfigs: async () => ({ ok: true as const, value: [] }),
      upsertAccount: async () => ({ ok: true as const, value: undefined as never }),
      pauseAccount: async () => ({ ok: true as const, value: undefined as never }),
      deleteAccount: async () => ({ ok: true as const, value: false }),
      deleteRouteRule: async () => ({ ok: true as const, value: false }),
      getSimulationConfig: async () => ({ ok: true as const, value: undefined }),
      createRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      updateRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      setSimulationConfig: async () => ({ ok: true as const, value: undefined as never }),
      deleteSimulationConfig: async () => ({ ok: true as const, value: false }),
    } as unknown as ImConfigRemote
    const delivery = {
      queryHistory: async () => ({ ok: true as const, value: [] }),
      listOutbound: async () => ({ ok: true as const, value: [] }),
      registerManualOutbound: async (options: unknown) => {
        payloads.push(options)
        return { ok: true as const, value: undefined as never }
      },
    } as unknown as ImDeliveryRemote
    const face = createHostImGuiFace(createImGuiStore(emptyGuiSnapshot()), remote, delivery)
    await Promise.resolve()
    face.manualSend('已从 DSH 补了一句。')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({
      text: '已从 DSH 补了一句。',
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        conversationId: '度假开发联调群',
      },
    })
  })

  it('disables the matching Host route and cancels pending AI outbound', async () => {
    const updates: unknown[] = []
    const cancelled: unknown[] = []
    const remote = {
      listAccounts: async () => ({ ok: true as const, value: [{
        id: 'acc-dt',
        platform: 'dingtalk' as const,
        displayName: '陈小宇',
        status: 'connected' as const,
        paused: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listRouteRules: async () => ({ ok: true as const, value: [{
        id: 'route-group',
        accountId: 'acc-dt',
        conversationKind: 'group' as const,
        target: { kind: 'all' as const },
        workspaceId: 'ws-tested',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listSimulationConfigs: async () => ({ ok: true as const, value: [] }),
      upsertAccount: async () => ({ ok: true as const, value: undefined as never }),
      pauseAccount: async () => ({ ok: true as const, value: undefined as never }),
      deleteAccount: async () => ({ ok: true as const, value: false }),
      deleteRouteRule: async () => ({ ok: true as const, value: false }),
      getSimulationConfig: async () => ({ ok: true as const, value: undefined }),
      createRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      updateRouteRule: async (id: unknown, patch: unknown) => {
        updates.push({ id, patch })
        return { ok: true as const, value: undefined as never }
      },
      setSimulationConfig: async () => ({ ok: true as const, value: undefined as never }),
      deleteSimulationConfig: async () => ({ ok: true as const, value: false }),
    } as unknown as ImConfigRemote
    const delivery = {
      queryHistory: async () => ({ ok: true as const, value: [] }),
      listOutbound: async () => ({ ok: true as const, value: [] }),
      registerManualOutbound: async () => ({ ok: true as const, value: undefined as never }),
      cancelPendingAiOutbound: async (options: unknown) => {
        cancelled.push(options)
        return { ok: true as const, value: [] }
      },
    } as unknown as ImDeliveryRemote
    const face = createHostImGuiFace(createImGuiStore(emptyGuiSnapshot()), remote, delivery)
    await Promise.resolve()
    face.setPanel('disabled')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(updates).toEqual([{ id: 'route-group', patch: { enabled: false } }])
    expect(cancelled).toEqual([{
      scope: {
        kind: 'real',
        platform: 'dingtalk',
        accountId: 'acc-dt',
        conversationId: 'gui-all',
        conversationKind: 'group',
      },
      reason: 'conversation_route_disabled',
    }])
  })

  it('opens simulated-user and tested-agent Sessions through uiWorkspace', async () => {
    const opened: Array<{ workspaceId: string; sessionId: string }> = []
    const remote = {
      listAccounts: async () => ({ ok: true as const, value: [{
        id: 'acc-dt',
        platform: 'dingtalk' as const,
        displayName: '陈小宇',
        status: 'connected' as const,
        paused: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listRouteRules: async () => ({ ok: true as const, value: [{
        id: 'route-group',
        accountId: 'acc-dt',
        conversationKind: 'group' as const,
        target: { kind: 'all' as const },
        workspaceId: 'ws-tested',
        enabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listSimulationConfigs: async () => ({ ok: true as const, value: [{
        workspaceId: 'ws-simuser',
        targetAccountId: 'acc-dt',
        conversationKind: 'group' as const,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      upsertAccount: async () => ({ ok: true as const, value: undefined as never }),
      pauseAccount: async () => ({ ok: true as const, value: undefined as never }),
      deleteAccount: async () => ({ ok: true as const, value: false }),
      deleteRouteRule: async () => ({ ok: true as const, value: false }),
      getSimulationConfig: async () => ({ ok: true as const, value: undefined }),
      createRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      updateRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      setSimulationConfig: async () => ({ ok: true as const, value: undefined as never }),
      deleteSimulationConfig: async () => ({ ok: true as const, value: false }),
    } as unknown as ImConfigRemote
    const store = createImGuiStore(emptyGuiSnapshot())
    const face = createHostImGuiFace(store, remote, emptyDelivery(), {
      openWorkspace: async (workspaceId, beforeOpen) => {
        const sessionId = workspaceId === 'ws-simuser' ? 'sess-simuser' : 'sess-tested'
        opened.push({ workspaceId, sessionId })
        beforeOpen?.(sessionId as never)
      },
    })
    await Promise.resolve()
    face.setRole('simuser')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(opened).toEqual([{ workspaceId: 'ws-simuser', sessionId: 'sess-simuser' }])
    expect(store.getSnapshot().conversation).toMatchObject({
      role: 'simuser',
      simUserSessionId: 'sess-simuser',
    })
    face.setRole('tested')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(opened[1]).toEqual({ workspaceId: 'ws-tested', sessionId: 'sess-tested' })
    expect(store.getSnapshot().conversation).toMatchObject({
      role: 'tested',
      testedSessionId: 'sess-tested',
    })
  })

  it('creates a Host simulation instance and refreshes the simuser stream', async () => {
    const created: unknown[] = []
    const remote = {
      listAccounts: async () => ({ ok: true as const, value: [{
        id: 'acc-dt',
        platform: 'dingtalk' as const,
        displayName: '陈小宇',
        status: 'connected' as const,
        paused: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listRouteRules: async () => ({ ok: true as const, value: [{
        id: 'route-group',
        accountId: 'acc-dt',
        conversationKind: 'group' as const,
        target: { kind: 'all' as const },
        workspaceId: 'ws-tested',
        enabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      listSimulationConfigs: async () => ({ ok: true as const, value: [{
        workspaceId: 'ws-simuser',
        targetAccountId: 'acc-dt',
        conversationKind: 'group' as const,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] }),
      upsertAccount: async () => ({ ok: true as const, value: undefined as never }),
      pauseAccount: async () => ({ ok: true as const, value: undefined as never }),
      deleteAccount: async () => ({ ok: true as const, value: false }),
      deleteRouteRule: async () => ({ ok: true as const, value: false }),
      getSimulationConfig: async () => ({ ok: true as const, value: undefined }),
      createRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      updateRouteRule: async () => ({ ok: true as const, value: undefined as never }),
      setSimulationConfig: async () => ({ ok: true as const, value: undefined as never }),
      deleteSimulationConfig: async () => ({ ok: true as const, value: false }),
    } as unknown as ImConfigRemote
    const instance = {
      instanceId: 'sim-gui',
      workspaceId: 'ws-simuser',
      testedWorkspaceId: 'ws-tested',
      target: { accountId: 'acc-dt', conversationKind: 'group' as const, conversationId: 'gui-all' },
      status: 'running' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    let instances: unknown[] = []
    const simulation = {
      listInstances: async () => ({ ok: true as const, value: instances }),
      createInstance: async (options: unknown) => {
        created.push(options)
        instances = [instance]
        return { ok: true as const, value: instance as never }
      },
    } as unknown as ImSimulationRemote
    const store = createImGuiStore({
      ...emptyGuiSnapshot(),
      conversation: { ...emptyGuiSnapshot().conversation, role: 'simuser' },
    })
    const face = createHostImGuiFace(store, remote, emptyDelivery(), undefined, simulation)
    const drain = async (): Promise<void> => {
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    }
    await drain()
    face.createSimulation()
    await drain()
    expect(created).toEqual([{ workspaceId: 'ws-simuser' }])
    expect(store.getSnapshot().conversation).toMatchObject({
      role: 'simuser',
      title: '模拟：gui-all',
      simulationInstanceId: 'sim-gui',
    })
  })
})
