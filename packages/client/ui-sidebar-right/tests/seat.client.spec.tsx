// @vitest-environment jsdom
/** Sidebar presentation and tab subscriptions through the production slot renderer. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PaneId, SplitId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { dockPaneIds, findTabPane, getPane } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { intentsFor } from '../src/client/shell/SidebarRight.tsx'
import type { SidebarRightTabInfo, SidebarRightTabMenuOwnerProps } from '../src/client/contract/slots.ts'
import type { createSidebarRightStore } from '../src/client/stores.ts'
import { SIDEBAR_RIGHT_PREFERENCES_DEFAULTS } from '../src/client/preferences.ts'

declare module '../src/client/contract/params.ts' {
  interface SidebarRightResourceParamsMap {
    test: { line?: number; x?: number }
  }
}

const SESSION = 's-test' as SessionId
const OTHER = 's-other' as SessionId
const runtimes: SlotTestRuntime[] = []
let getAnimationsDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  localStorage.clear()
  getAnimationsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, writable: true, value: () => [] })
})

afterEach(async () => {
  try {
    for (const runtime of runtimes.splice(0)) await runtime.dispose()
    document.querySelectorAll('[data-test-workbench-host-root]').forEach((node) => { node.remove() })
  } finally {
    Reflect.deleteProperty(globalThis, 'dshDesktop')
    vi.restoreAllMocks()
    if (getAnimationsDescriptor === undefined) Reflect.deleteProperty(Element.prototype, 'getAnimations')
    else Object.defineProperty(Element.prototype, 'getAnimations', getAnimationsDescriptor)
  }
})

/** Browser-owned animation completion controlled independently of the test clock. */
function transition(property = 'transform') {
  const done = Promise.withResolvers<Animation>()
  let state: AnimationPlayState = 'running'
  const animation = {
    transitionProperty: property,
    get playState() { return state },
    finished: done.promise,
  } as CSSTransition
  return {
    animation,
    finish: () => { state = 'finished'; done.resolve(animation) },
    cancel: () => { state = 'idle'; done.reject(new DOMException('Transition canceled', 'AbortError')) },
  }
}

async function mountSeat(viewportWidth = 1440, canShow = true) {
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  const frame = {
    openRightbar: vi.fn(), closeRightbar: vi.fn(), openBottombar: vi.fn(), closeBottombar: vi.fn(),
  }
  const pin = vi.fn<(address: string, signal: AbortSignal) => void>()
  runtime.ctx.provide('layout', frame as never)
  runtime.ctx.provide('resources', { pin } as never)
  runtime.ctx.provide('settingsScope', {
    bind: () => ({
      getSnapshot: () => ({
        status: 'ready' as const,
        value: SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
        base: undefined,
        user: undefined,
        revision: 1,
        writable: true,
        mode: 'host' as const,
      }),
      subscribe: () => () => {},
      mutate: async () => {},
      set: async () => {},
      unset: async () => {},
    }),
  } as never)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.declare({
    'workbench': { kind: 'single', scope: 'session' },
    'conversation.session.header.corner': { kind: 'single', scope: 'session' },
  })
  await runtime.sessions.add({ id: SESSION })
  const feature = await runtime.mount({ inject: [...inject], apply })
  const bodies = new Map<string, SidebarRightTabInfo>()
  const titles = new Map<string, SidebarRightTabInfo>()
  const hooks = new Map<string, PropsRuntime<'sidebar.right.pane.tab'>['useTabInfo']>()
  let mounts = 0
  function Body(props: PropsRuntime<'sidebar.right.pane.tab'>) {
    const info = props.useTabInfo()
    const [instance] = useState(() => ++mounts)
    bodies.set(info.tab.id, info)
    hooks.set(info.tab.id, props.useTabInfo)
    expect(['tabInfo', 'tab', 'paneId', 'visible', 'navigation', 'signal', 'tabActions'].filter(key => key in props)).toEqual([])
    return <span data-tab-body={info.tab.id} data-instance={instance} data-revision={info.tab.navigation.revision} />
  }
  function Title({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
    const info = useTabInfo()
    titles.set(info.tab.id, info)
    return <span data-tab-title={info.tab.id}>{info.tab.title}</span>
  }
  await act(async () => {
    runtime.ctx.sidebarRightTabs.register({
      id: 'test/text', kind: 'text', priority: 'builtin', patterns: ['dsh-resource://file/**'],
      title: address => address.slice(address.lastIndexOf('/') + 1),
    })
    runtime.slots.register({ name: 'sidebar.right.pane.tab', key: 'test/text' }, Body)
    runtime.slots.register({ name: 'sidebar.right.pane.tab.title', key: 'test/text' }, Title)
  })
  const hostRoot = document.createElement('div')
  hostRoot.dataset['testWorkbenchHostRoot'] = 'true'
  const rightHost = document.createElement('div')
  rightHost.id = 'test-workbench-right'
  const bottomHost = document.createElement('div')
  bottomHost.id = 'test-workbench-bottom'
  hostRoot.append(rightHost, bottomHost)
  document.body.append(hostRoot)
  const setRightbarWidth = vi.fn()
  const seedRightbarWidth = vi.fn()
  const owner = (width: number, show: boolean) => ({
    rightHostId: rightHost.id,
    bottomHostId: bottomHost.id,
    viewportWidth: width,
    viewportHeight: 900,
    centerWidth: Math.max(0, width - 420),
    rightPanelWidth: 420,
    rightbarWidth: show ? 420 : 0,
    canShowRight: show,
    setRightbarWidth,
    seedRightbarWidth,
  })
  const rendered = runtime.renderSlot('workbench', owner(viewportWidth, canShow))
  const view = {
    ...rendered,
    container: hostRoot,
    update: (
      { viewportWidth: width, canShowRight: show }: { viewportWidth: number; canShowRight: boolean },
    ) => {
      rendered.update(owner(width, show))
    },
  }
  const instance = runtime.storeOf('workbench', SESSION) as ReturnType<ReturnType<typeof createSidebarRightStore>['create']>
  const controller = runtime.ctx.sidebarRight
  const layout = () => instance.getSnapshot().bySession[SESSION]!.layout
  const bottomLayout = () => instance.getSnapshot().bySession[SESSION]!.bottom.layout
  const open = (name = 'a.txt', options?: Parameters<typeof controller.openResource>[1]) => {
    act(() => { void controller.openResource(`dsh-resource://file/session/s-test/${name}`, options) })
    return controller.active()!
  }
  return {
    runtime, feature, controller, instance, actions: instance.actions, layout, bottomLayout,
    open, frame, pin, bodies, titles, hooks, view, setRightbarWidth, seedRightbarWidth,
  }
}

function element(container: HTMLElement, selector: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(selector)
  if (node === null) throw new Error(`expected ${selector}`)
  return node
}

/** Dispatch one cancelable DOM drag with a minimal DataTransfer type list. */
function dispatchDrag(target: Element, type: string, types: readonly string[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types } })
  target.dispatchEvent(event)
  return event
}

