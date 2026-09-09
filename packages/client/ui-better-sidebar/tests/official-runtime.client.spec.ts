// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SidebarRightProjection, SidebarRightTabCloseContext,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarSessionList } from '../src/context-types.ts'
import { api } from '../src/client/api.ts'
import {
  createOfficialAgentTerminalPayload, createOfficialSidechatPayload,
  createOfficialUiTerminalPayload, officialSidechatPayloadOf, officialTerminalPayloadOf,
  restoreOfficialSidechatPayload,
} from '../src/client/official-runtime/payload.ts'
import {
  closeOfficialSidechat, OFFICIAL_SIDECHAT_TOMBSTONES, officialSidechatTombstonesOf,
  subscribeOfficialSidechatRuntime, type OfficialSidechatContext,
} from '../src/client/official-runtime/sidechat-runtime.ts'
import {
  canOpenOfficialUiTerminal, closeOfficialTerminal, officialAgentTerminalRowsOf,
  officialTerminalViewLifecycle, officialUiTerminalCount, reconcileOfficialAgentTerminals,
  subscribeOfficialAgentTerminals, type OfficialTerminalContext,
} from '../src/client/official-runtime/terminal-runtime.ts'
import {
  OFFICIAL_RUNTIME_INJECT, OFFICIAL_SIDECHAT_DEFINITION_ID, OFFICIAL_TERMINAL_DEFINITION_ID,
  registerOfficialRuntimeTabs, subscribeOfficialBottomTerminal,
} from '../src/client/official-runtime/index.ts'

type OfficialTabId = SidebarRightTabCloseContext['tab']['id']

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function tabProjection(
  sessionId: string,
  id: string,
  kind: string,
  payload: unknown,
  options: { surface?: 'right' | 'bottom'; pin?: object; title?: string } = {},
) {
  return {
    sessionId: SessionId(sessionId),
    surface: options.surface ?? 'right',
    paneId: 'pane-1',
    floating: false,
    active: false,
    visible: false,
    record: { id, kind, contentId: `sidebar://${kind}/${id}`, title: options.title ?? kind },
    state: { payload, ...(options.pin === undefined ? {} : { pin: options.pin }) },
  } as unknown as SidebarRightProjection['sessions'][number]['tabs'][number]
}

function projection(
  sessionId: string,
  tabs: ReturnType<typeof tabProjection>[],
  data: Record<string, unknown> = {},
  bottomOpenedOnce = false,
) {
  return {
    mountedSessionId: SessionId(sessionId),
    sessions: [{
      sessionId: SessionId(sessionId),
      rightExpanded: true,
      bottomExpanded: false,
      bottomHeight: 300,
      bottomOpenedOnce,
      tabs,
      data,
    }],
    pinned: tabs.filter(tab => tab.state.pin !== undefined),
  } as unknown as SidebarRightProjection
}

function closeContext(
  sessionId: string,
  tabId: string,
  kind: string,
  payload: unknown,
): SidebarRightTabCloseContext {
  return {
    sessionId: SessionId(sessionId),
    surface: 'right',
    tab: { id: tabId as OfficialTabId, kind, contentId: `sidebar://${kind}/${tabId}`, title: kind },
    payload: payload as never,
    pin: undefined,
    signal: new AbortController().signal,
    reason: 'close',
  }
}

describe('official runtime payloads', () => {
  it('round-trips current Side Chat and Terminal identities and rejects partial data', () => {
    const draft = createOfficialSidechatPayload(SessionId('side-1'))
    expect(officialSidechatPayloadOf(draft)).toEqual(draft)
    expect(officialSidechatPayloadOf({ ...draft, provisional: false })).toBeUndefined()
    expect(restoreOfficialSidechatPayload(SessionId('side-1'))).toEqual({
      rootThreadId: 'side-1', threadId: 'side-1',
    })

    const ui = createOfficialUiTerminalPayload('terminal-1')
    const agent = createOfficialAgentTerminalPayload('agent-1')
    expect(officialTerminalPayloadOf(ui)).toEqual(ui)
    expect(officialTerminalPayloadOf(agent)).toEqual(agent)
    expect(officialTerminalPayloadOf({ owner: 'ui', runtimeId: '' })).toBeUndefined()
    expect(() => createOfficialUiTerminalPayload('')).toThrow('must not be empty')
  })

  it('normalizes Side Chat tombstones without duplicates or malformed ids', () => {
    expect(officialSidechatTombstonesOf(['side-1', 7, '', 'side-1', 'side-2']))
      .toEqual(['side-1', 'side-2'])
    expect(officialSidechatTombstonesOf({})).toEqual([])
  })
})

