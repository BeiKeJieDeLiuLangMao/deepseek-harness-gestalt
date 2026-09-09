import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  agentOpenRequestOf,
  OfficialProducedFiles,
  openOfficialFile,
  openOfficialFolder,
  registerOfficialOpenPath,
  registerOfficialOpenRouting,
  registerOfficialTurnTail,
  revealOfficialFiles,
  routeOfficialAgentOpen,
  subscribeOfficialAgentOpens,
  type OfficialOpenRoutingContext,
} from '../src/client/official-open-routing.tsx'

const SESSION = SessionId('inactive-session')
const TAB = 'official-tab' as TabId

function flush(): Promise<void> {
  return new Promise(resolve => { queueMicrotask(resolve) })
}

function bench(cwd: string | null = '/work') {
  const openResource = vi.fn(async () => TAB)
  const update = vi.fn()
  const forSession = vi.fn(() => ({ openResource, update }))
  const ctx = {
    sessions: {
      list: {
        getSnapshot: () => ({
          current: 'another-session',
          byId: { [SESSION]: cwd === null ? {} : { cwd } },
        }),
      },
    },
    sidebarRight: { forSession },
  } as unknown as OfficialOpenRoutingContext
  return { ctx, forSession, openResource, update }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('official open routing', () => {
  it('targets files, folders, and tree reveals at the initiating Session', async () => {
    const { ctx, forSession, openResource, update } = bench()
    await openOfficialFile(ctx, SESSION, 'docs/a.md', 'Decision')
    expect(forSession).toHaveBeenLastCalledWith(SESSION)
    expect(openResource).toHaveBeenLastCalledWith('dsh-resource://file/session/inactive-session/docs/a.md')
    expect(update).toHaveBeenLastCalledWith(TAB, { title: 'Decision' })

    update.mockClear()
    await openOfficialFile(ctx, SESSION, '/outside/a.md')
    expect(openResource).toHaveBeenLastCalledWith('dsh-resource://file/absolute/outside/a.md')
    expect(update).not.toHaveBeenCalled()

    await openOfficialFolder(ctx, SESSION, 'reports')
    expect(openResource).toHaveBeenLastCalledWith(
      'dsh-resource://file/session/inactive-session/reports',
      { kind: 'file', payload: { dir: true } },
    )
    expect(update).toHaveBeenLastCalledWith(TAB, { title: 'reports' })

    await openOfficialFolder(ctx, SESSION, 'reports', 'Published')
    expect(update).toHaveBeenLastCalledWith(TAB, { title: 'Published' })
    await openOfficialFolder(ctx, SESSION, 'reports', '')
    expect(update).toHaveBeenLastCalledWith(TAB, { title: 'reports' })

    await revealOfficialFiles(ctx, SESSION, ['src/a.ts', '/work/docs/b.md'])
    expect(openResource).toHaveBeenLastCalledWith(
      'dsh-resource://file/session/inactive-session/',
      {
        kind: 'file',
        params: { reveal: ['/work/src/a.ts', '/work/docs/b.md'] },
        payload: { dir: true },
      },
    )

    await revealOfficialFiles(ctx, SESSION, [])
    expect(openResource).toHaveBeenLastCalledWith(
      'dsh-resource://file/session/inactive-session/',
      { kind: 'file', params: { reveal: ['/work'] }, payload: { dir: true } },
    )

    const rootless = bench(null)
    await revealOfficialFiles(rootless.ctx, SESSION, [])
    expect(rootless.openResource).toHaveBeenCalledWith(
      'dsh-resource://file/session/inactive-session/',
      { kind: 'file', params: { reveal: [] }, payload: { dir: true } },
    )
  })

  it('validates every Host message field and routes all accepted kinds', async () => {
    expect(agentOpenRequestOf(null)).toBeUndefined()
    expect(agentOpenRequestOf('file')).toBeUndefined()
    expect(agentOpenRequestOf({ kind: 'other', target: '/work' })).toBeUndefined()
    expect(agentOpenRequestOf({ kind: 'file', target: 1 })).toBeUndefined()
    expect(agentOpenRequestOf({ kind: 'file', target: '' })).toBeUndefined()
    expect(agentOpenRequestOf({ kind: 'folder', target: '/work', title: 1 })).toBeUndefined()
    expect(agentOpenRequestOf({ kind: 'file', target: '/work/a.md' })).toEqual({
      kind: 'file', target: '/work/a.md',
    })
    expect(agentOpenRequestOf({ kind: 'folder', target: '/work', title: '' })).toEqual({
      kind: 'folder', target: '/work',
    })
    const url = agentOpenRequestOf({ kind: 'url', target: 'https://example.test', title: 'Example' })
    expect(url).toEqual({ kind: 'url', target: 'https://example.test', title: 'Example' })

    const { ctx, openResource } = bench()
    const openUrl = vi.fn()
    await routeOfficialAgentOpen(ctx, { openUrl }, SESSION, {
      kind: 'file', target: 'src/a.ts',
    })
    await routeOfficialAgentOpen(ctx, { openUrl }, SESSION, {
      kind: 'folder', target: 'src',
    })
    await routeOfficialAgentOpen(ctx, { openUrl }, SESSION, url!)
    expect(openResource).toHaveBeenCalledTimes(2)
    expect(openUrl).toHaveBeenCalledWith(SESSION, 'https://example.test', 'Example')
  })

  it('renders produced files and preserves every row gesture', () => {
    const openInSidebar = vi.fn()
    const onShowInFolder = vi.fn()
    const matched = [
      '/work/a.ts', '/work/b.ts', '/work/c.ts', '/work/d.ts',
      '/work/e.ts', '/work/f.ts', '/work/g.ts',
    ]
    const tree = OfficialProducedFiles({ matched, openInSidebar, onShowInFolder }) as ReactElement<{
      children: ReactNode
    }>
    const children = Children.toArray(tree.props.children).filter(isValidElement) as ReactElement<{
      type?: string
      onClick?: () => void
    }>[]
    const buttons = children.filter(child => child.props.type === 'button')
    expect(buttons).toHaveLength(7)
    for (const button of buttons.slice(0, -1)) button.props.onClick!()
    buttons.at(-1)!.props.onClick!()
    expect(openInSidebar).toHaveBeenCalledWith('/work/a.ts')
    expect(onShowInFolder).toHaveBeenCalledWith(matched)

    const short = OfficialProducedFiles({
      matched: ['/'], openInSidebar, onShowInFolder,
    }) as ReactElement<{ children: ReactNode }>
    expect(Children.toArray(short.props.children).filter(isValidElement)).toHaveLength(2)
  })

  it('registers the turn-tail selector against official preferences and navigation', async () => {
    let interceptOpenPath = false
    let enabled = true
    let definition: {
      select: (owner: unknown) => readonly string[] | null
      inject: (sessionId: string) => {
        openInSidebar: (path: string) => void
        onShowInFolder: (files: readonly string[]) => void
      }
    } | undefined
    const dispose = vi.fn()
    const { ctx, openResource } = bench()
    Object.assign(ctx as object, {
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { interceptOpenPath } }),
      },
      sidebarRightTabs: { isTabEnabled: () => enabled },
      slots: {
        inject: (_name: string, register: () => () => void) => register(),
        register: (entry: typeof definition) => {
          definition = entry
          return dispose
        },
      },
    })
    const release = registerOfficialTurnTail(ctx)
    const owner = {
      seq: 2,
      turn: { data: { get: () => ({ produced: [{ seq: 1, path: 'src/a.ts' }] }) } },
    }
    expect(definition!.select(owner)).toBeNull()
    interceptOpenPath = true
    enabled = false
    expect(definition!.select(owner)).toBeNull()
    enabled = true
    expect(definition!.select(owner)).toEqual(['src/a.ts'])
    expect(definition!.select({})).toBeNull()

    const injected = definition!.inject(SESSION)
    injected.openInSidebar('src/a.ts')
    injected.onShowInFolder(['src/a.ts'])
    await flush()
    await flush()
    expect(openResource).toHaveBeenCalledTimes(2)
    release()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('wraps the system path funnel and restores it with the registration fiber', async () => {
    let interceptOpenPath = true
    let enabled = true
    const original = vi.fn(async () => ({ ok: true as const, value: { opened: false } }))
    const service = { openWorkspacePath: original }
    let stopEffect: (() => void) | undefined
    const disposeFiber = vi.fn(async () => { stopEffect?.() })
    const { ctx, openResource } = bench()
    Object.assign(ctx as object, {
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { interceptOpenPath } }),
      },
      sidebarRightTabs: { isTabEnabled: () => enabled },
      inject: (_deps: readonly string[], activate: (injected: unknown) => void) => {
        activate({
          get: () => service,
          effect: (start: () => () => void) => { stopEffect = start() },
        })
        return { dispose: disposeFiber }
      },
    })
    const release = registerOfficialOpenPath(ctx)
    await service.openWorkspacePath({ path: '/work/a.ts' })
    await service.openWorkspacePath({ path: '/work/.' })
    await flush()
    expect(openResource).toHaveBeenCalledTimes(2)
    enabled = false
    await service.openWorkspacePath({ path: '/work/b.ts' })
    interceptOpenPath = false
    enabled = true
    await service.openWorkspacePath({ path: '/work/c.ts' })
    expect(original).toHaveBeenCalledTimes(2)
    release()
    expect(disposeFiber).toHaveBeenCalledOnce()
    await flush()
    await service.openWorkspacePath({ path: '/work/d.ts' })
    expect(original).toHaveBeenCalledTimes(3)
  })

  it('follows the selected Session, serializes feed delivery, and bounds reconnects', async () => {
    type Handler<T> = ((event: T) => void) | null
    class Socket {
      static instances: Socket[] = []
      readonly url: string
      onopen: Handler<Event> = null
      onmessage: Handler<MessageEvent> = null
      onerror: Handler<Event> = null
      onclose: Handler<CloseEvent> = null
      constructor(url: string) {
        this.url = url
        Socket.instances.push(this)
      }
      close(): void { this.onclose?.({} as CloseEvent) }
    }
    const scheduled: (() => void)[] = []
    const clearTimeout = vi.fn()
    vi.stubGlobal('window', {
      clearTimeout,
      setTimeout: (callback: () => void) => {
        scheduled.push(callback)
        return scheduled.length
      },
    })
    vi.stubGlobal('location', { origin: 'http://localhost:3210' })
    vi.stubGlobal('WebSocket', Socket)
    let current: SessionId | undefined
    let allowAgentOpens = true
    const listeners = new Set<() => void>()
    let releaseFile: ((tab: TabId) => void) | undefined
    const openResource = vi.fn(() => new Promise<TabId>(resolve => { releaseFile = resolve }))
    const update = vi.fn()
    const openUrl = vi.fn(async () => undefined)
    const ctx = {
      sessions: {
        list: {
          getSnapshot: () => ({ current, byId: { [SESSION]: { cwd: '/work' } } }),
          subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
        },
      },
      sidebarRight: { forSession: () => ({ openResource, update }) },
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { agentOpenTools: allowAgentOpens } }),
      },
    } as unknown as OfficialOpenRoutingContext
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const release = subscribeOfficialAgentOpens(ctx, { openUrl })
    expect(Socket.instances).toHaveLength(0)

    current = SESSION
    for (const listener of listeners) listener()
    const first = Socket.instances[0]!
    expect(first.url).toBe('ws://localhost:3210/sidebar/ws/agent-opens?sessionId=inactive-session')
    first.onopen?.({} as Event)
    first.onmessage?.({ data: new Uint8Array() } as unknown as MessageEvent)
    first.onmessage?.({ data: '{' } as MessageEvent)
    first.onmessage?.({ data: JSON.stringify({ kind: 'missing' }) } as MessageEvent)
    allowAgentOpens = false
    first.onmessage?.({ data: JSON.stringify({ kind: 'file', target: 'ignored.ts' }) } as MessageEvent)
    allowAgentOpens = true

    first.onmessage?.({ data: JSON.stringify({ kind: 'file', target: 'src/a.ts' }) } as MessageEvent)
    first.onmessage?.({ data: JSON.stringify({ kind: 'url', target: 'https://example.test' }) } as MessageEvent)
    await flush()
    expect(openUrl).not.toHaveBeenCalled()
    releaseFile!(TAB)
    for (let index = 0; index < 6; index += 1) await flush()
    expect(openUrl).toHaveBeenCalledWith(SESSION, 'https://example.test', undefined)

    openUrl.mockRejectedValueOnce(new Error('blocked'))
    first.onmessage?.({ data: JSON.stringify({ kind: 'url', target: 'https://bad.test' }) } as MessageEvent)
    for (let index = 0; index < 4; index += 1) await flush()
    expect(error).toHaveBeenCalledWith(
      '[dsh-better-sidebar] sidebar_open delivery failed:', expect.any(Error),
    )

    first.onerror?.({} as Event)
    expect(scheduled).toHaveLength(1)
    scheduled.shift()!()
    const second = Socket.instances[1]!
    second.onerror?.({} as Event)
    scheduled.shift()!()
    const third = Socket.instances[2]!
    third.onerror?.({} as Event)
    expect(scheduled).toHaveLength(0)
    expect(error).toHaveBeenCalledWith(
      '[dsh-better-sidebar] agent-opens connection failed; stopping reconnect loop', SESSION,
    )

    vi.stubGlobal('location', { origin: 'https://localhost:3210' })
    current = SessionId('next-session')
    for (const listener of listeners) listener()
    const fourth = Socket.instances[3]!
    expect(fourth.url).toBe('wss://localhost:3210/sidebar/ws/agent-opens?sessionId=next-session')
    first.onopen?.({} as Event)
    first.onmessage?.({ data: JSON.stringify({ kind: 'url', target: 'https://stale.test' }) } as MessageEvent)
    first.onclose?.({} as CloseEvent)
    expect(openUrl).not.toHaveBeenCalledWith(SESSION, 'https://stale.test', undefined)
    for (const listener of listeners) listener()

    fourth.onerror?.({} as Event)
    fourth.onerror?.({} as Event)
    current = undefined
    for (const listener of listeners) listener()
    scheduled.shift()!()
    release()
    scheduled.shift()!()
    expect(listeners).toHaveLength(0)
    fourth.onclose?.({} as CloseEvent)
    expect(clearTimeout).toHaveBeenCalled()
  })

  it('registers and disposes the complete routing set', () => {
    const slotsDispose = vi.fn()
    const original = vi.fn(async () => ({ ok: true as const, value: { opened: false } }))
    let stopEffect: (() => void) | undefined
    const fiberDispose = vi.fn(async () => { stopEffect?.() })
    const listeners = new Set<() => void>()
    class Socket { close = vi.fn() }
    vi.stubGlobal('window', { clearTimeout: vi.fn(), setTimeout: vi.fn() })
    vi.stubGlobal('location', { origin: 'http://localhost' })
    vi.stubGlobal('WebSocket', Socket)
    const { ctx } = bench()
    Object.assign(ctx as object, {
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { interceptOpenPath: false, agentOpenTools: false } }),
      },
      sidebarRightTabs: { isTabEnabled: () => true },
      slots: {
        inject: (_name: string, register: () => () => void) => register(),
        register: () => slotsDispose,
      },
      inject: (_deps: readonly string[], activate: (injected: unknown) => void) => {
        activate({
          get: () => ({ openWorkspacePath: original }),
          effect: (start: () => () => void) => { stopEffect = start() },
        })
        return { dispose: fiberDispose }
      },
    })
    const list = ctx.sessions.list as unknown as {
      subscribe: (listener: () => void) => () => void
    }
    list.subscribe = (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
    const release = registerOfficialOpenRouting(ctx, { openUrl: vi.fn() })
    release()
    expect(slotsDispose).toHaveBeenCalledOnce()
    expect(fiberDispose).toHaveBeenCalledOnce()
    expect(listeners).toHaveLength(0)
  })
})