/** Find the chip for an opened record by its stable id. */
function tabChip(tabId: TabId): HTMLElement {
  const chip = document.querySelector<HTMLElement>(`[data-dockkit-tab="${tabId}"]`)
  if (chip === null) throw new Error(`expected chip ${tabId}`)
  return chip
}

describe('RightbarSeat presentation', () => {
  it('keeps the panel mounted while collapsed and releases the frame on unmount', async () => {
    const h = await mountSeat()
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    expect(panel.getAttribute('aria-hidden')).toBe('true')
    expect(h.frame.closeRightbar).toHaveBeenCalled()
    expect(h.seedRightbarWidth).toHaveBeenCalledWith(504)
    h.open()
    expect(element(h.view.container, '[data-sidebar-right-panel]')).toBe(panel)
    expect(panel.hasAttribute('data-sidebar-right-open')).toBe(true)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false)
    await h.runtime.dispose()
    expect(h.frame.closeRightbar).toHaveBeenCalled()
  })

  it('fills the viewport without replacing the content tree or releasing the wide track', async () => {
    const h = await mountSeat()
    const tab = h.open()
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    const body = element(h.view.container, '[data-tab-body]')
    expect(panel.style.width).toBe('420px')
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(h.layout().mode).toBe('fullscreen')
    expect(panel.style.width).toBe('100%')
    expect(panel.dataset['sidebarRightPanel']).toBe('fullscreen')
    expect(element(h.view.container, '[data-tab-body]')).toBe(body)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, true)
    expect(h.bodies.get(tab.id)?.sidebar).toEqual({ expanded: true, fullscreen: true })
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(panel.style.width).toBe('420px')
    expect(element(h.view.container, '[data-tab-body]')).toBe(body)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false)
    fireEvent.click(element(h.view.container, '[data-sidebar-right-toggle]'))
    expect(h.layout().expanded).toBe(false)
    expect(h.frame.closeRightbar).toHaveBeenCalled()
  })

  it('derives narrow fullscreen without recording mode and returns to normal when widened', async () => {
    const h = await mountSeat(767, false)
    h.open()
    expect(h.layout().mode).toBe('push')
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(false, true)
    const stored = h.instance.getSnapshot()
    const body = element(h.view.container, '[data-tab-body]')
    h.view.update({ viewportWidth: 768, canShowRight: true })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(element(h.view.container, '[data-tab-body]')).toBe(body)
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false)
  })

  it('closes on automatic fullscreen exit and stays closed after widening', async () => {
    const h = await mountSeat(500, false)
    const tab = h.open()
    const signal = h.bodies.get(tab.id)!.tab.signal
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().mode).toBe('push')
    const stored = h.instance.getSnapshot()
    h.view.update({ viewportWidth: 1440, canShowRight: true })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(h.layout().tabs[tab.id]).toBeDefined()
    expect(signal.aborted).toBe(false)
    expect(h.layout().expanded).toBe(false)
  })

  it('preserves manual fullscreen through narrow and wide viewport changes', async () => {
    const h = await mountSeat()
    h.open()
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    const stored = h.instance.getSnapshot()
    h.view.update({ viewportWidth: 500, canShowRight: false })
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(false, true)
    h.view.update({ viewportWidth: 1440, canShowRight: true })
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, true)
    expect(h.instance.getSnapshot()).toBe(stored)
  })

  it('collapses a normal panel that cannot fit without clearing records or reopening on growth', async () => {
    const h = await mountSeat()
    const tab = h.open()
    const signal = h.bodies.get(tab.id)!.tab.signal
    h.view.update({ viewportWidth: 900, canShowRight: false })
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().tabs[tab.id]).toBeDefined()
    expect(signal.aborted).toBe(false)
    const stored = h.instance.getSnapshot()
    h.view.update({ viewportWidth: 1440, canShowRight: true })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(h.layout().expanded).toBe(false)
  })
})