describe('official runtime registration', () => {
  it('publishes one definition/body set and preserves the three-Terminal capacity', async () => {
    class FakeWebSocket {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      close(): void { this.onclose?.() }
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.spyOn(api, 'shellGet').mockResolvedValue({ shell: '/bin/zsh', name: 'zsh' })
    const definitions: Array<{ id: string; create?: (request: never) => unknown; available?: (context: never) => boolean }> = []
    const slotEntries: Array<{ name: string; key?: string; id?: string; component: unknown }> = []
    const sessionListeners = new Set<() => void>()
    const sidebarListeners = new Set<() => void>()
    const workspaceListeners = new Set<() => void>()
    const ctx = {
      sidebarRightTabs: {
        register: vi.fn((definition) => {
          definitions.push(definition)
          return () => { definitions.splice(definitions.indexOf(definition), 1) }
        }),
      },
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { terminalFontFamily: '', terminalFontSize: 13 } }),
        subscribe: () => () => {},
      },
      sidebarRight: {
        getSnapshot: () => ({ sessions: [], pinned: [] }),
        subscribe: (listener: () => void) => {
          sidebarListeners.add(listener)
          return () => { sidebarListeners.delete(listener) }
        },
        forSession: () => ({ openTab: vi.fn(), update: vi.fn(), setData: vi.fn(), close: vi.fn() }),
      },
      slots: {
        inject: (_name: string, register: () => () => void) => register(),
        register: (entry: { name: string; key?: string; id?: string }, component: unknown) => {
          const recorded = { ...entry, component }
          slotEntries.push(recorded)
          return () => { slotEntries.splice(slotEntries.indexOf(recorded), 1) }
        },
      },
      sessions: {
        list: {
          getSnapshot: () => ({ current: undefined, byId: {} }),
          subscribe: (listener: () => void) => {
            sessionListeners.add(listener)
            return () => { sessionListeners.delete(listener) }
          },
        },
      },
      workspaces: {
        list: {
          getSnapshot: () => ({ phase: 'ready', archivedSessionIds: [] }),
          subscribe: (listener: () => void) => {
            workspaceListeners.add(listener)
            return () => { workspaceListeners.delete(listener) }
          },
        },
      },
    } as unknown as Parameters<typeof registerOfficialRuntimeTabs>[0]

    expect(OFFICIAL_RUNTIME_INJECT).toEqual([
      'slots', 'sidebarRight', 'sidebarRightTabs', 'sidebarRightPreferences',
      'sessions', 'workspaces', 'uiRenderer',
    ])
    const dispose = registerOfficialRuntimeTabs(ctx)
    await Promise.resolve()
    expect(definitions.map(definition => definition.id)).toEqual([
      OFFICIAL_SIDECHAT_DEFINITION_ID,
      OFFICIAL_TERMINAL_DEFINITION_ID,
    ])
    expect(slotEntries.map(entry => [entry.name, entry.key ?? entry.id])).toEqual([
      ['sidebar.right.pane.tab', OFFICIAL_SIDECHAT_DEFINITION_ID],
      ['sidebar.right.pane.tab', OFFICIAL_TERMINAL_DEFINITION_ID],
      ['sidebar.right.tab.menu.item', `${OFFICIAL_TERMINAL_DEFINITION_ID}/pin`],
    ])
    const terminal = definitions[1]!
    const base = {
      sessionId: SessionId('session-a'),
      preferences: {},
      kind: 'terminal',
      address: 'sidebar://terminal',
      title: 'Terminal',
      params: undefined,
      payload: undefined,
      pin: undefined,
    }
    const terminalTab = (id: string) => ({
      id,
      kind: 'terminal',
      contentId: `sidebar://terminal/${id}`,
      title: 'Terminal',
      surface: 'right' as const,
      floating: false,
      payload: createOfficialUiTerminalPayload(id),
      pin: undefined,
    })
    const one = terminalTab('one')
    const two = terminalTab('two')
    const three = terminalTab('three')
    expect(terminal.available?.({ ...base, tabs: [one, two, three] } as never)).toBe(false)
    expect(terminal.create?.({ ...base, tabs: [one, two, three] } as never)).toBe(false)
    expect(terminal.create?.({
      ...base,
      tabs: [one, two, three],
      payload: createOfficialUiTerminalPayload('one'),
    } as never)).toMatchObject({ payload: { owner: 'ui', runtimeId: 'one' } })
    expect(terminal.create?.({ ...base, tabs: [one] } as never)).toMatchObject({
      title: 'zsh',
      payload: { owner: 'ui' },
    })

    dispose()
    expect(definitions).toEqual([])
    expect(slotEntries).toEqual([])
    expect(sessionListeners.size).toBe(0)
    expect(sidebarListeners.size).toBe(0)
    expect(workspaceListeners.size).toBe(0)
  })
})

