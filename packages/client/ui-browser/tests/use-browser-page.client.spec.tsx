// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type {
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { useBrowserPage } from '../src/client/use-browser-page.ts'

afterEach(cleanup)

const TARGET: BrowserTarget = {
  profileId: 'profile-1' as BrowserTarget['profileId'],
  workspaceId: 'ws-1' as BrowserTarget['workspaceId'],
  browserId: 'br-1' as BrowserTarget['browserId'],
  tabId: 'tab-1' as BrowserTarget['tabId'],
}

function page(): BrowserPageState {
  return {
    status: 'open',
    target: TARGET,
    revision: 1,
    url: 'https://alpha.test/',
    title: 'Alpha',
    text: 'text',
    focused: true,
    controlOwner: 'agent',
    chrome: { kind: 'temporary', partition: 'tmp' },
    storage: {
      cookies: 'c', localStorage: 'l', indexedDb: 'i', cache: 'k', serviceWorker: 's',
    },
  }
}

function Probe(props: {
  target?: BrowserTarget
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>
}) {
  const facts = useBrowserPage(props.target, props.observe, props.screenshot)
  return (
    <div>
      <span data-testid="title">{facts.page?.title ?? 'none'}</span>
      <span data-testid="shot">{facts.screenshot === undefined ? 'none' : 'yes'}</span>
    </div>
  )
}

describe('useBrowserPage', () => {
  it('clears facts without a target and ignores a cancelled load', async () => {
    const observe = vi.fn(async () => page())
    const screenshot = vi.fn(async () => ({
      target: TARGET, revision: 1, url: 'https://alpha.test/', title: 'Alpha',
      mediaType: 'image/png' as const, data: 'abc',
    }))
    const view = render(<Probe observe={observe} screenshot={screenshot} />)
    expect(view.getByTestId('title').textContent).toBe('none')
    view.rerender(<Probe target={TARGET} observe={observe} screenshot={screenshot} />)
    await waitFor(() => { expect(view.getByTestId('title').textContent).toBe('Alpha') })
    expect(view.getByTestId('shot').textContent).toBe('yes')
    view.rerender(<Probe observe={observe} screenshot={screenshot} />)
    expect(view.getByTestId('title').textContent).toBe('none')
  })

  it('discards a late observe after unmount', async () => {
    let resolveObserve: ((value: BrowserPageState) => void) | undefined
    const observe = vi.fn(() => new Promise<BrowserPageState>((resolve) => { resolveObserve = resolve }))
    const screenshot = vi.fn(async () => ({
      target: TARGET, revision: 1, url: 'https://alpha.test/', title: 'Alpha',
      mediaType: 'image/png' as const, data: 'abc',
    }))
    const view = render(<Probe target={TARGET} observe={observe} screenshot={screenshot} />)
    await waitFor(() => { expect(observe).toHaveBeenCalled() })
    view.unmount()
    resolveObserve?.(page())
    await Promise.resolve()
    expect(screenshot).not.toHaveBeenCalled()
  })

  it('discards a late screenshot after unmount', async () => {
    let resolveShot: ((value: BrowserScreenshot) => void) | undefined
    const observe = vi.fn(async () => page())
    const screenshot = vi.fn(() => new Promise<BrowserScreenshot>((resolve) => { resolveShot = resolve }))
    const view = render(<Probe target={TARGET} observe={observe} screenshot={screenshot} />)
    await waitFor(() => { expect(screenshot).toHaveBeenCalled() })
    view.unmount()
    resolveShot?.({
      target: TARGET, revision: 1, url: 'https://alpha.test/', title: 'Alpha',
      mediaType: 'image/png', data: 'abc',
    })
    await Promise.resolve()
    expect(view.queryByTestId('title')).toBeNull()
  })

  it('skips the screenshot when the tab is closed', async () => {
    const observe = vi.fn(async () => ({ status: 'closed' as const, target: TARGET, revision: 0 }))
    const screenshot = vi.fn(async () => {
      throw new Error('screenshot must not run')
    })
    const view = render(<Probe target={TARGET} observe={observe} screenshot={screenshot} />)
    await waitFor(() => { expect(view.getByTestId('title').textContent).toBe('none') })
    expect(screenshot).not.toHaveBeenCalled()
  })
})
