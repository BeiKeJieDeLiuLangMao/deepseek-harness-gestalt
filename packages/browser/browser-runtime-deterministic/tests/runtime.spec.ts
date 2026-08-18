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

  it('admits one temporary Profile for the Provider lifetime and rejects reuse after close', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntimeDeterministic, {
      idPrefix: 'capacity',
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).rejects.toMatchObject({
      code: 'BROWSER_CAPACITY',
    })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: 0 })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).rejects.toMatchObject({
      code: 'BROWSER_CAPACITY',
      message: 'the deterministic browser runtime has already created its temporary Profile',
    })
    await expect(ctx.browserRuntime.focus({ target: created.target, expectedRevision: closed.revision }))
      .rejects.toMatchObject({ code: 'BROWSER_NOT_OPEN' })
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toEqual(closed)
  })

  it('rejects malformed screenshot configuration at load', async () => {
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
    })).rejects.toThrow(/canonical base64 data/)

    const nonCanonical = new Context()
    let nonCanonicalError: unknown
    try {
      await nonCanonical.plugin(BrowserRuntimeDeterministic, {
        pages: [{ url: 'https://short.test/', title: 'Short', text: 'short', screenshotPngBase64: 'A' }],
      })
    } catch (error) {
      nonCanonicalError = error
    }
    expect(nonCanonicalError).toBeInstanceOf(Error)
    if (!(nonCanonicalError instanceof Error)) throw new Error('expected screenshot validation to fail')
    expect(nonCanonicalError.message).toMatch(/canonical base64/)

    const nonCanonicalPaddingBits = new Context()
    await expect(nonCanonicalPaddingBits.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://padding.test/', title: 'Padding', text: 'padding', screenshotPngBase64: 'AB==' }],
    })).rejects.toThrow(/canonical base64/)

    const emptyScreenshot = new Context()
    await expect(emptyScreenshot.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://empty.test/', title: 'Empty', text: 'empty', screenshotPngBase64: '' }],
    })).rejects.toThrow()

    const wrongSignature = new Context()
    let wrongSignatureError: unknown
    try {
      await wrongSignature.plugin(BrowserRuntimeDeterministic, {
        pages: [{ url: 'https://text.test/', title: 'Text', text: 'text', screenshotPngBase64: 'SGVsbG8=' }],
      })
    } catch (error) {
      wrongSignatureError = error
    }
    expect(wrongSignatureError).toBeInstanceOf(Error)
    if (!(wrongSignatureError instanceof Error)) throw new Error('expected screenshot validation to fail')
    expect(wrongSignatureError.message).toMatch(/PNG data/)
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

  it('contains post-commit observer failures without starving later observers', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntimeDeterministic, {
      pages: [{ url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }],
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const observed: number[] = []
    ctx.on('browser/runtime-state', () => { throw new Error('ordinary observer failed') })
    // oxlint-disable-next-line typescript/no-misused-promises -- this listener exercises rejected post-commit observation
    ctx.on('browser/runtime-state', async () => { throw new Error('async observer failed') })
    ctx.on('browser/runtime-state', (state) => { observed.push(state.revision) })

    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://one.test/',
    })
    expect(navigated.revision).toBe(1)
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(navigated)
    expect(observed).toEqual([1])
    await Promise.resolve()
  })

  it('registers and disposes the type-only Service Definition invariant companion', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(BrowserRuntimeInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})