describe('WorkbenchSeat bottom surface', () => {
  it('portals an independently recorded bottom surface and removes its track in fullscreen', async () => {
    const h = await mountSeat()
    act(() => {
      void h.controller.openResource('dsh-resource://file/session/s-test/bottom.txt', { surface: 'bottom' })
    })
    const tab = Object.values(h.bottomLayout().tabs).find(candidate => candidate.title === 'bottom.txt')!
    const panel = element(h.view.container, '[data-sidebar-bottom-panel]')
    expect(panel.hasAttribute('data-sidebar-bottom-open')).toBe(true)
    expect(h.bodies.get(tab.id)?.workbench.surface).toBe('bottom')
    expect(h.frame.openBottombar).toHaveBeenLastCalledWith(220, false)
    fireEvent.click(element(panel, '[data-sidebar-right-mode]'))
    expect(h.bottomLayout().mode).toBe('fullscreen')
    expect(panel.dataset['sidebarBottomPanel']).toBe('fullscreen')
    expect(h.frame.openBottombar).toHaveBeenLastCalledWith(220, true)
    fireEvent.click(element(panel, '[data-sidebar-right-toggle]'))
    expect(h.bottomLayout().expanded).toBe(false)
    expect(h.frame.closeBottombar).toHaveBeenCalled()
  })

  it('owns bottom-height and shared-corner resize gestures', async () => {
    const h = await mountSeat()
    act(() => {
      h.actions.setSurfaceExpanded(SESSION, 'right', true)
      h.actions.setSurfaceExpanded(SESSION, 'bottom', true)
    })
    const prepare = (node: HTMLElement) => {
      let captured = false
      node.setPointerCapture = () => { captured = true }
      node.releasePointerCapture = () => { captured = false }
      node.hasPointerCapture = () => captured
    }
    const top = element(h.view.container, '[data-side="bottombar"]')
    prepare(top)
    fireEvent.pointerDown(top, { pointerId: 1, button: 0, clientY: 500 })
    fireEvent.pointerMove(top, { pointerId: 1, clientY: 450 })
    fireEvent.pointerUp(top, { pointerId: 1, clientY: 450 })
    expect(h.instance.getSnapshot().bySession[SESSION]?.bottomHeight).toBe(270)

    const corner = element(h.view.container, '[data-workbench-resize-corner]')
    prepare(corner)
    fireEvent.pointerDown(corner, { pointerId: 2, button: 0, clientX: 600, clientY: 450 })
    fireEvent.pointerMove(corner, { pointerId: 2, clientX: 550, clientY: 430 })
    fireEvent.pointerUp(corner, { pointerId: 2, clientX: 550, clientY: 430 })
    expect(h.instance.getSnapshot().bySession[SESSION]?.bottomHeight).toBe(290)
    expect(h.setRightbarWidth).toHaveBeenLastCalledWith(470)
  })
})

describe('WorkbenchSeat file-drag ownership', () => {
  it('consumes the complete OS file-drag sequence before the document composer listener', async () => {
    const h = await mountSeat()
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
      const reachedDocument = vi.fn()
      document.addEventListener(type, reachedDocument)
      const event = dispatchDrag(panel, type, ['Files'])
      document.removeEventListener(type, reachedDocument)
      expect(event.defaultPrevented).toBe(true)
      expect(reachedDocument).not.toHaveBeenCalled()
    }
  })

  it('shields fullscreen, bottom, and floating surfaces while leaving descendant file handlers reachable', async () => {
    const h = await mountSeat()
    const right = h.open('right.txt')
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    act(() => {
      void h.controller.openResource('dsh-resource://file/session/s-test/bottom.txt', { surface: 'bottom' })
      h.controller.float(right.id)
    })
    const roots = [
      element(h.view.container, '[data-sidebar-right-panel="fullscreen"]'),
      element(h.view.container, '[data-sidebar-bottom-panel]'),
      element(document.body, '[data-sidebar-right-float-host]'),
    ]
    for (const root of roots) {
      const reachedDocument = vi.fn()
      document.addEventListener('drop', reachedDocument)
      const event = dispatchDrag(root, 'drop', ['Files'])
      document.removeEventListener('drop', reachedDocument)
      expect(event.defaultPrevented).toBe(true)
      expect(reachedDocument).not.toHaveBeenCalled()
    }

    const floatBody = element(document.body, '[data-dockkit-float] [data-tab-body]')
    const localDrop = vi.fn()
    const reachedDocument = vi.fn()
    floatBody.addEventListener('drop', localDrop)
    document.addEventListener('drop', reachedDocument)
    dispatchDrag(floatBody, 'drop', ['Files'])
    floatBody.removeEventListener('drop', localDrop)
    document.removeEventListener('drop', reachedDocument)
    expect(localDrop).toHaveBeenCalledOnce()
    expect(reachedDocument).not.toHaveBeenCalled()
  })

  it('leaves non-file drags available to DockKit and other document owners', async () => {
    const h = await mountSeat()
    const reachedDocument = vi.fn()
    document.addEventListener('dragover', reachedDocument)
    const event = dispatchDrag(element(h.view.container, '[data-sidebar-right-panel]'), 'dragover', ['text/plain'])
    document.removeEventListener('dragover', reachedDocument)
    expect(event.defaultPrevented).toBe(false)
    expect(reachedDocument).toHaveBeenCalledOnce()
  })
})

