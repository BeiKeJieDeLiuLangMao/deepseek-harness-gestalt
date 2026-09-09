/** Official workbench persistence, validation, and legacy conversion. */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  decodeSidebarWorkbench,
  encodeSidebarWorkbench,
  LEGACY_SIDEBAR_STORAGE_PREFIX,
  LocalSidebarWorkbenchPersistence,
  SIDEBAR_WORKBENCH_STORAGE_PREFIX,
} from '../src/client/persistence.ts'
import { createSurface, workbenchTabs } from '../src/client/stores.ts'

const SESSION = 'session-a' as SessionId

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }),
  }
}

function legacy() {
  return {
    panelOpen: true,
    activePane: 'right-pane',
    expanded: ['/work/src'],
    nextTerminal: 4,
    nextBrowser: 3,
    splits: {
      kind: 'leaf', id: 'right-pane', active: 'unknown-tab',
      tabs: [{ id: 'unknown-tab', type: 'plugin:unknown', title: 'Unknown', meta: { answer: 42 } }],
    },
    bottomOpen: true,
    bottomHeight: 260,
    bottomOpenedOnce: true,
    bottomSplits: {
      kind: 'leaf', id: 'bottom-pane', active: 'terminal-tab',
      tabs: [{
        id: 'terminal-tab', type: 'terminal', title: 'zsh', meta: { terminalId: 'pty-7' },
        pin: { scope: 'workspace', homeCwd: '/work' },
      }],
    },
    floats: [{
      id: 'float-one', x: 10, y: 20, w: 390, h: 780,
      tab: { id: 'browser-tab', type: 'browser', title: 'Browser', meta: { url: 'https://example.com' } },
    }],
    closedSideThreads: ['side-closed'],
  }
}

describe('official workbench persistence', () => {
  it('round-trips both layouts, metadata, pins, and extension data with process-local history reset', () => {
    const surface = createSurface(() => 'Start')
    const encoded = encodeSidebarWorkbench({
      ...surface,
      bottomHeight: 310,
      bottomOpenedOnce: true,
      data: { feature: { enabled: true } },
    })
    const restored = decodeSidebarWorkbench(JSON.parse(encoded) as unknown)
    expect(restored).toMatchObject({ bottomHeight: 310, bottomOpenedOnce: true, data: { feature: { enabled: true } } })
    expect(restored?.layout).toEqual(surface.layout)
    expect(restored?.bottom.layout).toEqual(surface.bottom.layout)
    expect(restored?.history.entries).toEqual([])
    expect(restored?.bottom.history.entries).toEqual([])
  })

  it('writes a complete official document before selecting a legacy conversion and keeps the legacy key intact', () => {
    const legacyKey = `${LEGACY_SIDEBAR_STORAGE_PREFIX}:${SESSION}`
    const officialKey = `${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${SESSION}`
    const backing = storage({ [legacyKey]: JSON.stringify(legacy()) })
    const persistence = new LocalSidebarWorkbenchPersistence(backing)
    const restored = persistence.load(SESSION, () => 'Start')
    expect(restored).toBeDefined()
    expect(backing.data.get(legacyKey)).toBe(JSON.stringify(legacy()))
    expect(decodeSidebarWorkbench(JSON.parse(backing.data.get(officialKey)!) as unknown)).toBeDefined()
    expect(restored?.layout.expanded).toBe(true)
    expect(restored?.bottom.layout.expanded).toBe(true)
    expect(restored?.bottomHeight).toBe(260)
    const tabs = workbenchTabs(restored!)
    expect(tabs.map(tab => tab.kind)).toEqual(expect.arrayContaining(['plugin:unknown', 'terminal', 'browser']))
    expect(new Set(tabs.map(tab => tab.id)).size).toBe(tabs.length)
    const unknown = tabs.find(tab => tab.kind === 'plugin:unknown')!
    const terminal = tabs.find(tab => tab.kind === 'terminal')!
    expect(restored?.tabs[unknown.id]?.payload).toEqual({ answer: 42 })
    expect(restored?.tabs[terminal.id]?.pin).toEqual({ scope: 'workspace', homeSessionId: SESSION, homeCwd: '/work' })
    expect(restored?.data['legacy.ui-better-sidebar']).toMatchObject({ closedSideThreads: ['side-closed'] })
  })

  it('does not select a migration when the official write fails', () => {
    const legacyKey = `${LEGACY_SIDEBAR_STORAGE_PREFIX}:${SESSION}`
    const backing = storage({ [legacyKey]: JSON.stringify(legacy()) })
    backing.setItem.mockImplementation(() => { throw new Error('quota') })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persistence = new LocalSidebarWorkbenchPersistence(backing)
    expect(persistence.load(SESSION, () => 'Start')).toBeUndefined()
    expect(backing.data.has(`${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${SESSION}`)).toBe(false)
    expect(backing.data.get(legacyKey)).toBe(JSON.stringify(legacy()))
    expect(error).toHaveBeenCalledWith('sidebarRight: legacy workbench migration failed:', expect.any(Error))
    backing.setItem.mockImplementation((key: string, value: string) => { backing.data.set(key, value) })
    persistence.save(SESSION, createSurface(() => 'Start'))
    expect(backing.data.has(`${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${SESSION}`)).toBe(false)
    persistence.clear(SESSION)
    persistence.save(SESSION, createSurface(() => 'Start'))
    expect(backing.data.has(`${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${SESSION}`)).toBe(true)
    error.mockRestore()
  })

  it('preserves an unknown official version and blocks later writes until an explicit clear', () => {
    const key = `${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${SESSION}`
    const unknown = JSON.stringify({ version: 99, future: { opaque: true } })
    const backing = storage({ [key]: unknown })
    const persistence = new LocalSidebarWorkbenchPersistence(backing)
    expect(persistence.load(SESSION, () => 'Start')).toBeUndefined()
    persistence.save(SESSION, createSurface(() => 'Start'))
    expect(backing.data.get(key)).toBe(unknown)
    persistence.clear(SESSION)
    persistence.save(SESSION, createSurface(() => 'Start'))
    expect(backing.data.get(key)).not.toBe(unknown)
  })

  it('rejects duplicate cross-surface ids and a minted cursor behind restored records', () => {
    const surface = createSurface(() => 'Start')
    const document = JSON.parse(encodeSidebarWorkbench(surface)) as {
      minted: number
      right: { layout: typeof surface.layout }
      bottom: { layout: typeof surface.bottom.layout }
    }
    document.bottom.layout = document.right.layout
    expect(decodeSidebarWorkbench(document)).toBeUndefined()
    document.bottom.layout = surface.bottom.layout
    document.minted = 0
    expect(decodeSidebarWorkbench(document)).toBeUndefined()
  })
})