describe('official Side Chat occurrence owner', () => {
  it('awaits Host publication, archives only the original published child, then records its tombstone', async () => {
    let publish!: (value: { accepted: true; published: boolean }) => void
    const sidechatDispose = vi.spyOn(api, 'sidechatDispose').mockReturnValue(new Promise(resolve => { publish = resolve }))
    const archiveSession = vi.fn(() => Promise.resolve())
    const setData = vi.fn()
    const current = projection('session-a', [], { [OFFICIAL_SIDECHAT_TOMBSTONES]: ['older'] })
    const ctx = {
      sidebarRight: {
        getSnapshot: () => current,
        forSession: vi.fn(() => ({ setData })),
      },
      workspaces: { archiveSession },
    } as unknown as OfficialSidechatContext
    const closing = closeOfficialSidechat(ctx, closeContext(
      'session-a',
      'sidechat-tab',
      'sidechat',
      { rootThreadId: 'side-root', threadId: 'nested-child' },
    ))

    expect(archiveSession).not.toHaveBeenCalled()
    expect(setData).not.toHaveBeenCalled()
    publish({ accepted: true, published: true })
    await closing

    expect(sidechatDispose).toHaveBeenCalledWith('side-root')
    expect(archiveSession).toHaveBeenCalledWith('side-root')
    expect(ctx.sidebarRight.forSession).toHaveBeenCalledWith('session-a')
    expect(setData).toHaveBeenCalledWith(OFFICIAL_SIDECHAT_TOMBSTONES, ['older', 'side-root'])
  })

  it('keeps the tombstone unchanged when archival fails and skips archival for an unsent draft', async () => {
    const failure = new Error('archive failed')
    vi.spyOn(api, 'sidechatDispose').mockResolvedValueOnce({ accepted: true, published: true })
      .mockResolvedValueOnce({ accepted: true, published: false })
    const archiveSession = vi.fn().mockRejectedValueOnce(failure)
    const setData = vi.fn()
    const ctx = {
      sidebarRight: {
        getSnapshot: () => projection('session-a', []),
        forSession: () => ({ setData }),
      },
      workspaces: { archiveSession },
    } as unknown as OfficialSidechatContext
    const context = closeContext(
      'session-a', 'sidechat-tab', 'sidechat', createOfficialSidechatPayload(SessionId('side-root')),
    )

    await expect(closeOfficialSidechat(ctx, context)).rejects.toBe(failure)
    expect(setData).not.toHaveBeenCalled()
    await closeOfficialSidechat(ctx, context)
    expect(archiveSession).toHaveBeenCalledOnce()
    expect(setData).toHaveBeenCalledWith(OFFICIAL_SIDECHAT_TOMBSTONES, ['side-root'])
  })

  it('owns provisional staging outside React and restores durable children without activation', async () => {
    const sidebarListeners = new Set<() => void>()
    const sessionListeners = new Set<() => void>()
    const workspaceListeners = new Set<() => void>()
    const update = vi.fn()
    const openTab = vi.fn(() => Promise.resolve('opened' as OfficialTabId))
    const unstage = vi.fn()
    const stageProvisional = vi.fn(() => unstage)
    let workbench = projection('session-a', [tabProjection(
      'session-a', 'draft-tab', 'sidechat', createOfficialSidechatPayload(SessionId('draft-child')),
    )])
    let sessions: SidebarSessionList = {
      current: SessionId('session-a'),
      byId: {
        'session-a': { id: SessionId('session-a'), displayTitle: 'Main', blank: false },
        'draft-child': {
          id: SessionId('draft-child'), displayTitle: 'Side: New thread', blank: true,
          origin: 'subagent', parentId: SessionId('session-a'), provisional: true,
        },
      },
    }
    const archive = { phase: 'ready' as const, archivedSessionIds: [] }
    const ctx = {
      sidebarRight: {
        getSnapshot: () => workbench,
        subscribe: (listener: () => void) => {
          sidebarListeners.add(listener)
          return () => { sidebarListeners.delete(listener) }
        },
        forSession: () => ({ update, openTab, setData: vi.fn() }),
      },
      sessions: {
        list: {
          getSnapshot: () => sessions,
          subscribe: (listener: () => void) => {
            sessionListeners.add(listener)
            return () => { sessionListeners.delete(listener) }
          },
        },
        stageProvisional,
      },
      workspaces: {
        list: {
          getSnapshot: () => archive,
          subscribe: (listener: () => void) => {
            workspaceListeners.add(listener)
            return () => { workspaceListeners.delete(listener) }
          },
        },
      },
    } as unknown as OfficialSidechatContext

    const dispose = subscribeOfficialSidechatRuntime(ctx)
    expect(stageProvisional).toHaveBeenCalledOnce()
    sidebarListeners.forEach(listener => { listener() })
    expect(stageProvisional).toHaveBeenCalledOnce()

    sessions = {
      ...sessions,
      byId: {
        ...sessions.byId,
        'draft-child': {
          ...sessions.byId['draft-child']!,
          displayTitle: 'Side: Published answer',
          blank: false,
          provisional: undefined,
        },
        restored: {
          id: SessionId('restored'), displayTitle: 'Restored answer', title: 'Side: Restored answer',
          blank: false, origin: 'subagent', parentId: SessionId('session-a'),
        },
      },
    }
    sessionListeners.forEach(listener => { listener() })
    expect(unstage).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith('draft-tab', {
      payload: { rootThreadId: 'draft-child', threadId: 'draft-child' },
    })
    expect(update).toHaveBeenCalledWith('draft-tab', { title: 'Published answer' })
    await vi.waitFor(() => {
      expect(openTab).toHaveBeenCalledWith('sidechat', {
        instanceId: 'restored',
        title: 'Restored answer',
        payload: { rootThreadId: 'restored', threadId: 'restored' },
        activate: false,
      })
    })

    workbench = projection('session-a', [])
    sidebarListeners.forEach(listener => { listener() })
    dispose()
    expect(sidebarListeners.size).toBe(0)
    expect(sessionListeners.size).toBe(0)
    expect(workspaceListeners.size).toBe(0)
  })
})