describe('WorkbenchSeat tab context menu', () => {
  it('floats a right-surface tab and omits that action from the bottom surface', async () => {
    const h = await mountSeat()
    const right = h.open('right.txt')
    fireEvent.contextMenu(tabChip(right.id))
    const float = element(document.body, '[data-sidebar-right-menu-float]')
    fireEvent.click(float)
    expect(findTabPane(h.layout(), right.id).host).toBe('float')
    expect(document.querySelector('[data-dockkit-tab-menu]')).toBeNull()

    let bottom!: TabId
    await act(async () => {
      bottom = await h.controller.openResource(
        'dsh-resource://file/session/s-test/bottom.txt',
        { surface: 'bottom' },
      )
    })
    fireEvent.contextMenu(tabChip(bottom))
    expect(document.querySelector('[data-sidebar-right-menu-float]')).toBeNull()
    expect(document.querySelector('[data-sidebar-right-menu-close-others]')).not.toBeNull()
  })

  it.each([
    ['left', '[data-sidebar-right-menu-close-left]', ['guide', 'a'], ['b', 'c']],
    ['right', '[data-sidebar-right-menu-close-right]', ['c'], ['guide', 'a', 'b']],
    ['others', '[data-sidebar-right-menu-close-others]', ['guide', 'a', 'c'], ['b']],
  ] as const)('closes pane-relative tabs to the %s in one recorded batch', async (_name, selector, removed, retained) => {
    const h = await mountSeat()
    act(() => { h.actions.setExpanded(SESSION, true) })
    const paneId = dockPaneIds(h.layout())[0]!
    const guide = getPane(h.layout(), paneId).tabs[0]!
    const a = h.open('a.txt')
    const b = h.open('b.txt')
    const c = h.open('c.txt')
    const ids = { guide, a: a.id, b: b.id, c: c.id }
    const before = h.instance.getSnapshot().bySession[SESSION]!.history.entries.length
    fireEvent.contextMenu(tabChip(b.id))
    fireEvent.click(element(document.body, selector))
    await vi.waitFor(() => {
      for (const name of removed) expect(h.layout().tabs[ids[name]]).toBeUndefined()
    })
    for (const name of retained) expect(h.layout().tabs[ids[name]]).toBeDefined()
    expect(h.instance.getSnapshot().bySession[SESSION]!.history.entries).toHaveLength(before + 1)
    expect(document.querySelector('[data-dockkit-tab-menu]')).toBeNull()
  })

  it('admits every sibling before releasing runtime owners from Close Other Tabs', async () => {
    const h = await mountSeat()
    const order: string[] = []
    await act(async () => {
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/owned',
        kind: 'owned',
        title: address => address.slice(address.lastIndexOf('/') + 1),
        beforeClose: ({ tab }) => { order.push(`admit:${tab.title}`) },
        close: ({ tab }) => { order.push(`release:${tab.title}`) },
      })
    })
    let a!: TabId
    let b!: TabId
    let c!: TabId
    await act(async () => {
      a = await h.controller.openTab('owned', { instanceId: 'a', title: 'a' })
      b = await h.controller.openTab('owned', { instanceId: 'b', title: 'b' })
      c = await h.controller.openTab('owned', { instanceId: 'c', title: 'c' })
    })
    fireEvent.contextMenu(tabChip(b))
    fireEvent.click(element(document.body, '[data-sidebar-right-menu-close-others]'))
    await vi.waitFor(() => { expect(order).toEqual(['admit:a', 'admit:c', 'release:a', 'release:c']) })
    expect(h.layout().tabs[a]).toBeUndefined()
    expect(h.layout().tabs[b]).toBeDefined()
    expect(h.layout().tabs[c]).toBeUndefined()
  })
})

