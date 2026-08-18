import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserTabId,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'
import BrowserRuntimeDeterministic from '@deepseek-ai/dsh-browser-runtime-deterministic'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as BrowserRuntimeInvariant from '../../browser-runtime/src/invariant.ts'
import * as BrowserRuntimeDeterministicInvariant from '../src/invariant.ts'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('deterministic Browser Runtime public lifecycle', () => {
  it('runs one temporary Profile and tab through create, navigate, observe, screenshot, focus, and close', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'trace',
      pages: [{
        url: 'https://example.test/',
        title: 'Example Domain',
        text: 'A deterministic browser page.',
        screenshotPngBase64: PNG_1X1,
      }],
    })

    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    expect(created).toEqual({
      status: 'open',
      target: {
        profileId: 'trace-profile',
        workspaceId: 'trace-workspace',
        browserId: 'trace-browser',
        tabId: 'trace-tab',
      },
      revision: 0,
      url: 'about:blank',
      title: 'New Tab',
      text: '',
      focused: false,
    })

    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
    })
    expect(navigated).toMatchObject({
      revision: 1,
      url: 'https://example.test/',
      title: 'Example Domain',
      text: 'A deterministic browser page.',
      focused: false,
    })
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toEqual(navigated)
    await expect(ctx.browserRuntime.screenshot({ target: created.target })).resolves.toEqual({
      target: created.target,
      revision: 1,
      url: 'https://example.test/',
      title: 'Example Domain',
      mediaType: 'image/png',
      data: PNG_1X1,
    })

    const focused = await ctx.browserRuntime.focus({
      target: created.target,
      expectedRevision: navigated.revision,
    })
    expect(focused).toMatchObject({ revision: 2, focused: true })

    await expect(ctx.browserRuntime.close({
      target: created.target,
      expectedRevision: focused.revision,
    })).resolves.toEqual({
      status: 'closed',
      target: created.target,
      revision: 3,
    })
  })

  it('serializes concurrent mutations and rejects the stale revision without changing committed state', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'serial',
      pages: [
        { url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 },
        { url: 'https://two.test/', title: 'Two', text: 'two', screenshotPngBase64: PNG_1X1 },
      ],
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const results = await Promise.allSettled([
      ctx.browserRuntime.navigate({ target: created.target, expectedRevision: 0, url: 'https://one.test/' }),
      ctx.browserRuntime.navigate({ target: created.target, expectedRevision: 0, url: 'https://two.test/' }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({
      code: 'BROWSER_REVISION_CONFLICT',
    })
    const state = await ctx.browserRuntime.observe({ target: created.target })
    expect(state).toMatchObject({ status: 'open', revision: 1, url: 'https://one.test/' })
  })

  it('enforces one open Profile, permits reuse after close, and rejects malformed config at load', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'capacity',
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).rejects.toMatchObject({
      code: 'BROWSER_CAPACITY',
    })
    await ctx.browserRuntime.close({ target: created.target, expectedRevision: 0 })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).resolves.toMatchObject({ revision: 0 })

    const empty = new Context()
    await expect(empty.plugin(BrowserRuntimeDeterministic, { pages: [] })).rejects.toThrow(/at least one page/)
    const duplicate = new Context()
    await expect(duplicate.plugin(BrowserRuntimeDeterministic, {
      pages: [
        { url: 'https://same.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 },
        { url: 'https://same.test/', title: 'Two', text: 'two', screenshotPngBase64: PNG_1X1 },
      ],
    })).rejects.toThrow(/duplicate page URL/)
    const malformed = new Context()
    await expect(malformed.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://bad.test/', title: 'Bad', text: 'bad', screenshotPngBase64: 'not base64!' }],
    })).rejects.toThrow(/must be base64 data/)
  })

  it('closes the temporary Profile to quiescence and removes the service on Provider disposal', async () => {
    const ctx = new Context()
    const states: string[] = []
    ctx.on('browser/runtime-state', (state) => { states.push(`${state.status}:${String(state.revision)}`) })
    const fiber = await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'dispose',
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    const runtime = ctx.browserRuntime
    await runtime.create({ profile: 'temporary' })
    await fiber.dispose()

    expect(states).toEqual(['open:0', 'closed:1'])
    expect(ctx.get('browserRuntime')).toBeUndefined()
    await expect(runtime.create({ profile: 'temporary' })).rejects.toMatchObject({ code: 'BROWSER_DISPOSED' })
  })

  it('rejects aborted, missing, closed, and unconfigured operations without changing state', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'failure',
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    const missing = {
      profileId: BrowserProfileId('missing-profile'),
      workspaceId: BrowserWorkspaceId('missing-workspace'),
      browserId: BrowserInstanceId('missing-browser'),
      tabId: BrowserTabId('missing-tab'),
    }
    await expect(ctx.browserRuntime.observe({ target: missing })).rejects.toMatchObject({ code: 'BROWSER_NOT_FOUND' })

    const aborted = new AbortController()
    aborted.abort('cancelled')
    await expect(ctx.browserRuntime.create({ profile: 'temporary', signal: aborted.signal }))
      .rejects.toMatchObject({ code: 'BROWSER_ABORTED' })

    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await expect(ctx.browserRuntime.observe({ target: missing })).rejects.toMatchObject({ code: 'BROWSER_NOT_FOUND' })
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://unknown.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_UNKNOWN_URL' })
    await expect(ctx.browserRuntime.screenshot({ target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_UNKNOWN_URL' })

    const queuedAbort = new AbortController()
    const queued = ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://one.test/',
      signal: queuedAbort.signal,
    })
    queuedAbort.abort('queued cancellation')
    await expect(queued).rejects.toMatchObject({ code: 'BROWSER_ABORTED' })

    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: 0 })
    await expect(ctx.browserRuntime.focus({ target: created.target, expectedRevision: closed.revision }))
      .rejects.toMatchObject({ code: 'BROWSER_NOT_OPEN' })
    await fiber.dispose()
  })

  it('rejects an impossible lifecycle publication through the package invariant negative control', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'invariant',
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    await ctx.plugin(BrowserRuntimeDeterministicInvariant)
    const target = {
      profileId: BrowserProfileId('wrong-profile'),
      workspaceId: BrowserWorkspaceId('wrong-workspace'),
      browserId: BrowserInstanceId('wrong-browser'),
      tabId: BrowserTabId('wrong-tab'),
    }

    expect(() => {
      ctx.emit('browser/runtime-state', {
        status: 'open',
        target,
        revision: 2,
        url: 'about:blank',
        title: 'New Tab',
        text: '',
        focused: false,
      })
    }).toThrow(/invariant violated by "@deepseek-ai\/dsh-browser-runtime-deterministic"/)
  })

  it('accepts the real lifecycle and rejects identity and revision discontinuities', async () => {
    const valid = new Context()
    await valid.plugin(InvariantRegistry)
    await valid.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    await valid.plugin(BrowserRuntimeDeterministicInvariant)
    const created = await valid.browserRuntime.create({ profile: 'temporary' })
    const navigated = await valid.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://one.test/',
    })
    await valid.browserRuntime.close({ target: created.target, expectedRevision: navigated.revision })
    await expect(valid.browserRuntime.create({ profile: 'temporary' })).resolves.toMatchObject({ revision: 0 })

    const wrongIdentity = new Context()
    await wrongIdentity.plugin(InvariantRegistry)
    await wrongIdentity.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    await wrongIdentity.plugin(BrowserRuntimeDeterministicInvariant)
    const first = await wrongIdentity.browserRuntime.create({ profile: 'temporary' })
    expect(() => {
      wrongIdentity.emit('browser/runtime-state', {
        ...first,
        target: { ...first.target, tabId: BrowserTabId('different-tab') },
        revision: 1,
      })
    }).toThrow(/changed an opaque target identity/)

    const skippedRevision = new Context()
    await skippedRevision.plugin(InvariantRegistry)
    await skippedRevision.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    await skippedRevision.plugin(BrowserRuntimeDeterministicInvariant)
    const revisionZero = await skippedRevision.browserRuntime.create({ profile: 'temporary' })
    expect(() => {
      skippedRevision.emit('browser/runtime-state', { ...revisionZero, revision: 2 })
    })
      .toThrow(/revision 2 must follow 0/)
  })

  it('registers and disposes the type-only Service Definition invariant companion', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(BrowserRuntimeInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})
