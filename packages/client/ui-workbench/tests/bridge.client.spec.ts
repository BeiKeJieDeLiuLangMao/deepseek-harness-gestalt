import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  BrowserPageState, BrowserTarget, BrowserWorkspaceProjection,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { OfficialBrowserBridge, type WorkbenchSidebarFace } from '../src/client/bridge.ts'
import type { BoundBrowserWorkspace } from '../src/client/remote-bind.ts'
import { officialTabMeta } from '../src/official-tab-meta.ts'
import type { SidebarStateSlice } from '../src/sidebar-tabs.ts'

const SESSION = 's1' as SessionId
const TARGET: BrowserTarget = {
  profileId: 'p' as BrowserTarget['profileId'],
  workspaceId: 'w' as BrowserTarget['workspaceId'],
  browserId: 'b' as BrowserTarget['browserId'],
  tabId: 't' as BrowserTarget['tabId'],
}

function page(): BrowserPageState {
  return {
    status: 'open',
    target: TARGET,
    revision: 3,
    url: 'https://example.test/',
    title: 'Example',
    text: '',
    focused: true,
    chrome: { kind: 'persistent', name: 'test' as never, partition: 'persist:test' },
    storage: { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' },
  }
}

function projection(hasPage = true): BrowserWorkspaceProjection {
  return {
    activeWorkspaceId: hasPage ? TARGET.workspaceId : null,
    workspaces: hasPage ? [{
      workspaceId: TARGET.workspaceId,
      profileId: TARGET.profileId,
      activeBrowserId: TARGET.browserId,
      browsers: [{
        browserId: TARGET.browserId,
        activeTabId: TARGET.tabId,
        tabs: [{ tabId: TARGET.tabId, revision: 3 }],
      }],
    }] : [],
  }
}

function state(tabs: Array<{ id: string; type: string; meta?: unknown }>): SidebarStateSlice {
  return {
    panelOpen: false,
    splits: { kind: 'leaf', tabs },
  }
}

function bench(input: {
  projection?: BrowserWorkspaceProjection
  tabs?: Array<{ id: string; type: string; meta?: unknown }>
} = {}) {
  let currentProjection = input.projection ?? projection()
  let currentState = state(input.tabs ?? [{ id: 'browser:1', type: 'browser' }])
  const sidebar: WorkbenchSidebarFace = {
    openTab: vi.fn(),
    updateTab: vi.fn(),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    setPanelOpen: vi.fn(),
    getSnapshot: () => ({ sessionId: SESSION, state: currentState }),
  }
  const remote: BoundBrowserWorkspace = {
    create: vi.fn(async () => page()),
    close: vi.fn(async () => undefined),
    refresh: vi.fn(async () => page()),
    observe: vi.fn(async () => page()),
    screenshot: vi.fn(async () => ({
      target: TARGET, revision: 3, url: '', title: '', mediaType: 'image/png' as const, data: '',
    })),
  }
  const bridge = new OfficialBrowserBridge({
    sidebar,
    bindRemote: () => remote,
    projectionOf: () => currentProjection,
    createRequest: () => ({ profile: 'persistent', name: 'test' }),
  })
  return {
    bridge,
    remote,
    sidebar,
    setProjection: (next: BrowserWorkspaceProjection) => { currentProjection = next },
    setState: (next: SidebarStateSlice) => { currentState = next },
  }
}

describe('OfficialBrowserBridge', () => {
  it('attaches an existing official page to an empty sidebar tab', async () => {
    const b = bench()
    b.bridge.tick()
    await vi.waitFor(() => {
      expect(b.sidebar.updateTab).toHaveBeenCalledWith('browser:1', {
        meta: officialTabMeta(TARGET),
      })
    })
  })

  it('creates with the unresolved Profile request and lets Browser Workspace choose reuse', async () => {
    const b = bench({ projection: projection(false) })
    b.bridge.tick()
    await vi.waitFor(() => {
      expect(b.remote.create).toHaveBeenCalledWith({ profile: 'persistent', name: 'test' })
    })
    expect(b.sidebar.updateTab).toHaveBeenCalledWith('browser:1', {
      title: 'Example',
      meta: officialTabMeta(TARGET, { kind: 'persistent', name: 'test' }),
    })
  })

  it('closes an official page after its previously bound sidebar tab disappears', async () => {
    const meta = officialTabMeta(TARGET)
    const b = bench({ tabs: [{ id: 'browser:1', type: 'browser', meta }] })
    b.bridge.tick()
    await Promise.resolve()
    b.setState(state([]))
    b.bridge.tick()
    await vi.waitFor(() => {
      expect(b.remote.close).toHaveBeenCalledWith(TARGET, 3)
    })
  })

  it('reveals and activates the matching current Session tab', () => {
    const meta = officialTabMeta(TARGET)
    const b = bench({ tabs: [{ id: 'browser:1', type: 'browser', meta }] })
    b.bridge.reveal(SESSION)
    expect(b.sidebar.setPanelOpen).toHaveBeenCalledWith(true)
    expect(b.sidebar.activateTab).toHaveBeenCalledWith('browser:1')
  })

  it('does not duplicate an in-flight create for the same empty tab', async () => {
    let settle!: (value: BrowserPageState) => void
    const b = bench({ projection: projection(false) })
    vi.mocked(b.remote.create).mockReturnValue(new Promise((resolve) => { settle = resolve }))
    b.bridge.ensureOfficial('browser:1')
    b.bridge.ensureOfficial('browser:1')
    expect(b.remote.create).toHaveBeenCalledTimes(1)
    settle(page())
    await Promise.resolve()
  })
})