describe('RightbarSeat fullscreen entry', () => {
  it('retains the previous report until its transform finishes, then leaves the track in place on exit', async () => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const panel = element(h.view.container, '[data-sidebar-right-panel]')
    const slide = transition()
    const unrelated = transition('opacity')
    vi.spyOn(panel, 'getAnimations').mockReturnValue([slide.animation, unrelated.animation])
    h.frame.closeRightbar.mockClear()
    h.open()
    expect(panel.hasAttribute('data-sidebar-right-open')).toBe(true)
    expect(panel.dataset['sidebarRightPanel']).toBe('fullscreen')
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    expect(h.frame.closeRightbar).not.toHaveBeenCalled()
    await act(async () => { slide.finish(); await slide.animation.finished })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(true, true)
    fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    expect(h.frame.openRightbar).toHaveBeenLastCalledWith(true, false)
    unrelated.finish()
  })

  it('reports immediately without a transform transition, including zero-duration and reduced-motion entry', async () => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const unrelated = transition('opacity')
    const ended = transition()
    ended.finish()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations')
      .mockReturnValue([unrelated.animation, ended.animation])
    h.open()
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(true, true)
    unrelated.finish()
  })

  it('reports when reduced motion cancels the entering transition', async () => {
    const h = await mountSeat(767, false)
    const slide = transition()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations').mockReturnValue([slide.animation])
    h.open()
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    await act(async () => { slide.cancel(); await Promise.allSettled([slide.animation.finished]) })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(false, true)
  })

  it('waits for a replacement transform after cancellation', async () => {
    const h = await mountSeat(767, false)
    const first = transition()
    const replacement = transition()
    const animations = vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations')
      .mockReturnValue([first.animation])
    h.open()
    animations.mockReturnValue([replacement.animation])
    await act(async () => { first.cancel(); await Promise.allSettled([first.animation.finished]) })
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    await act(async () => { replacement.finish(); await replacement.animation.finished })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(false, true)
  })

  it.each(['close', 'push', 'session', 'unmount'])('ignores a late completion after %s', async (change) => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const slide = transition()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations').mockReturnValue([slide.animation])
    h.open()
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    if (change === 'close') fireEvent.click(element(h.view.container, '[data-sidebar-right-toggle]'))
    else if (change === 'push') fireEvent.click(element(h.view.container, '[data-sidebar-right-mode]'))
    else if (change === 'session') {
      await h.runtime.sessions.add({ id: OTHER })
      act(() => { void h.controller.openResource('dsh-resource://file/session/s-other/b.txt') })
    } else await h.runtime.dispose()
    const openCalls = [...h.frame.openRightbar.mock.calls]
    const closeCalls = h.frame.closeRightbar.mock.calls.length
    await act(async () => { slide.finish(); await slide.animation.finished })
    expect(h.frame.openRightbar.mock.calls).toEqual(openCalls)
    expect(h.frame.closeRightbar).toHaveBeenCalledTimes(closeCalls)
  })

  it('uses the current viewport report when entry crosses the fullscreen breakpoint', async () => {
    const h = await mountSeat()
    act(() => { h.actions.setMode(SESSION, 'fullscreen') })
    const slide = transition()
    vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations').mockReturnValue([slide.animation])
    h.open()
    h.view.update({ viewportWidth: 500, canShowRight: false })
    expect(h.frame.openRightbar).not.toHaveBeenCalled()
    await act(async () => { slide.finish(); await slide.animation.finished })
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(false, true)
  })

  it('does not delay normal presentation behind its slide', async () => {
    const h = await mountSeat()
    const slide = transition()
    const animations = vi.spyOn(element(h.view.container, '[data-sidebar-right-panel]'), 'getAnimations')
      .mockReturnValue([slide.animation])
    h.open()
    expect(h.frame.openRightbar).toHaveBeenCalledExactlyOnceWith(true, false)
    expect(animations).not.toHaveBeenCalled()
    slide.finish()
  })
})

