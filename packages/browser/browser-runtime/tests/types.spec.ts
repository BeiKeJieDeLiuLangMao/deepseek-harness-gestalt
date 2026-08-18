import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  addressedBrowserRuntimeState,
  assertBrowserNotAborted,
  BrowserInstanceId,
  BrowserProfileId,
  BrowserRuntimeError,
  BrowserTabId,
  BrowserWorkspaceId,
  emitBrowserRuntimeState,
  enqueueBrowserRuntimeOperation,
  requireOpenBrowserPage,
  sameBrowserTarget,
} from '@deepseek-ai/dsh-browser-runtime'

describe('Browser Runtime public vocabulary', () => {
  it('brands opaque identities without changing Provider-issued values', () => {
    expect({
      profileId: BrowserProfileId('profile'),
      workspaceId: BrowserWorkspaceId('workspace'),
      browserId: BrowserInstanceId('browser'),
      tabId: BrowserTabId('tab'),
    }).toEqual({
      profileId: 'profile',
      workspaceId: 'workspace',
      browserId: 'browser',
      tabId: 'tab',
    })
  })

  it('retains the stable Browser Runtime error code', () => {
    const error = new BrowserRuntimeError('missing target', 'BROWSER_NOT_FOUND')
    expect(error).toMatchObject({ name: 'BrowserRuntimeError', message: 'missing target', code: 'BROWSER_NOT_FOUND' })
  })
})

describe('Browser Runtime shared Provider helpers', () => {
  const target = {
    profileId: BrowserProfileId('profile'),
    workspaceId: BrowserWorkspaceId('workspace'),
    browserId: BrowserInstanceId('browser'),
    tabId: BrowserTabId('tab'),
  }

  it('compares opaque targets and rejects aborted work', () => {
    expect(sameBrowserTarget(target, { ...target })).toBe(true)
    expect(sameBrowserTarget(target, { ...target, tabId: BrowserTabId('other') })).toBe(false)
    assertBrowserNotAborted(undefined)
    const signal = AbortSignal.abort('stop')
    expect(() => {
      assertBrowserNotAborted(signal)
    }).toThrow(BrowserRuntimeError)
  })

  it('addresses open state and serializes one queued operation', async () => {
    const open = Object.freeze({
      status: 'open' as const,
      target,
      revision: 0,
      url: 'about:blank',
      title: '',
      text: '',
      focused: false,
    })
    expect(addressedBrowserRuntimeState(open, target)).toBe(open)
    expect(() => {
      addressedBrowserRuntimeState(undefined, target)
    }).toThrow(BrowserRuntimeError)
    expect(requireOpenBrowserPage(open)).toBe(open)
    expect(() => {
      requireOpenBrowserPage({ status: 'closed', target, revision: 1 })
    }).toThrow(BrowserRuntimeError)
    const first = enqueueBrowserRuntimeOperation(Promise.resolve(), () => undefined, () => 1)
    await expect(first.result).resolves.toBe(1)
    expect(() => {
      enqueueBrowserRuntimeOperation(first.queue, () => {
        throw new BrowserRuntimeError('browser runtime is disposed', 'BROWSER_DISPOSED')
      }, () => 2)
    }).toThrow(BrowserRuntimeError)
  })

  it('contains post-commit observer failures', async () => {
    const ctx = new Context()
    const warnings: unknown[] = []
    ctx.on('browser/runtime-state', () => { throw new Error('sync') })
    // oxlint-disable-next-line typescript/no-misused-promises -- exercises rejected post-commit observation
    ctx.on('browser/runtime-state', async () => { throw new Error('async') })
    emitBrowserRuntimeState(ctx, { status: 'closed', target, revision: 0 }, (error) => {
      warnings.push(error)
    })
    await Promise.resolve()
    expect(warnings.map(error => error instanceof Error ? error.message : error)).toEqual(['sync', 'async'])
  })
})
