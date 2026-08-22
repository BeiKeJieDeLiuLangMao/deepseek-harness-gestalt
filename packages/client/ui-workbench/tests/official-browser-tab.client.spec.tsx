// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  BrowserPageState, BrowserScreenshot, BrowserTarget,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { OfficialBrowserTab } from '../src/client/OfficialBrowserTab.tsx'
import { officialTabMeta } from '../src/official-tab-meta.ts'

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
    text: 'body',
    focused: true,
    chrome: { kind: 'shared', name: 'shared' as never, partition: 'persist:shared' },
    storage: { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' },
  }
}

function bench({ overlay = false }: { overlay?: boolean } = {}) {
  if (overlay) document.documentElement.setAttribute('data-dsh-desktop-overlay', '')
  const ctx = new Context()
  const current = page()
  const updateTab = vi.fn()
  const ensureOfficial = vi.fn()
  const observe = vi.fn(async () => ({ ok: true as const, value: current }))
  const screenshot = vi.fn(async () => ({
    ok: true as const,
    value: {
      target: TARGET,
      revision: current.revision,
      url: current.url,
      title: current.title,
      mediaType: 'image/png',
      data: 'png',
    } satisfies BrowserScreenshot,
  }))
  ctx.provide('sessions', {
    list: {
      getSnapshot: () => ({ byId: { [SESSION]: { projectionValues: {} } } }),
      subscribe: () => () => {},
    },
  })
  ctx.provide('locale', { bind: () => (key: string) => key })
  ctx.provide('betterSidebar', { updateTab })
  ctx.provide('workbenchBrowser', { ensureOfficial })
  ctx.provide('remote.browserWorkspace', {
    close: vi.fn(),
    navigate: vi.fn(),
    observe,
    screenshot,
  })
  return { ctx, ensureOfficial, observe, screenshot, updateTab }
}

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-dsh-desktop-overlay')
})

describe('OfficialBrowserTab', () => {
  it('renders imported page chrome and commits observed title and Profile metadata', async () => {
    const b = bench()
    render(
      <OfficialBrowserTab
        ctx={b.ctx}
        tab={{ id: 'browser:1', meta: officialTabMeta(TARGET) }}
        scope={{ sessionId: SESSION }}
      />,
    )
    await waitFor(() => {
      const address = screen.getByRole('textbox', { name: 'dock.address' })
      if (!(address instanceof HTMLInputElement)) throw new Error('address control is not an input')
      expect(address.value).toBe('https://example.test/')
    })
    expect(b.observe).toHaveBeenCalledWith(SESSION, TARGET)
    expect(b.screenshot).toHaveBeenCalledWith(SESSION, TARGET)
    expect(b.updateTab).toHaveBeenCalledWith('browser:1', {
      title: 'Example',
      meta: officialTabMeta(TARGET, { kind: 'shared' }),
    })
  })

  it('delegates an empty tab to the workbench bridge without calling create directly', () => {
    const b = bench()
    render(<OfficialBrowserTab ctx={b.ctx} tab={{ id: 'browser:2' }} scope={{ sessionId: SESSION }} />)
    expect(screen.getByText('dock.creating')).toBeTruthy()
    expect(b.ensureOfficial).toHaveBeenCalledWith('browser:2')
  })

  it('does not observe or create from the Desktop overlay document', () => {
    const b = bench({ overlay: true })
    const view = render(
      <OfficialBrowserTab
        ctx={b.ctx}
        tab={{ id: 'browser:1', meta: officialTabMeta(TARGET) }}
        scope={{ sessionId: SESSION }}
      />,
    )
    expect(view.container.firstChild).toBeNull()
    expect(b.ensureOfficial).not.toHaveBeenCalled()
    expect(b.observe).not.toHaveBeenCalled()
  })
})