describe('slot-owned useTabInfo', () => {
  it('updates body and title navigation with no layout commit and retains the bound hook', async () => {
    const h = await mountSeat()
    const tab = h.open('a.txt', { params: { line: 3 } })
    const stored = h.instance.getSnapshot()
    const hook = h.hooks.get(tab.id)
    const signal = h.bodies.get(tab.id)!.tab.signal
    act(() => { h.controller.tabDomain.navigate(SESSION, tab.id, { address: tab.contentId, params: { line: 7 } }) })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(h.hooks.get(tab.id)).toBe(hook)
    expect(h.bodies.get(tab.id)?.tab.navigation).toEqual({ address: tab.contentId, params: { line: 7 }, revision: 2 })
    expect(h.titles.get(tab.id)?.tab.navigation).toBe(h.bodies.get(tab.id)?.tab.navigation)
    expect(h.bodies.get(tab.id)?.tab.signal).toBe(signal)
    expect(element(h.view.container, '[data-tab-body]').dataset['revision']).toBe('2')
  })

  it('isolates same-kind record state and reports inactive titles, hiding, floating and docking', async () => {
    const h = await mountSeat()
    const a = h.open('a.txt')
    const b = h.open('b.txt')
    const bodyB = element(h.view.container, '[data-tab-body]')
    expect(h.titles.get(a.id)?.tab.visible).toBe(true)
    act(() => { h.actions.focusTab(SESSION, a.id) })
    const bodyA = element(h.view.container, '[data-tab-body]')
    expect(bodyA.dataset['instance']).not.toBe(bodyB.dataset['instance'])
    expect(bodyA.dataset['tabBody']).toBe(a.id)
    const signal = h.bodies.get(a.id)!.tab.signal
    act(() => { h.actions.setExpanded(SESSION, false) })
    expect(h.bodies.get(a.id)?.tab.visible).toBe(false)
    expect(h.titles.get(a.id)?.tab.visible).toBe(false)
    expect(h.titles.get(b.id)?.tab.visible).toBe(false)
    expect(element(h.view.container, '[data-tab-body]')).toBe(bodyA)
    expect(signal.aborted).toBe(false)
    act(() => { h.controller.float(a.id) })
    expect(h.bodies.get(a.id)?.tab.visible).toBe(true)
    const paneId = h.bodies.get(a.id)!.panel.id
    expect(h.layout().floats).toContain(paneId)
    act(() => { h.controller.dock(paneId) })
    expect(h.layout().floats).toHaveLength(0)
    expect(h.bodies.get(a.id)?.tab.signal).toBe(signal)
  })

  it('keeps session records and navigation while unmounted, aborting only removal and plugin unload', async () => {
    const h = await mountSeat()
    const own = h.open()
    const info = h.bodies.get(own.id)!
    const stored = h.instance.getSnapshot()
    await h.runtime.sessions.add({ id: OTHER })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(info.tab.signal.aborted).toBe(false)
    act(() => { void h.controller.openResource('dsh-resource://file/session/s-other/other.txt', { params: { line: 9 } }) })
    const otherTab = h.controller.active()!
    expect(otherTab.id).toBe(own.id)
    const otherInfo = h.bodies.get(otherTab.id)!
    expect(otherInfo.tab.signal).not.toBe(info.tab.signal)
    act(() => { info.tab.actions.openResource('dsh-resource://file/session/s-test/b.txt') })
    expect(Object.values(h.layout().tabs).map(tab => tab.title)).toContain('b.txt')
    expect(h.controller.active()?.contentId).toBe(otherTab.contentId)
    expect(h.bodies.get(otherTab.id)?.tab.navigation.params).toEqual({ line: 9 })
    act(() => { info.tab.actions.close() })
    await vi.waitFor(() => { expect(info.tab.signal.aborted).toBe(true) })
    expect(otherInfo.tab.signal.aborted).toBe(false)
    await h.runtime.sessions.setCurrent(SESSION)
    const remaining = h.bodies.get(h.controller.active()!.id)!
    expect(remaining.tab.navigation.revision).toBe(1)
    await h.feature.dispose()
    expect(remaining.tab.signal.aborted).toBe(true)
    expect(otherInfo.tab.signal.aborted).toBe(true)
    expect(h.runtime.ctx.get('sidebarRight')).toBeUndefined()
  })

  it('renders a foreign pin as a virtual view backed by its home occurrence', async () => {
    const h = await mountSeat()
    h.open()
    let menu: SidebarRightTabMenuOwnerProps | undefined
    await act(async () => {
      h.runtime.slots.register({ name: 'sidebar.right.tab.menu.item', id: 'test-pinned' },
        (props: PropsRuntime<'sidebar.right.tab.menu.item'>) => { menu = props; return null })
    })
    let homeTab!: TabId
    await act(async () => {
      homeTab = await h.controller.forSession(OTHER).openResource(
        'dsh-resource://file/session/s-other/pinned.txt',
        { activate: false, pin: { scope: 'global', homeSessionId: OTHER } },
      )
    })
    const chip = [...h.view.container.querySelectorAll<HTMLElement>('[data-dockkit-tab]')]
      .find(candidate => candidate.textContent?.includes('pinned.txt'))
    if (chip === undefined) throw new Error('expected pinned virtual tab')
    const virtualId = chip.getAttribute('data-dockkit-tab') as TabId
    expect(virtualId).not.toBe(homeTab)
    expect(h.layout().tabs[virtualId]).toBeUndefined()

    fireEvent.click(chip)
    const info = h.bodies.get(homeTab)!
    expect(info.tab).toMatchObject({ id: homeTab, sessionId: OTHER, virtual: true })
    expect(info.tab.signal).toBe(h.controller.tabDomain.occurrence(OTHER, { id: homeTab }).signal)
    fireEvent.contextMenu(chip)
    expect(menu).toMatchObject({
      sessionId: OTHER,
      surface: 'right',
      tab: { id: homeTab },
      pin: { scope: 'global', homeSessionId: OTHER },
    })
    expect(document.querySelector('[data-sidebar-right-menu-float]')).toBeNull()
    expect(document.querySelector('[data-sidebar-right-menu-close-others]')).toBeNull()
    expect(document.querySelector('[data-sidebar-right-menu-close-left]')).toBeNull()
    expect(document.querySelector('[data-sidebar-right-menu-close-right]')).toBeNull()

    act(() => { menu?.actions.update({ pin: undefined }) })
    expect(h.controller.getSnapshot().sessions.find(session => session.sessionId === OTHER)
      ?.tabs.find(tab => tab.record.id === homeTab)?.state.pin).toBeUndefined()
    expect([...h.view.container.querySelectorAll('[data-dockkit-tab]')]
      .some(candidate => candidate.textContent?.includes('pinned.txt'))).toBe(false)
    expect(h.controller.tabDomain.occurrence(OTHER, { id: homeTab }).signal.aborted).toBe(false)
  })

  it('updates guide replacements through the same hook and guide boxes through framework injection', async () => {
    const h = await mountSeat()
    let captured: SidebarRightTabInfo | undefined
    act(() => { h.actions.setExpanded(SESSION, true) })
    await act(async () => {
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/files', kind: 'files', title: () => 'Files',
        guide: [{ order: 1, title: () => 'Files', description: () => 'Browse' }],
      })
    })
    expect(h.view.container.querySelector('[data-sidebar-right-guide-entry="files"]')).not.toBeNull()
    await act(async () => {
      h.runtime.slots.register({ name: 'sidebar.right.tab.guide', select: () => true },
        ({ useTabInfo }: PropsRuntime<'sidebar.right.tab.guide'>) => {
          captured = useTabInfo()
          return <span data-guide-replacement={captured.tab.navigation.revision} />
        })
    })
    expect(h.view.container.querySelector('[data-sidebar-right-guide]')).toBeNull()
    expect(captured?.tab.kind).toBe('guide')
    act(() => { void h.controller.openTab('guide') })
    const stored = h.instance.getSnapshot()
    const guide = h.controller.active()!
    act(() => { h.controller.tabDomain.navigate(SESSION, guide.id, { address: guide.contentId, params: undefined }) })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(captured?.tab.navigation.revision).toBe(2)
    expect(element(h.view.container, '[data-guide-replacement]').dataset['guideReplacement']).toBe('2')
    expect(captured?.sidebar.expanded).toBe(true)
  })

  it('follows type replacement and returns to the builtin when it leaves', async () => {
    const h = await mountSeat()
    h.open()
    let release = () => {}
    await act(async () => {
      release = h.runtime.ctx.sidebarRightTabs.register({ id: 'extension/text', kind: 'text', title: () => 'Extension' })
      h.runtime.slots.register({ name: 'sidebar.right.pane.tab', key: 'extension/text' },
        ({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) => <b data-extension>{useTabInfo().tab.title}</b>)
    })
    expect(element(h.view.container, '[data-extension]').textContent).toBe('a.txt')
    await act(async () => { release() })
    expect(h.view.container.querySelector('[data-extension]')).toBeNull()
    expect(h.view.container.querySelector('[data-tab-body]')).not.toBeNull()
  })

  it('renders unavailable kinds and keeps menu tab/dismiss arguments', async () => {
    const h = await mountSeat()
    let menu: SidebarRightTabMenuOwnerProps | undefined
    await act(async () => {
      h.runtime.slots.register({ name: 'sidebar.right.tab.menu.item', id: 'test' },
        (props: PropsRuntime<'sidebar.right.tab.menu.item'>) => { menu = props; return null })
      h.actions.openContent(SESSION, { kind: 'missing', contentId: 'missing://content', title: 'Missing' }, () => {})
    })
    expect(h.view.container.querySelector('[data-sidebar-right-unavailable]')).not.toBeNull()
    const chip = element(h.view.container, '[data-dockkit-tab]')
    fireEvent.contextMenu(chip)
    expect(menu?.tab.id).toBe(chip.getAttribute('data-dockkit-tab'))
    expect(menu).toMatchObject({ sessionId: SESSION, surface: 'right', payload: undefined, pin: undefined })
    expect(typeof menu?.actions.close).toBe('function')
    act(() => { menu?.dismiss() })
    expect(document.querySelector('[data-dockkit-tab-menu]')).toBeNull()
  })

  it('hides split controls at two panes and adds a guide only to a pane without one', async () => {
    const h = await mountSeat()
    h.open()
    const splitButtons = () => element(h.view.container, '[data-sidebar-right-panel]')
      .querySelectorAll<HTMLButtonElement>('[data-dockkit-split-button]')
    expect(splitButtons()).toHaveLength(1)
    act(() => { h.controller.split() })
    expect(dockPaneIds(h.layout())).toHaveLength(2)
    const stored = h.instance.getSnapshot()
    act(() => { expect(h.controller.split()).toBeUndefined() })
    expect(h.instance.getSnapshot()).toBe(stored)
    expect(splitButtons()).toHaveLength(0)
    const right = dockPaneIds(h.layout())[1]!
    h.open('right.txt', { paneId: right })
    const guide = getPane(h.layout(), right).tabs.find(id => h.layout().tabs[id]?.kind === 'guide')!
    act(() => { h.actions.closeTab(SESSION, guide) })
    const add = [...h.view.container.querySelectorAll<HTMLElement>('[data-dockkit-add-tab]')]
      .find(candidate => candidate.closest('[data-dockkit-pane]')?.getAttribute('data-dockkit-pane') === right)
    if (add === undefined) throw new Error('expected the right pane add control')
    expect(add.closest('[data-dockkit-pane]')?.getAttribute('data-dockkit-pane')).toBe(right)
    fireEvent.click(add)
    expect(getPane(h.layout(), right).tabs.filter(id => h.layout().tabs[id]?.kind === 'guide')).toHaveLength(1)
    const closing = [...getPane(h.layout(), right).tabs]
    act(() => { for (const tabId of closing) h.actions.closeTab(SESSION, tabId) })
    expect(dockPaneIds(h.layout())).toHaveLength(1)
    expect(splitButtons()).toHaveLength(1)
    expect(splitButtons()[0]?.disabled).toBe(false)
  })

  it('opens the Desktop add menu from the official page registry and places its selection', async () => {
    let result: ((value: { type: string; requestId: string; id?: string }) => void) | undefined
    const chromeOverlayShow = vi.fn()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.assign(globalThis, {
      dshDesktop: {
        chromeOverlayShow,
        chromeOverlayHide: vi.fn(),
        onChromeOverlayResult: (listener: typeof result) => {
          result = listener
          return () => { result = undefined }
        },
      },
    })
    const h = await mountSeat()
    await act(async () => {
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/files', kind: 'files', order: 20, icon: 'editor', title: () => 'Files',
      })
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/terminal', kind: 'terminal', order: 40, icon: 'terminal', title: () => 'Terminal',
        available: () => false,
      })
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/broken', kind: 'broken', order: 30, title: () => 'Broken',
        available: () => { throw new Error('listing failed') },
      })
      h.runtime.ctx.sidebarRightTabs.register({
        id: 'test/hidden', kind: 'hidden', order: 10, hidden: true, title: () => 'Hidden',
      })
    })
    const paneId = dockPaneIds(h.layout())[0]!
    h.open('keeps-pane.txt', { paneId })
    const guide = getPane(h.layout(), paneId).tabs.find(id => h.layout().tabs[id]?.kind === 'guide')!
    act(() => { h.actions.closeTab(SESSION, guide) })
    const add = element(h.view.container, '[data-dockkit-add-tab]')
    vi.spyOn(add, 'getBoundingClientRect').mockReturnValue(new DOMRect(101, 31, 18, 18))
    fireEvent.click(add)
    const request = chromeOverlayShow.mock.calls[0]![0] as unknown as { requestId: string }
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(chromeOverlayShow).toHaveBeenCalledWith({
      kind: 'menu',
      requestId: request.requestId,
      items: [
        { id: 'files', label: 'Files', icon: 'editor' },
        { id: 'broken', label: 'Broken — Unavailable in this session.', disabled: true },
        { id: 'terminal', label: 'Terminal — Unavailable in this session.', disabled: true, icon: 'terminal' },
      ],
      anchor: { x: 101, y: 31, width: 18, height: 18 },
      align: 'end',
      side: 'bottom',
    })
    expect(report).toHaveBeenCalledWith(
      'sidebarRight: available failed for add-menu kind "broken"',
      expect.any(Error),
    )
    act(() => { result?.({ type: 'select', requestId: request.requestId, id: 'files' }) })
    expect(getPane(h.layout(), paneId).tabs.some(id => h.layout().tabs[id]?.kind === 'files')).toBe(true)
  })
})

