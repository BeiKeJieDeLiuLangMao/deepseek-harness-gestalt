import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  addressedBrowserRuntimeState,
  assertBrowserCreateAttach,
  assertBrowserNotAborted,
  assertBrowserProfileName,
  browserProfileChrome,
  browserSessionPartition,
  BrowserInstanceId,
  BrowserProfileId,
  BrowserProfileName,
  BrowserRuntimeError,
  BrowserTabId,
  BrowserWorkspaceId,
  emitBrowserRuntimeState,
  enqueueBrowserRuntimeOperation,
  labeledBrowserProfileName,
  requireOpenBrowserPage,
  resolveBrowserProfileCreate,
  sameBrowserInstance,
  sameBrowserProfile,
  sameBrowserTarget,
  sameBrowserWorkspace,
  browserProfileStorage,
  browserTargetFor,
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

  it('brands a named Browser Profile without adding an account-picker identity', () => {
    expect(BrowserProfileName('work')).toBe('work')
  })

  it('maps a named Profile to a stable Electron persist partition and an address-field label', () => {
    const name = BrowserProfileName('work')
    expect(browserSessionPartition('tandem-work')).toBe('persist:session-tandem-work')
    expect(browserProfileChrome({ kind: 'persistent', name, sessionName: 'tandem-work' })).toEqual({
      kind: 'persistent',
      name: 'work',
      partition: 'persist:session-tandem-work',
    })
    expect(labeledBrowserProfileName(browserProfileChrome({
      kind: 'persistent',
      name,
      sessionName: 'tandem-work',
    }))).toBe('work')
  })

  it('omits the address-field label for a temporary Profile', () => {
    const chrome = browserProfileChrome({ kind: 'temporary', sessionName: 'tandem-tmp-1' })
    expect(chrome).toEqual({
      kind: 'temporary',
      partition: 'persist:session-tandem-tmp-1',
    })
    expect(labeledBrowserProfileName(chrome)).toBeUndefined()
    expect(chrome).not.toHaveProperty('name')
    expect(() => browserProfileChrome({ kind: 'persistent', sessionName: 'tandem-work' }))
      .toThrow(BrowserRuntimeError)
  })

  it('rejects a Profile name that cannot be a stable partition key', () => {
    for (const [label, name] of [
      ['empty', ''],
      ['blank', '  '],
      ['path separator', 'work/home'],
      ['backslash', 'work\\home'],
      ['control character', 'work\nname'],
      ['leading hyphen', '-work'],
      ['reserved temporary marker', 'tmp-1'],
    ] as const) {
      expect(() => assertBrowserProfileName(name), label).toThrow(BrowserRuntimeError)
      try {
        assertBrowserProfileName(name)
      } catch (error) {
        expect(error).toMatchObject({ code: 'BROWSER_PROFILE_NAME' })
      }
    }
    expect(assertBrowserProfileName('Work.Account_1')).toBe('Work.Account_1')
  })

  it('resolves unique temporary facts and stable named-Profile facts', () => {
    expect(resolveBrowserProfileCreate('tandem', { profile: 'temporary' }, 2)).toEqual({
      profileId: 'tandem-tmp-2',
      sessionName: 'tandem-tmp-2',
      chrome: { kind: 'temporary', partition: 'persist:session-tandem-tmp-2' },
    })
    expect(resolveBrowserProfileCreate('tandem', { profile: 'persistent', name: 'work' }, 9)).toEqual({
      profileId: 'tandem-profile-work',
      sessionName: 'tandem-work',
      chrome: { kind: 'persistent', name: 'work', partition: 'persist:session-tandem-work' },
    })
    const work = browserTargetFor(BrowserProfileId('tandem-profile-work'), 'tandem-work', 1)
    expect(work).toEqual({
      profileId: 'tandem-profile-work',
      workspaceId: 'tandem-work-workspace',
      browserId: 'tandem-work-browser-1',
      tabId: 'tandem-work-tab-1',
    })
    const second = browserTargetFor(BrowserProfileId('tandem-profile-work'), 'tandem-work', 2, {
      kind: 'browser',
      workspaceId: work.workspaceId,
      browserId: work.browserId,
    })
    expect(sameBrowserProfile(work, second)).toBe(true)
    expect(sameBrowserWorkspace(work, second)).toBe(true)
    expect(sameBrowserInstance(work, second)).toBe(true)
    expect(second.tabId).toBe('tandem-work-tab-2')
    expect(() => {
      assertBrowserCreateAttach([], work.profileId, {
        kind: 'workspace',
        workspaceId: work.workspaceId,
      })
    }).toThrow(BrowserRuntimeError)
    expect(() => {
      assertBrowserCreateAttach([{
        status: 'open',
        target: work,
        revision: 0,
        url: 'about:blank',
        title: 'New Tab',
        text: '',
        focused: false,
        chrome: { kind: 'temporary', partition: 'persist:session-tandem-work' },
        storage: browserProfileStorage(''),
      }], work.profileId, {
        kind: 'browser',
        workspaceId: work.workspaceId,
        browserId: BrowserInstanceId('missing-browser'),
      })
    }).toThrow(BrowserRuntimeError)
    expect(browserProfileStorage('work')).toEqual({
      cookies: 'profile=work',
      localStorage: 'work',
      indexedDb: 'work',
      cache: 'work',
      serviceWorker: 'work',
    })
    expect(browserProfileStorage('')).toEqual({
      cookies: 'profile=',
      localStorage: '',
      indexedDb: '',
      cache: '',
      serviceWorker: '',
    })
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
      chrome: { kind: 'temporary' as const, partition: 'persist:session-tmp-1' },
      storage: {
        cookies: '',
        localStorage: '',
        indexedDb: '',
        cache: '',
        serviceWorker: '',
      },
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
