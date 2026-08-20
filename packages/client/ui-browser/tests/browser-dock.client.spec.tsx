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
  return snapshotAt(4, overrides)
}

function snapshotAt(
  revision: number,
  overrides: Partial<BrowserWorkspaceProjection> = {},
): BrowserWorkspaceProjection {
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
          { tabId: BACK.tabId, controlOwner: 'human', revision: 2 },
          { tabId: TARGET.tabId, controlOwner: 'agent', revision },
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
    expect(input.focus).toHaveBeenCalledWith(BACK, 2)
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[0]!)
    expect(input.close).toHaveBeenCalledWith(BACK, 2)
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[1]!)
    expect(input.close).toHaveBeenCalledWith(TARGET, 4)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      expect(input.refresh).toHaveBeenCalledWith(TARGET, 4, 'https://alpha.test/path')
    })
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

  it('keeps occupancy when observe rejects', async () => {
    const input = props({ page: undefined })
    input.observe = vi.fn().mockRejectedValue(new Error('no session undefined'))
    render(<BrowserDock {...input} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('没有打开的页面')).toBeTruthy()
  })

  it('focuses and closes from the listing revision before observe settles', () => {
    const input = props({ page: undefined, screenshot: undefined })
    input.observe = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<BrowserDock {...input} />)
    expect(screen.getByText('没有打开的页面')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { selected: false }))
    expect(input.focus).toHaveBeenCalledWith(BACK, 2)
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[0]!)
    expect(input.close).toHaveBeenCalledWith(BACK, 2)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(input.refresh).not.toHaveBeenCalled()
  })

  it('keeps about:blank chrome for a still-blank first tab', async () => {
    const blank = page({
      revision: 0,
      url: 'about:blank',
      title: 'New Tab',
      text: '',
      chrome: { kind: 'temporary', partition: 'tmp' },
    })
    const input = props({ snapshot: snapshotAt(0), page: blank })
    render(<BrowserDock {...input} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { selected: true }).textContent).toContain('New Tab')
    })
    expect(screen.getByDisplayValue('about:blank')).toBeTruthy()
    expect(screen.queryByText('没有打开的页面')).toBeNull()
  })

  it('replaces about:blank chrome after a Binder-committed navigate', async () => {
    const blank = page({
      revision: 0,
      url: 'about:blank',
      title: 'New Tab',
      text: '',
      chrome: { kind: 'temporary', partition: 'tmp' },
    })
    const navigated = page({
      revision: 1,
      url: 'https://example.com/',
      title: 'Example Domain',
      text: 'This domain is for use in illustrative examples.',
      chrome: { kind: 'temporary', partition: 'tmp' },
    })
    const observe = vi.fn()
      .mockResolvedValueOnce(blank)
      .mockResolvedValueOnce(navigated)
    const screenshot = vi.fn()
      .mockResolvedValueOnce({ ...shot(), revision: 0, url: blank.url, title: blank.title })
      .mockResolvedValueOnce({
        ...shot(), revision: 1, url: navigated.url, title: navigated.title,
      })
    const input = props({ snapshot: snapshotAt(0), page: blank })
    input.observe = observe
    input.screenshot = screenshot
    const view = render(<BrowserDock {...input} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('about:blank')).toBeTruthy()
    })

    view.rerender(<BrowserDock {...input} useProjection={() => snapshotAt(1)} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Example Domain')
    })
    expect(screen.getByDisplayValue('example.com')).toBeTruthy()
    expect(screen.getByAltText('Example Domain')).toBeTruthy()
    expect(screen.getByText('This domain is for use in illustrative examples.')).toBeTruthy()
    expect(observe).toHaveBeenCalledTimes(2)
  })

  it('refreshes from the Runtime page instead of stale about:blank chrome', async () => {
    const blank = page({
      revision: 0,
      url: 'about:blank',
      title: 'New Tab',
      text: '',
      chrome: { kind: 'temporary', partition: 'tmp' },
    })
    const navigated = page({
      revision: 1,
      url: 'https://example.com/',
      title: 'Example Domain',
      text: 'Example Domain',
      chrome: { kind: 'temporary', partition: 'tmp' },
    })
    const input = props({ snapshot: snapshotAt(0), page: blank })
    input.observe = vi.fn()
      .mockResolvedValueOnce(blank)
      .mockResolvedValueOnce(navigated)
    input.refresh = vi.fn().mockResolvedValue(navigated)
    render(<BrowserDock {...input} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('about:blank')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      expect(input.refresh).toHaveBeenCalledWith(TARGET, 1, 'https://example.com/')
    })
    expect(input.refresh).not.toHaveBeenCalledWith(TARGET, 0, 'about:blank')
  })

  it('keeps occupancy when refresh observe rejects or the tab closed', async () => {
    const blank = page({
      revision: 0,
      url: 'about:blank',
      title: 'New Tab',
      text: '',
      chrome: { kind: 'temporary', partition: 'tmp' },
    })
    const rejected = props({ snapshot: snapshotAt(0), page: blank })
    rejected.observe = vi.fn()
      .mockResolvedValueOnce(blank)
      .mockRejectedValueOnce(new Error('session closed'))
    render(<BrowserDock {...rejected} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('about:blank')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await act(async () => { await Promise.resolve() })
    expect(rejected.refresh).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('about:blank')).toBeTruthy()
    cleanup()

    const closed = props({ snapshot: snapshotAt(0), page: blank })
    closed.observe = vi.fn()
      .mockResolvedValueOnce(blank)
      .mockResolvedValueOnce({ status: 'closed', target: TARGET, revision: 0 })
    render(<BrowserDock {...closed} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('about:blank')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await act(async () => { await Promise.resolve() })
    expect(closed.refresh).not.toHaveBeenCalled()
  })

  it('observes once and retries focus after a listed-revision conflict', async () => {
    const input = props()
    const healed = page({ revision: 5, target: BACK, focused: true })
    input.focus = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('browser revision conflict: expected 2, current 5'), {
        code: 'BROWSER_REVISION_CONFLICT',
      }))
      .mockResolvedValueOnce(healed)
    input.observe = vi.fn().mockResolvedValue(healed)
    render(<BrowserDock {...input} />)
    fireEvent.click(screen.getByRole('tab', { selected: false }))
    await waitFor(() => {
      expect(input.observe).toHaveBeenCalledWith(BACK)
    })
    expect(input.focus).toHaveBeenNthCalledWith(1, BACK, 2)
    expect(input.focus).toHaveBeenNthCalledWith(2, BACK, 5)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('observes once and retries close after a listed-revision conflict', async () => {
    const input = props()
    input.close = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('BROWSER_REVISION_CONFLICT'), {
        code: 'BROWSER_REVISION_CONFLICT',
      }))
      .mockResolvedValueOnce({ status: 'closed', target: BACK, revision: 3 })
    input.observe = vi.fn().mockResolvedValue(page({ revision: 3, target: BACK }))
    render(<BrowserDock {...input} />)
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[0]!)
    await waitFor(() => {
      expect(input.close).toHaveBeenCalledTimes(2)
    })
    expect(input.observe).toHaveBeenCalledWith(BACK)
    expect(input.close).toHaveBeenLastCalledWith(BACK, 3)
  })

  it('does not retry close after observe reports the tab closed', async () => {
    const input = props()
    input.close = vi.fn().mockRejectedValue(Object.assign(
      new Error('browser revision conflict: expected 2, current 3'),
      { code: 'BROWSER_REVISION_CONFLICT' },
    ))
    input.observe = vi.fn().mockResolvedValue({ status: 'closed', target: BACK, revision: 3 })
    render(<BrowserDock {...input} />)
    fireEvent.click(screen.getAllByRole('button', { name: '关闭标签页' })[0]!)
    await waitFor(() => {
      expect(input.observe).toHaveBeenCalledWith(BACK)
    })
    expect(input.close).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('surfaces a listed mutation that is not a recoverable revision conflict', async () => {
    const input = props()
    input.focus = vi.fn().mockRejectedValue(new Error('tab closed'))
    render(<BrowserDock {...input} />)
    fireEvent.click(screen.getByRole('tab', { selected: false }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('无法完成该操作')
    })
    expect(input.observe).not.toHaveBeenCalledWith(BACK)
  })

  it('surfaces a revision conflict that stays failed after observe and retry', async () => {
    const input = props()
    input.focus = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('browser revision conflict: expected 2, current 5'), {
        code: 'BROWSER_REVISION_CONFLICT',
      }))
      .mockRejectedValueOnce(new Error('still stale'))
    input.observe = vi.fn().mockResolvedValue(page({ revision: 5, target: BACK }))
    render(<BrowserDock {...input} />)
    fireEvent.click(screen.getByRole('tab', { selected: false }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('无法完成该操作')
    })
    expect(input.focus).toHaveBeenCalledTimes(2)
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
