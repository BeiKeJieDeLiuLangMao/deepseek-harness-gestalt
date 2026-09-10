/**
 * Host-backed GUI face persists accounts through imConfig remotes.
 */
import { describe, expect, it } from 'vitest'
import { createImGuiStore, emptyGuiSnapshot } from '../src/client/model.ts'
import { createHostImGuiFace, type ImConfigRemote } from '../src/client/host-controller.ts'

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
    const face = createHostImGuiFace(createImGuiStore(emptyGuiSnapshot()), remote)
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
    const face = createHostImGuiFace(store, remote)
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
})
