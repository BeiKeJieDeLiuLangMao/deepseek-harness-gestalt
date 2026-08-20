/** Browser registration and Remote transport adapter for the Browser Dock. */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { BrowserTarget } from '@deepseek-ai/dsh-browser-workspace/client'
import type { BrowserDockActions, BrowserPreviewActions } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { unwrapRemote } from '../src/client/slots.ts'
import { BROWSER_DOCK_WIDTH_RANGE } from '../src/client/model.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { apply as nodeApply } from '../src/index.ts'

const sessionId = 'session-1' as SessionId
const TARGET: BrowserTarget = {
  profileId: 'profile-1' as BrowserTarget['profileId'],
  workspaceId: 'ws-1' as BrowserTarget['workspaceId'],
  browserId: 'br-1' as BrowserTarget['browserId'],
  tabId: 'tab-1' as BrowserTarget['tabId'],
}

async function bench() {
  const ctx = new Context()
  const calls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = []
  const layout = {
    openDetails: [] as unknown[],
    setDetails: [] as number[],
    closeDetails: 0,
  }
  class RemoteService extends Service {
    constructor() { super(ctx, 'remote') }
  }
  new RemoteService()
  const answer = (method: string) => async (...args: unknown[]) => {
    calls.push({ method, args })
    return { ok: true as const, value: { method, args } }
  }
  ctx.provide('remote.browserWorkspace', {
    setDock: answer('setDock'),
    focus: answer('focus'),
    navigate: answer('navigate'),
    observe: answer('observe'),
    screenshot: answer('screenshot'),
    takeover: answer('takeover'),
    returnControl: answer('returnControl'),
    close: answer('close'),
  })
  ctx.provide('layout', {
    openDetails: (range?: unknown) => { layout.openDetails.push(range) },
    setDetails: (px: number) => { layout.setDetails.push(px) },
    closeDetails: () => { layout.closeDetails += 1 },
  })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      details: { kind: 'list', scope: 'session' },
      'conversation.browser.preview': { kind: 'single', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const dock = () => {
    const registered = ctx.slots.entries('details')
      .find(candidate => candidate.options.id === 'browser')
    if (registered === undefined) return undefined
    return {
      ...registered,
      inject: registered.inject as unknown as ((id: SessionId) => BrowserDockActions & {
        openDetails: () => void
        setDetailsWidth: (px: number) => void
        closeDetails: () => void
      }) | undefined,
    }
  }
  const preview = () => {
    const registered = ctx.slots.entries('conversation.browser.preview')[0]
    if (registered === undefined) return undefined
    return {
      ...registered,
      inject: registered.inject as unknown as ((id: SessionId) => BrowserPreviewActions) | undefined,
    }
  }
  return { ctx, calls, layout, dock, preview, fiber }
}

describe('ui-browser browser plugin', () => {
  it('declares and registers the Dock and collapsed preview', async () => {
    const b = await bench()
    expect(inject).toEqual(['slots', 'sessions', 'remote', 'remote.browserWorkspace', 'layout', 'locale'])
    expect(b.dock()?.options).toMatchObject({ id: 'browser', order: 10 })
    expect(b.dock()?.locale).toBe(NS)
    expect(b.preview()?.locale).toBe(NS)
    await b.fiber.dispose()
    expect(b.dock()).toBeUndefined()
    expect(b.preview()).toBeUndefined()
  })

  it('forwards Session-owned Dock verbs through the mounted Remote namespace', async () => {
    const b = await bench()
    const actions = b.dock()?.inject?.(sessionId)
    if (actions === undefined) throw new Error('Browser Dock entry has no injected actions')
    await actions.setDock(true, 720)
    await actions.setDock(false)
    await actions.focus(TARGET, 2)
    await actions.refresh(TARGET, 2, 'https://alpha.test/')
    await actions.observe(TARGET)
    await actions.screenshot(TARGET)
    await actions.takeover(TARGET, 2)
    await actions.returnControl(TARGET, 2)
    await actions.close(TARGET, 2)
    actions.openDetails()
    actions.setDetailsWidth(800)
    actions.closeDetails()
    expect(b.calls).toEqual([
      { method: 'setDock', args: [sessionId, { open: true, width: 720 }] },
      { method: 'setDock', args: [sessionId, { open: false }] },
      { method: 'focus', args: [sessionId, TARGET, 2] },
      { method: 'navigate', args: [sessionId, TARGET, 2, 'https://alpha.test/'] },
      { method: 'observe', args: [sessionId, TARGET] },
      { method: 'screenshot', args: [sessionId, TARGET] },
      { method: 'takeover', args: [sessionId, TARGET, 2] },
      { method: 'returnControl', args: [sessionId, TARGET, 2] },
      { method: 'close', args: [sessionId, TARGET, 2] },
    ])
    expect(b.layout.openDetails).toEqual([BROWSER_DOCK_WIDTH_RANGE])
    expect(b.layout.setDetails).toEqual([800])
    expect(b.layout.closeDetails).toBe(1)
  })

  it('forwards collapsed preview verbs through the same Remote namespace', async () => {
    const b = await bench()
    const actions = b.preview()?.inject?.(sessionId)
    if (actions === undefined) throw new Error('Browser preview entry has no injected actions')
    await actions.openDock()
    await actions.focus(TARGET, 3)
    await actions.observe(TARGET)
    await actions.screenshot(TARGET)
    expect(b.calls).toEqual([
      { method: 'setDock', args: [sessionId, { open: true }] },
      { method: 'focus', args: [sessionId, TARGET, 3] },
      { method: 'observe', args: [sessionId, TARGET] },
      { method: 'screenshot', args: [sessionId, TARGET] },
    ])
  })

  it('registers complete bilingual dictionaries and releases them with the fiber', async () => {
    const b = await bench()
    const translate = b.ctx.locale.bind(NS)
    expect(translate('dock.collapse')).toBe(zh['dock.collapse'])
    b.ctx.locale.setLocale('en')
    expect(translate('dock.return')).toBe(en['dock.return'])
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    await b.fiber.dispose()
    expect(translate('dock.collapse')).not.toBe(en['dock.collapse'])
  })
})

describe('unwrapRemote', () => {
  it('returns the success value and throws the reported failure', async () => {
    await expect(unwrapRemote(Promise.resolve({ ok: true as const, value: 7 }))).resolves.toBe(7)
    await expect(unwrapRemote(Promise.resolve({
      ok: false as const,
      error: { code: 'internal', message: 'stale revision', details: {} },
    }))).rejects.toThrow('stale revision')
  })
})

describe('ui-browser node half', () => {
  it('contributes no Host behavior', () => {
    expect(nodeApply).not.toThrow()
  })
})