describe('intentsFor — the kit\'s gestures as one session\'s store actions', () => {
  it('binds every intent to the session, and asks the navigation face for a guide on add', () => {
    const actions = {
      focusTab: vi.fn(), focusPane: vi.fn(), splitSurfacePane: vi.fn(), closeTab: vi.fn(), duplicateTab: vi.fn(),
      floatTab: vi.fn(), unfloatPane: vi.fn(), placeTab: vi.fn(), dropTab: vi.fn(), moveFloat: vi.fn(),
      resizeFloat: vi.fn(), resizeSplit: vi.fn(),
    }
    const openTab = vi.fn()
    const activateTab = vi.fn()
    const closeTab = vi.fn()
    const intents = intentsFor(
      SESSION,
      actions as unknown as Parameters<typeof intentsFor>[1],
      openTab,
      activateTab,
      closeTab,
    )
    const rect = { x: 1, y: 2, width: 300, height: 200 }
    const TAB_1 = 'tab-1' as TabId
    const PANE_1 = 'pane-1' as PaneId
    const PANE_2 = 'pane-2' as PaneId
    const SPLIT_1 = 'split-1' as SplitId
    intents.focusTab(TAB_1)
    intents.focusPane(PANE_1)
    intents.splitPane(PANE_1)
    intents.closeTab(TAB_1)
    intents.duplicateTab(TAB_1)
    intents.floatTab(TAB_1, rect)
    intents.unfloatPane(PANE_2)
    intents.placeTab(TAB_1, PANE_1, 0)
    intents.dropTab(TAB_1, PANE_1, 'right')
    intents.moveFloat(PANE_2, 30, 40)
    intents.resizeFloat(PANE_2, rect)
    intents.resizeSplit(SPLIT_1, [0.3, 0.7])
    expect(activateTab).toHaveBeenCalledWith(TAB_1)
    expect(actions.focusPane).toHaveBeenCalledWith(SESSION, PANE_1)
    expect(actions.splitSurfacePane).toHaveBeenCalledWith(SESSION, 'right', PANE_1)
    expect(closeTab).toHaveBeenCalledWith(TAB_1)
    expect(actions.duplicateTab).toHaveBeenCalledWith(SESSION, TAB_1)
    expect(actions.floatTab).toHaveBeenCalledWith(SESSION, TAB_1, rect)
    expect(actions.unfloatPane).toHaveBeenCalledWith(SESSION, PANE_2)
    expect(actions.placeTab).toHaveBeenCalledWith(SESSION, TAB_1, PANE_1, 0)
    expect(actions.dropTab).toHaveBeenCalledWith(SESSION, TAB_1, PANE_1, 'right')
    expect(actions.moveFloat).toHaveBeenCalledWith(SESSION, PANE_2, 30, 40)
    expect(actions.resizeFloat).toHaveBeenCalledWith(SESSION, PANE_2, rect)
    expect(actions.resizeSplit).toHaveBeenCalledWith(SESSION, SPLIT_1, [0.3, 0.7])
    // The add control is the guide opened by kind, in that pane, beside any guide elsewhere.
    intents.addTab(PANE_1)
    expect(openTab).toHaveBeenCalledWith('guide', { surface: 'right', paneId: PANE_1, revealIfOpened: false })
  })
})
