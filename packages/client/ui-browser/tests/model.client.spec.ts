import { describe, expect, it } from 'vitest'
import type {
  BrowserPageState,
  BrowserScreenshot,
  BrowserTarget,
  BrowserWorkspaceProjection,
} from '@deepseek-ai/dsh-browser-workspace/client'
import {
  BROWSER_DOCK_WIDTH_RANGE,
  browserAddressHost,
  browserTabTitle,
  hasBrowserTabs,
  openPageOf,
  persistentProfileLabel,
  screenshotDataUrl,
  selectBrowserDock,
  stackedBrowserTabs,
} from '../src/client/model.ts'

const TARGET: BrowserTarget = {
  profileId: 'profile-1' as BrowserTarget['profileId'],
  workspaceId: 'ws-1' as BrowserTarget['workspaceId'],
  browserId: 'br-1' as BrowserTarget['browserId'],
  tabId: 'tab-1' as BrowserTarget['tabId'],
}

const STORAGE = {
  cookies: 'cookies',
  localStorage: 'local',
  indexedDb: 'idb',
  cache: 'cache',
  serviceWorker: 'sw',
}

function page(overrides: Partial<BrowserPageState> = {}): BrowserPageState {
  return {
    status: 'open',
    target: TARGET,
    revision: 2,
    url: 'https://alpha.test/path',
    title: ' Alpha ',
    text: 'page text',
    focused: true,
    controlOwner: 'agent',
    chrome: { kind: 'temporary', partition: 'tmp' },
    storage: STORAGE,
    ...overrides,
  }
}

function snapshot(overrides: Partial<BrowserWorkspaceProjection> = {}): BrowserWorkspaceProjection {
  return {
    dockOpen: true,
    dockWidth: 720,
    userCollapsed: false,
    activeWorkspaceId: TARGET.workspaceId,
    workspaces: [{
      workspaceId: TARGET.workspaceId,
      profileId: TARGET.profileId,
      activeBrowserId: TARGET.browserId,
      browsers: [{
        browserId: TARGET.browserId,
        activeTabId: TARGET.tabId,
        tabs: [
          { tabId: 'tab-0' as BrowserTarget['tabId'], controlOwner: 'human', revision: 1 },
          { tabId: TARGET.tabId, controlOwner: 'agent', revision: 2 },
        ],
      }],
    }],
    ...overrides,
  }
}

describe('Browser Dock occupancy helpers', () => {
  it('requires at least one Workspace before occupancy', () => {
    expect(hasBrowserTabs(undefined)).toBe(false)
    expect(hasBrowserTabs(null)).toBe(false)
    expect(hasBrowserTabs(snapshot({ workspaces: [] }))).toBe(false)
    expect(hasBrowserTabs(snapshot())).toBe(true)
  })

  it('selects the named Workspace, instance, and active tab, falling back to the last of each', () => {
    const named = selectBrowserDock(snapshot())
    expect(named?.activeTab?.target).toEqual(TARGET)
    expect(named?.tabs.map(tab => tab.revision)).toEqual([1, 2])
    expect(named?.tabs.map(tab => tab.active)).toEqual([false, true])

    const unnamed = selectBrowserDock(snapshot({
      activeWorkspaceId: null,
      workspaces: [{
        workspaceId: TARGET.workspaceId,
        profileId: TARGET.profileId,
        activeBrowserId: null,
        browsers: [{
          browserId: TARGET.browserId,
          activeTabId: null,
          tabs: [{ tabId: TARGET.tabId, controlOwner: 'agent', revision: 2 }],
        }],
      }],
    }))
    expect(unnamed?.activeTab?.target.tabId).toBe(TARGET.tabId)
    expect(selectBrowserDock(undefined)).toBeUndefined()
    expect(selectBrowserDock(snapshot({ workspaces: [] }))).toBeUndefined()
    expect(selectBrowserDock(snapshot({
      workspaces: [{
        workspaceId: TARGET.workspaceId,
        profileId: TARGET.profileId,
        activeBrowserId: null,
        browsers: [],
      }],
    }))).toBeUndefined()
  })

  it('stacks inactive tabs behind the current tab', () => {
    const tabs = selectBrowserDock(snapshot())!.tabs
    expect(stackedBrowserTabs(tabs).map(tab => tab.active)).toEqual([false, true])
    expect(stackedBrowserTabs([])).toEqual([])
  })

  it('shows host, title, persistent Profile, and screenshot data URL', () => {
    expect(browserAddressHost('https://alpha.test/path')).toBe('alpha.test')
    expect(browserAddressHost('not a url')).toBe('not a url')
    expect(browserAddressHost('about:blank')).toBe('about:blank')
    expect(browserTabTitle(page(), 'Untitled')).toBe('Alpha')
    expect(browserTabTitle(page({ title: '   ' }), 'Untitled')).toBe('alpha.test')
    expect(browserTabTitle(undefined, 'Untitled')).toBe('Untitled')
    expect(persistentProfileLabel(page())).toBeUndefined()
    expect(persistentProfileLabel(page({
      chrome: { kind: 'persistent', name: 'work' as never, partition: 'persist:work' },
    }))).toBe('work')
    expect(persistentProfileLabel(page({
      chrome: { kind: 'shared', name: 'shared' as never, partition: 'persist:shared' },
    }), 'Shared identity')).toBe('Shared identity')
    const shot: BrowserScreenshot = {
      target: TARGET,
      revision: 2,
      url: 'https://alpha.test/',
      title: 'Alpha',
      mediaType: 'image/png',
      data: 'abc',
    }
    expect(screenshotDataUrl(shot)).toBe('data:image/png;base64,abc')
    expect(screenshotDataUrl(undefined)).toBeUndefined()
    expect(openPageOf(page())).toEqual(page())
    expect(openPageOf({ status: 'closed', target: TARGET, revision: 2 })).toBeUndefined()
  })

  it('keeps the occupant-specific details range at 420/640/960', () => {
    expect(BROWSER_DOCK_WIDTH_RANGE).toEqual({ minimum: 420, default: 640, maximum: 960 })
  })
})
