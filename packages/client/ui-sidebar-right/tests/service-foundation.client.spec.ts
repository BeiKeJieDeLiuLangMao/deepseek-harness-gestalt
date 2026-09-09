/** Targeted navigation, projection, payload, pin, and close lifecycle. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSidebarRightController } from '../src/client/service.ts'
import { SidebarRightTabRegistry, type SidebarRightTabCreateRequest } from '../src/client/tab-registry.ts'
import { createSidebarRightStore } from '../src/client/stores.ts'
import { guideDefinition } from '../src/client/tabs/guide/definition.ts'
import { SidebarRightCloseCoordinator } from '../src/client/close-coordinator.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

declare module '../src/client/contract/payload.ts' {
  interface SidebarRightTabPayloadMap {
    terminal: { terminalId: string; shell?: string }
  }
}

const SESSION = 'cold-session' as SessionId
const t = ((key: string) => key) as Parameters<typeof guideDefinition>[0]

function harness() {
  const ctx = new Context()
  const tabs = new SidebarRightTabRegistry(ctx)
  tabs.register(guideDefinition(t))
  const pinResource = vi.fn()
  const { controller, adopt, materializeWith } = createSidebarRightController(tabs, pinResource)
  const releases: Array<() => void> = []
  const store = createSidebarRightStore(() => ({ kind: 'guide', title: 'Start' }), undefined, (sessionId, instance) => {
    releases.push(adopt(sessionId as SessionId, instance))
  })
  materializeWith(sessionId => store.create(sessionId))
  return { controller, tabs, releases, pinResource, store }
}

describe('official workbench foundation', () => {
  it('materializes a never-rendered Session and projects multi-instance pages, payload updates, bottom placement, and pins', async () => {
    const { controller, tabs } = harness()
    tabs.register({ id: 'spec/terminal', kind: 'terminal', title: () => 'Terminal' })
    const target = controller.forSession(SESSION)
    const first = await target.openTab('terminal', {
      instanceId: 'pty-one',
      surface: 'bottom',
      payload: { terminalId: 'pty-one' },
      pin: { scope: 'global', homeSessionId: SESSION },
    })
    const second = await target.openTab('terminal', { instanceId: 'pty-two', surface: 'bottom' })
    expect(second).not.toBe(first)
    target.update(first, { title: 'zsh', payload: { terminalId: 'pty-one', shell: 'zsh' } })

    const session = controller.getSnapshot().sessions.find(candidate => candidate.sessionId === SESSION)
    const projected = session?.tabs.find(tab => tab.record.id === first)
    expect(projected).toMatchObject({
      surface: 'bottom',
      record: { title: 'zsh', contentId: 'sidebar://terminal/pty-one' },
      state: {
        payload: { terminalId: 'pty-one', shell: 'zsh' },
        pin: { scope: 'global', homeSessionId: SESSION },
      },
    })
    expect(controller.getSnapshot().pinned.map(tab => tab.record.id)).toEqual([first])
  })

  it('reconciles right and bottom records as one SessionDomain set', async () => {
    const { controller, tabs, store } = harness()
    tabs.register({ id: 'spec/page', kind: 'page', title: () => 'Page' })
    const target = controller.forSession(SESSION)
    const instance = store.create(SESSION)
    instance.actions.setSurfaceExpanded(SESSION, 'right', true)
    instance.actions.setSurfaceExpanded(SESSION, 'bottom', true)
    await target.openTab('page', { instanceId: 'bottom', surface: 'bottom' })
    const guides = controller.getSnapshot().sessions[0]?.tabs.filter(tab => tab.record.kind === 'guide') ?? []
    const right = guides.find(tab => tab.surface === 'right')
    const bottom = guides.find(tab => tab.surface === 'bottom')
    if (right === undefined || bottom === undefined) throw new Error('expected both guide occurrences')
    const rightOccurrence = controller.tabDomain.occurrence(SESSION, right.record)
    const bottomOccurrence = controller.tabDomain.occurrence(SESSION, bottom.record)
    await target.close(bottom.record.id)
    expect(bottomOccurrence.signal.aborted).toBe(true)
    expect(rightOccurrence.signal.aborted).toBe(false)
  })

  it('projects every visible split-pane tab separately from the focused pane and mounted Session', async () => {
    const { controller, tabs, store } = harness()
    tabs.register({ id: 'spec/page', kind: 'page', title: address => address })
    const target = controller.forSession(SESSION)
    const first = await target.openTab('page', { instanceId: 'first' })
    const instance = store.create(SESSION)
    let secondPane: Parameters<typeof instance.actions.focusPane>[1] | undefined
    instance.actions.splitSurfacePane(SESSION, 'right', undefined, (paneId) => { secondPane = paneId })
    if (secondPane === undefined) throw new Error('expected second pane')
    const second = await target.openTab('page', { instanceId: 'second', paneId: secondPane })
    const beforeMount = controller.getSnapshot()
    expect(beforeMount.mountedSessionId).toBeUndefined()
    expect(beforeMount.sessions[0]?.tabs.filter(tab => tab.visible).map(tab => tab.record.id)).toEqual([first, second])
    expect(beforeMount.sessions[0]?.tabs.filter(tab => tab.surface === 'right' && tab.active).map(tab => tab.record.id))
      .toEqual([second])

    const release = controller.bind({
      sessionId: SESSION,
      actions: instance.actions,
      surfaces: instance.getSnapshot().bySession,
      canSplitPane: () => true,
    })
    expect(controller.getSnapshot().mountedSessionId).toBe(SESSION)
    release()
    expect(controller.getSnapshot().mountedSessionId).toBeUndefined()
  })

  it('settles a descriptor-created identity and payload from pure Session facts', async () => {
    const { controller, tabs } = harness()
    const create = vi.fn((request: SidebarRightTabCreateRequest) => {
      expect(request).not.toHaveProperty('ctx')
      expect(request).not.toHaveProperty('store')
      expect(request.sessionId).toBe(SESSION)
      expect(request.preferences.workspaceFence).toBe(true)
      return {
        contentId: 'runtime://terminal/owned',
        title: 'zsh',
        payload: { terminalId: 'owned', shell: 'zsh' },
      }
    })
    tabs.register({ id: 'spec/runtime', kind: 'terminal', title: () => 'Terminal', create })
    const opened = await controller.forSession(SESSION).openTab('terminal', { instanceId: 'request' })
    const projected = controller.getSnapshot().sessions[0]?.tabs.find(tab => tab.record.id === opened)
    expect(projected).toMatchObject({
      record: { contentId: 'runtime://terminal/owned', title: 'zsh' },
      state: { payload: { terminalId: 'owned', shell: 'zsh' } },
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it('opens one lifecycle occurrence and activates it on dedupe and tab-strip focus', async () => {
    const { controller, tabs, store } = harness()
    const onOpen = vi.fn()
    const onActivate = vi.fn()
    tabs.register({
      id: 'spec/terminal',
      kind: 'terminal',
      title: () => 'Terminal',
      dedupeKey: tab => (tab.payload as { terminalId?: string } | undefined)?.terminalId,
      onOpen,
      onActivate,
    })
    const target = controller.forSession(SESSION)
    const first = await target.openTab('terminal', { instanceId: 'first', payload: { terminalId: 'shared' } })
    const second = await target.openTab('terminal', { instanceId: 'second', payload: { terminalId: 'shared' } })
    expect(second).toBe(first)
    expect(controller.getSnapshot().sessions[0]?.tabs.filter(tab => tab.record.kind === 'terminal')).toHaveLength(1)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ id: first, payload: { terminalId: 'shared' } })
    expect(onOpen.mock.calls[0]?.[1]).toMatchObject({ sessionId: SESSION })
    expect(onActivate).toHaveBeenCalledOnce()

    const instance = store.create(SESSION)
    const release = controller.bind({
      sessionId: SESSION,
      actions: instance.actions,
      surfaces: instance.getSnapshot().bySession,
      canSplitPane: () => true,
    })
    controller.focus(first)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onActivate).toHaveBeenCalledTimes(2)
    expect(onActivate.mock.calls[1]?.[0]).toMatchObject({ id: first, payload: { terminalId: 'shared' } })
    release()
  })

  it('restores a cold occurrence without taking focus or expanding the surface', async () => {
    const { controller, tabs } = harness()
    const onOpen = vi.fn()
    const onActivate = vi.fn()
    tabs.register({ id: 'spec/sidechat', kind: 'sidechat', title: () => 'Side Chat', onOpen, onActivate })
    const target = controller.forSession(SESSION)
    const before = controller.getSnapshot().sessions[0]!
    const activeGuide = before.tabs.find(tab => tab.surface === 'right' && tab.active)?.record.id

    const restored = await target.openTab('sidechat', { instanceId: 'child', activate: false })
    const after = controller.getSnapshot().sessions[0]!
    expect(after.rightExpanded).toBe(false)
    expect(after.tabs.find(tab => tab.surface === 'right' && tab.active)?.record.id).toBe(activeGuide)
    expect(after.tabs.find(tab => tab.record.id === restored)).toBeDefined()
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()

    expect(await target.openTab('sidechat', { instanceId: 'child', activate: false })).toBe(restored)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('refuses descriptor creation before mutating the official surfaces', async () => {
    const { controller, tabs } = harness()
    tabs.register({ id: 'spec/refuse', kind: 'refuse', title: () => 'Refuse', create: () => false })
    const target = controller.forSession(SESSION)
    const before = controller.getSnapshot().sessions[0]?.tabs.map(tab => tab.record.id)
    await expect(target.openTab('refuse')).rejects.toThrow('refused creation')
    expect(controller.getSnapshot().sessions[0]?.tabs.map(tab => tab.record.id)).toEqual(before)
  })

  it('cancels a replacement before mutation when close admission refuses it', async () => {
    const { controller, tabs } = harness()
    const beforeClose = vi.fn(() => false)
    const release = vi.fn()
    tabs.register({ id: 'spec/owned', kind: 'owned', title: () => 'Owned', beforeClose, close: release })
    const target = controller.forSession(SESSION)
    const owned = await target.openTab('owned', { instanceId: 'runtime-one' })
    await expect(target.openTab('guide', { replaceTab: owned })).rejects.toThrow('could not close')
    expect(beforeClose).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
    expect(controller.getSnapshot().sessions[0]?.tabs.some(tab => tab.record.id === owned)).toBe(true)
  })

  it('checkpoints history when replacement releases a runtime-owned occurrence', async () => {
    const { controller, tabs, store } = harness()
    const release = vi.fn()
    tabs.register({ id: 'spec/owned', kind: 'owned', title: () => 'Owned', close: release })
    const target = controller.forSession(SESSION)
    const owned = await target.openTab('owned', { instanceId: 'runtime-one' })
    await target.openTab('guide', { replaceTab: owned })
    expect(release).toHaveBeenCalledOnce()
    expect(store.create(SESSION).getSnapshot().bySession[SESSION]?.history.entries).toEqual([])
  })

  it('admits a batch before release, removes successful records, and retains a failed runtime owner', async () => {
    const { controller, tabs } = harness()
    const beforeClose = vi.fn(async () => {})
    const release = vi.fn(async ({ payload }) => {
      if ((payload as { fail?: boolean } | undefined)?.fail === true) throw new Error('runtime busy')
    })
    tabs.register({ id: 'spec/owned', kind: 'owned', title: () => 'Owned', beforeClose, close: release })
    const target = controller.forSession(SESSION)
    const successful = await target.openTab('owned', { instanceId: 'success', payload: { fail: false } })
    const failed = await target.openTab('owned', { instanceId: 'failed', payload: { fail: true } })
    const outcome = await target.reset()
    expect(outcome.admitted).toBe(true)
    expect(outcome.closed).toContain(successful)
    expect(outcome.failed.map(failure => failure.tabId)).toEqual([failed])
    expect(outcome.failed[0]?.error).toBeInstanceOf(Error)
    expect((outcome.failed[0]?.error as Error).message).toBe('runtime busy')
    const remaining = controller.getSnapshot().sessions[0]?.tabs.map(tab => tab.record.id)
    expect(remaining).toContain(failed)
    expect(remaining).not.toContain(successful)
    expect(beforeClose).toHaveBeenCalledTimes(2)
    expect(release).toHaveBeenCalledTimes(2)
  })

  it('serializes duplicate closes so a runtime owner releases exactly once', async () => {
    const { controller, tabs } = harness()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => { finish = resolve })
    const release = vi.fn(() => gate)
    tabs.register({ id: 'spec/owned', kind: 'owned', title: () => 'Owned', close: release })
    const target = controller.forSession(SESSION)
    const owned = await target.openTab('owned', { instanceId: 'one' })
    const first = target.close(owned)
    const duplicate = target.close(owned)
    await vi.waitFor(() => { expect(release).toHaveBeenCalledOnce() })
    finish()
    expect((await first).closed).toEqual([owned])
    expect((await duplicate).closed).toEqual([])
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects a failed commit without stalling the next close transaction', async () => {
    const coordinator = new SidebarRightCloseCoordinator()
    const id = 'tab-owned' as TabId
    const candidate = () => [{
      context: {
        sessionId: SESSION,
        surface: 'right' as const,
        tab: { id, kind: 'owned', contentId: 'sidebar://owned', title: 'Owned' },
        payload: undefined,
        pin: undefined,
        signal: new AbortController().signal,
        reason: 'close' as const,
      },
      definition: undefined,
    }]
    await expect(coordinator.run(candidate, () => { throw new Error('commit failed') })).rejects.toThrow('commit failed')
    await expect(coordinator.run(candidate, () => {})).resolves.toMatchObject({ admitted: true, closed: [id] })
  })
})
