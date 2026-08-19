// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  BrowserPageState,
  BrowserScreenshot,
  BrowserTarget,
  BrowserWorkspaceProjection,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { BrowserPreview, type BrowserPreviewProps } from '../src/client/BrowserPreview.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
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

function page(): BrowserPageState {
  return {
    status: 'open',
    target: TARGET,
    revision: 3,
    url: 'https://alpha.test/',
    title: 'Alpha',
    text: 'page text',
    focused: true,
    controlOwner: 'agent',
    chrome: { kind: 'temporary', partition: 'tmp' },
    storage: {
      cookies: 'c', localStorage: 'l', indexedDb: 'i', cache: 'k', serviceWorker: 's',
    },
  }
}

function snapshot(overrides: Partial<BrowserWorkspaceProjection> = {}): BrowserWorkspaceProjection {
  return {
    dockOpen: false,
    dockWidth: 640,
    userCollapsed: true,
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

function props(current: BrowserWorkspaceProjection | null | undefined = snapshot()): BrowserPreviewProps {
  const open = page()
  return {
    useProjection: () => current,
    openDock: vi.fn().mockResolvedValue(snapshot({ dockOpen: true, userCollapsed: false })),
    focus: vi.fn().mockResolvedValue(open),
    observe: vi.fn().mockResolvedValue(open),
    screenshot: vi.fn().mockResolvedValue({
      target: TARGET, revision: 3, url: open.url, title: open.title, mediaType: 'image/png', data: PNG,
    } satisfies BrowserScreenshot),
    t: makeTranslate(zh),
  } as unknown as BrowserPreviewProps
}

describe('BrowserPreview occupancy', () => {
  it('renders nothing without tabs or while the Dock is open', () => {
    expect(render(<BrowserPreview {...props(null)} />).container.firstChild).toBeNull()
    cleanup()
    expect(render(<BrowserPreview {...props(snapshot({ dockOpen: true, userCollapsed: false }))} />).container.firstChild).toBeNull()
  })

  it('opens the current layer and focuses a back layer', async () => {
    const input = props()
    render(<BrowserPreview {...input} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开 Alpha' })).toBeTruthy()
    })
    expect(screen.getByText('Alpha · alpha.test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '展开 Alpha' }))
    expect(input.openDock).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '切换到 Alpha' }))
    expect(input.focus).toHaveBeenCalledWith(BACK, 3)
  })

  it('ignores a back-layer click before observe settles', () => {
    const input = props()
    input.observe = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<BrowserPreview {...input} />)
    fireEvent.click(screen.getByRole('button', { name: '切换到 无标题' }))
    expect(input.focus).not.toHaveBeenCalled()
  })
})
