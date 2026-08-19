// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  BrowserPageState,
  BrowserScreenshot,
  BrowserTarget,
  BrowserWorkspaceProjection,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { BrowserDock, type BrowserDockProps } from '../src/client/BrowserDock.tsx'
import { zh } from '../src/client/locales.ts'

class ResizeObserverStub {
  constructor(cb: ResizeObserverCallback) {
    ;(globalThis as { lastObserver?: { cb: ResizeObserverCallback } }).lastObserver = { cb }
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const TARGET: BrowserTarget = {
  profileId: 'profile-1' as BrowserTarget['profileId'],
  workspaceId: 'ws-1' as BrowserTarget['workspaceId'],
  browserId: 'br-1' as BrowserTarget['browserId'],
  tabId: 'tab-1' as BrowserTarget['tabId'],
}

const BACK: BrowserTarget = { ...TARGET, tabId: 'tab-0' as BrowserTarget['tabId'] }

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function page(overrides: Partial<BrowserPageState> = {}): BrowserPageState {
  return {
    status: 'open',
    target: TARGET,
    revision: 4,
    url: 'https://alpha.test/path',
    title: 'Alpha',
    text: 'page text',
    focused: true,
    controlOwner: 'agent',
    chrome: { kind: 'persistent', name: 'work' as never, partition: 'persist:work' },
    storage: {
      cookies: 'c', localStorage: 'l', indexedDb: 'i', cache: 'k', serviceWorker: 's',
    },
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
          { tabId: BACK.tabId, controlOwner: 'human' },
          { tabId: TARGET.tabId, controlOwner: 'agent' },
        ],
      }],
    }],
    ...overrides,
  }
}

function shot(): BrowserScreenshot {
  return {
    target: TARGET, revision: 4, url: 'https://alpha.test/path', title: 'Alpha',
    mediaType: 'image/png', data: PNG,
  }
}

function props(options: {
  snapshot?: BrowserWorkspaceProjection | null
  page?: BrowserPageState | undefined
  screenshot?: BrowserScreenshot | undefined
} = {}): BrowserDockProps {
  const current = options.page === undefined && !('page' in options) ? page() : options.page
  return {
    useProjection: () => options.snapshot === undefined ? snapshot() : options.snapshot,
    setDock: vi.fn().mockResolvedValue(snapshot()),
    focus: vi.fn().mockResolvedValue(current ?? page()),
    refresh: vi.fn().mockResolvedValue(current ?? page()),
    observe: vi.fn().mockResolvedValue(current ?? { status: 'closed', target: TARGET, revision: 0 }),
    screenshot: vi.fn().mockResolvedValue(options.screenshot ?? shot()),
    takeover: vi.fn().mockResolvedValue(current ?? page()),
    returnControl: vi.fn().mockResolvedValue(current ?? page()),
    close: vi.fn().mockResolvedValue({ status: 'closed', target: TARGET, revision: 5 }),
    openDetails: vi.fn(),
    setDetailsWidth: vi.fn(),
    closeDetails: vi.fn(),
    t: makeTranslate(zh),
  } as unknown as BrowserDockProps
}

describe('BrowserDock occupancy', () => {
  it('renders nothing without tabs or while collapsed', () => {
    expect(render(<BrowserDock {...props({ snapshot: null })} />).container.firstChild).toBeNull()
    cleanup()
    expect(render(<BrowserDock {...props({ snapshot: snapshot({ dockOpen: false }) })} />).container.firstChild).toBeNull()
  })

  it('opens the occupant range, shows title, persistent Profile, screenshot, and page text', async () => {
    const input = props()
    render(<BrowserDock {...input} />)
    expect(input.openDetails).toHaveBeenCalled()
    expect(input.setDetailsWidth).toHaveBeenCalledWith(720)
    await waitFor(() => {
      expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Alpha')
    })
    expect(screen.getByText('work')).toBeTruthy()
    expect(screen.getByDisplayValue('alpha.test')).toBeTruthy()
    expect(screen.getByAltText('Alpha')).toBeTruthy()
    expect(screen.getByText('page text')).toBeTruthy()
    expect(screen.getByRole('button', { name: '接管' })).toBeTruthy()
  })

  it('collapses, focuses, closes, refreshes, and returns control', async () => {
    const human = page({ controlOwner: 'human' })
    const input = props({ page: human })
    render(<BrowserDock {...input} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: '交还智能体' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '收起浏览器' }))
    expect(input.setDock).toHaveBeenCalledWith(false, 720)
    expect(input.closeDetails).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { selected: false }))
    expect(input.focus).toHaveBeenCalledWith(BACK, 4)
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[1]!)
    expect(input.close).toHaveBeenCalledWith(TARGET, 4)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(input.refresh).toHaveBeenCalledWith(TARGET, 4, 'https://alpha.test/path')
    fireEvent.click(screen.getByRole('button', { name: '交还智能体' }))
    expect(input.returnControl).toHaveBeenCalledWith(TARGET, 4)
  })

  it('takes control while the Agent owns the tab and persists a dragged width', async () => {
    vi.useFakeTimers()
    const input = props()
    const view = render(<BrowserDock {...input} />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: '接管' }))
    expect(input.takeover).toHaveBeenCalledWith(TARGET, 4)
    const root = view.container.querySelector('[data-browser-dock]') as HTMLDivElement
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ width: 880 } as DOMRect)
    const observer = (globalThis as { lastObserver?: { cb: ResizeObserverCallback } }).lastObserver
    observer?.cb([] as never, {} as never)
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(input.setDock).toHaveBeenCalledWith(true, 880)
    vi.useRealTimers()
  })

  it('shows the empty viewport and ignores gestures before observe settles', () => {
    const input = props({ page: undefined, screenshot: undefined })
    input.observe = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<BrowserDock {...input} />)
    expect(screen.getByText('没有打开的页面')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { selected: true }))
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[1]!)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(input.focus).not.toHaveBeenCalled()
    expect(input.close).not.toHaveBeenCalled()
    expect(input.refresh).not.toHaveBeenCalled()
  })

  it('ignores a zero-width resize observation', async () => {
    vi.useFakeTimers()
    const input = props()
    const view = render(<BrowserDock {...input} />)
    await act(async () => { await Promise.resolve() })
    const root = view.container.querySelector('[data-browser-dock]') as HTMLDivElement
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ width: 0 } as DOMRect)
    const observer = (globalThis as { lastObserver?: { cb: ResizeObserverCallback } }).lastObserver
    observer?.cb([] as never, {} as never)
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(input.setDock).not.toHaveBeenCalledWith(true, 0)
    vi.useRealTimers()
  })
})