describe('official Terminal occurrence owner', () => {
  it('opens the first bottom Terminal once when preferences, enablement, and capacity allow it', async () => {
    const listeners = new Set<() => void>()
    const openTab = vi.fn(() => Promise.resolve('bottom-tab' as OfficialTabId))
    let workbench = projection('session-a', [])
    let autoOpen = true
    let enabled = true
    const ctx = {
      sidebarRight: {
        getSnapshot: () => workbench,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        forSession: vi.fn(() => ({ openTab })),
      },
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { bottomPanelAutoTerminal: autoOpen } }),
      },
      sidebarRightTabs: { isTabEnabled: () => enabled },
    } as unknown as Parameters<typeof subscribeOfficialBottomTerminal>[0]

    const dispose = subscribeOfficialBottomTerminal(ctx)
    workbench = projection('session-a', [], {}, true)
    listeners.forEach(listener => { listener() })
    await Promise.resolve()
    expect(ctx.sidebarRight.forSession).toHaveBeenCalledWith('session-a')
    expect(openTab).toHaveBeenCalledWith('terminal', { surface: 'bottom' })

    listeners.forEach(listener => { listener() })
    expect(openTab).toHaveBeenCalledOnce()

    for (const condition of ['preference', 'enabled', 'capacity'] as const) {
      workbench = projection('session-a', [], {}, false)
      listeners.forEach(listener => { listener() })
      autoOpen = condition !== 'preference'
      enabled = condition !== 'enabled'
      const tabs = condition === 'capacity'
        ? ['one', 'two', 'three'].map(id => tabProjection(
          'session-a', id, 'terminal', createOfficialUiTerminalPayload(id),
        ))
        : []
      workbench = projection('session-a', tabs, {}, true)
      listeners.forEach(listener => { listener() })
    }
    expect(openTab).toHaveBeenCalledOnce()
    dispose()
    expect(listeners.size).toBe(0)
  })

  it('counts only UI runtimes across every official surface', () => {
    const workbench = projection('session-a', [
      tabProjection('session-a', 'ui-right', 'terminal', createOfficialUiTerminalPayload('right')),
      tabProjection('session-a', 'ui-bottom', 'terminal', createOfficialUiTerminalPayload('bottom'), { surface: 'bottom' }),
      tabProjection('session-a', 'ui-float', 'terminal', createOfficialUiTerminalPayload('float')),
      tabProjection('session-a', 'agent', 'terminal', createOfficialAgentTerminalPayload('agent')),
    ])
    ;(workbench.sessions[0]!.tabs[2] as { floating: boolean }).floating = true

    expect(officialUiTerminalCount(workbench, SessionId('session-a'))).toBe(3)
    expect(canOpenOfficialUiTerminal(workbench, SessionId('session-a'))).toBe(false)
    expect(canOpenOfficialUiTerminal(workbench, SessionId('session-b'))).toBe(true)
  })

  it('signals a live socket and awaits the idempotent Host close route', async () => {
    let workbench = projection('session-a', [])
    const ctx = { sidebarRight: { getSnapshot: () => workbench } } as unknown as OfficialTerminalContext
    const sendClose = vi.fn()
    const lifecycle = officialTerminalViewLifecycle(ctx, SessionId('session-a'), 'tab-1' as OfficialTabId)
    const unregister = lifecycle.registerCloseSender(sendClose)
    const ptyClose = vi.spyOn(api, 'ptyClose').mockResolvedValue({ ok: true })

    await closeOfficialTerminal(closeContext(
      'session-a', 'tab-1', 'terminal', createOfficialUiTerminalPayload('runtime-1'),
    ))
    expect(sendClose).toHaveBeenCalledOnce()
    expect(ptyClose).toHaveBeenCalledWith({ sessionId: 'session-a' }, 'runtime-1')
    expect(lifecycle.shouldParkOnUnmount()).toBe(false)

    workbench = { ...workbench, mountedSessionId: SessionId('session-b') }
    expect(lifecycle.shouldParkOnUnmount()).toBe(true)
    unregister()
    await closeOfficialTerminal(closeContext(
      'session-a', 'tab-1', 'terminal', createOfficialUiTerminalPayload('runtime-1'),
    ))
    expect(sendClose).toHaveBeenCalledOnce()
  })

  it('reconciles model runtimes, retaining a missing pin and closing a missing unpinned owner', async () => {
    const tabs = [
      tabProjection('session-a', 'live-tab', 'terminal', createOfficialAgentTerminalPayload('live')),
      tabProjection('session-a', 'pinned-tab', 'terminal', createOfficialAgentTerminalPayload('pinned'), {
        pin: { scope: 'global', homeSessionId: 'session-a' },
      }),
      tabProjection('session-a', 'gone-tab', 'terminal', createOfficialAgentTerminalPayload('gone')),
    ]
    const openTab = vi.fn(() => Promise.resolve('new-tab' as OfficialTabId))
    const close = vi.fn(() => Promise.resolve({ admitted: true, closed: [], failed: [] }))
    const ctx = {
      sidebarRight: {
        getSnapshot: () => projection('session-a', tabs),
        forSession: vi.fn(() => ({ openTab, close })),
      },
    } as unknown as OfficialTerminalContext

    await reconcileOfficialAgentTerminals(ctx, SessionId('session-a'), [
      { uuid: 'live', title: 'Live' },
      { uuid: 'new', title: 'New' },
    ])

    expect(openTab).toHaveBeenCalledWith('terminal', {
      instanceId: 'agent:new',
      title: 'New',
      payload: { owner: 'agent', runtimeId: 'new' },
    })
    expect(close).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledWith('gone-tab')
  })

  it('rejects malformed model-Terminal list frames as a whole', () => {
    expect(officialAgentTerminalRowsOf([{ uuid: 'one', title: 'One' }])).toEqual([{ uuid: 'one', title: 'One' }])
    expect(officialAgentTerminalRowsOf([{ uuid: '', title: 'One' }])).toBeUndefined()
    expect(officialAgentTerminalRowsOf([{ uuid: 'one' }])).toBeUndefined()
    expect(officialAgentTerminalRowsOf({})).toBeUndefined()
  })

  it('does not apply a queued Host frame after its runtime subscription is disposed', async () => {
    class FakeWebSocket {
      static readonly instances: FakeWebSocket[] = []
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      constructor(readonly url: string) { FakeWebSocket.instances.push(this) }
      close(): void { this.onclose?.() }
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const listeners = new Set<() => void>()
    const openTab = vi.fn(() => Promise.resolve('new-tab' as OfficialTabId))
    const ctx = {
      sessions: { list: {
        getSnapshot: () => ({ current: SessionId('session-a'), byId: {} }),
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      } },
      sidebarRight: {
        getSnapshot: () => projection('session-a', []),
        forSession: () => ({ openTab, close: vi.fn() }),
      },
    } as unknown as OfficialTerminalContext

    const dispose = subscribeOfficialAgentTerminals(ctx)
    expect(FakeWebSocket.instances[0]?.url).toContain('sessionId=session-a')
    FakeWebSocket.instances[0]?.onmessage?.({
      data: JSON.stringify([{ uuid: 'new', title: 'New' }]),
    })
    dispose()
    await Promise.resolve()
    await Promise.resolve()

    expect(openTab).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })
})
