/**
 * Host-backed GUI face persists accounts through imConfig remotes.
 */
import { describe, expect, it } from 'vitest'
import { createImGuiStore, emptyGuiSnapshot } from '../src/client/model.ts'
import { createHostImGuiFace, type ImConfigRemote, type ImDeliveryRemote } from '../src/client/host-controller.ts'

function emptyDelivery(): ImDeliveryRemote {
  return {
    queryHistory: async () => ({ ok: true as const, value: [] }),
    listOutbound: async () => ({ ok: true as const, value: [] }),
    registerManualOutbound: async () => ({ ok: true as const, value: undefined as never }),
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
})
