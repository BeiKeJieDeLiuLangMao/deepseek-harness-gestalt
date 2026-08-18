import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import BrowserRuntimeDeterministic from '@deepseek-ai/dsh-browser-runtime-deterministic'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as ToolBrowser from '@deepseek-ai/dsh-tool-browser'
import * as ToolBrowserInvariant from '../src/invariant.ts'

const signal = new AbortController().signal
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { toolSearch: { maxResultBytes: 65_536, maxResults: 10 } })
  await ctx.plugin(BrowserRuntimeDeterministic, {
    idPrefix: 'tool',
    pages: [{
      url: 'https://example.test/',
      title: 'Example Domain',
      text: 'A deterministic browser page.',
      screenshotPngBase64: PNG_1X1,
    }],
  })
  await ctx.plugin(ToolBrowser)
  return ctx
}

describe('deferred Browser Runtime Consumer', () => {
  it('keeps an eligible deferred tool executable before discovery', async () => {
    const ctx = await harness()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['tool_search'])
    await expect(ctx.tools.execute({
      callId: CallId('guessed-browser-create'),
      name: 'browser_create',
      arguments: {},
      signal,
    })).resolves.toMatchObject({ isError: false, value: { revision: 0 } })
  })

  it('discovers all browser schemas without activating tools and logs complete canonical facts', async () => {
    const ctx = await harness()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['tool_search'])
    expect(ctx.tools.catalogSchemas().map(schema => schema.name)).toEqual([
      'browser_create',
      'browser_navigate',
      'browser_observe',
      'browser_screenshot',
      'browser_focus',
      'browser_close',
    ])

    const discovery = await ctx.tools.execute({
      callId: CallId('search-browser'),
      name: 'tool_search',
      arguments: { query: 'browser', limit: 6 },
      signal,
    })
    expect(discovery.isError).toBe(false)
    if (discovery.isError) throw new Error('expected browser tool discovery to succeed')
    expect(discovery.loadedTools?.map(schema => schema.name).sort()).toEqual([
      'browser_close',
      'browser_create',
      'browser_focus',
      'browser_navigate',
      'browser_observe',
      'browser_screenshot',
    ])
    for (const name of discovery.loadedTools?.map(schema => schema.name) ?? []) {
      expect(ctx.tools.get(name)).not.toHaveProperty('presentCall')
      expect(ctx.tools.get(name)).not.toHaveProperty('presentResult')
    }

    const created = await ctx.tools.execute({
      callId: CallId('browser-create'),
      name: 'browser_create',
      arguments: {},
      signal,
    })
    expect(created).toMatchObject({
      isError: false,
      value: {
        status: 'open',
        target: {
          profileId: 'tool-tmp-1',
          workspaceId: 'tool-tmp-1-workspace',
          browserId: 'tool-tmp-1-browser',
          tabId: 'tool-tmp-1-tab-1',
        },
        chrome: { kind: 'temporary', partition: 'persist:session-tool-tmp-1' },
        revision: 0,
      },
    })
    expect(created.content).toEqual([{
      type: 'text',
      text: JSON.stringify(created.isError ? null : created.value, null, 2),
    }])

    const target = {
      profileId: 'tool-tmp-1',
      workspaceId: 'tool-tmp-1-workspace',
      browserId: 'tool-tmp-1-browser',
      tabId: 'tool-tmp-1-tab-1',
    }
    const navigated = await ctx.tools.execute({
      callId: CallId('browser-navigate'),
      name: 'browser_navigate',
      arguments: { target, expectedRevision: 0, url: 'https://example.test/' },
      signal,
    })
    expect(navigated).toMatchObject({ isError: false, value: { revision: 1, title: 'Example Domain' } })

    const observed = await ctx.tools.execute({
      callId: CallId('browser-observe'),
      name: 'browser_observe',
      arguments: { target },
      signal,
    })
    expect(observed).toMatchObject({ isError: false, value: { revision: 1 } })

    const screenshot = await ctx.tools.execute({
      callId: CallId('browser-screenshot'),
      name: 'browser_screenshot',
      arguments: { target },
      signal,
    })
    expect(screenshot).toMatchObject({ isError: false, value: { mediaType: 'image/png', data: PNG_1X1 } })

    const focused = await ctx.tools.execute({
      callId: CallId('browser-focus'),
      name: 'browser_focus',
      arguments: { target, expectedRevision: 1 },
      signal,
    })
    expect(focused).toMatchObject({ isError: false, value: { revision: 2, focused: true } })

    const closed = await ctx.tools.execute({
      callId: CallId('browser-close'),
      name: 'browser_close',
      arguments: { target, expectedRevision: 2 },
      signal,
    })
    expect(closed).toMatchObject({ isError: false, value: { status: 'closed', revision: 3 } })
  })

  it('rejects invalid Consumer arguments and timeout configuration at their owning boundaries', async () => {
    const ctx = await harness()
    const target = {
      profileId: 'tool-tmp-1',
      workspaceId: 'tool-tmp-1-workspace',
      browserId: 'tool-tmp-1-browser',
      tabId: 'tool-tmp-1-tab-1',
    }
    await ctx.tools.execute({ callId: CallId('create'), name: 'browser_create', arguments: {}, signal })

    const missingName = await ctx.tools.execute({
      callId: CallId('missing-name'),
      name: 'browser_create',
      arguments: { profile: 'persistent' },
      signal,
    })
    expect(missingName).toMatchObject({ isError: true })

    const blankName = await ctx.tools.execute({
      callId: CallId('blank-name'),
      name: 'browser_create',
      arguments: { profile: 'persistent', name: '  ' },
      signal,
    })
    expect(blankName).toMatchObject({ isError: true })

    const named = await ctx.tools.execute({
      callId: CallId('named-create'),
      name: 'browser_create',
      arguments: { profile: 'persistent', name: 'work' },
      signal,
    })
    expect(named).toMatchObject({
      isError: false,
      value: { chrome: { kind: 'persistent', name: 'work' } },
    })

    const emptyIdentity = await ctx.tools.execute({
      callId: CallId('empty-identity'),
      name: 'browser_navigate',
      arguments: { target: { ...target, profileId: '' }, expectedRevision: 0, url: 'https://example.test/' },
      signal,
    })
    expect(emptyIdentity).toMatchObject({ isError: true })

    const emptyUrl = await ctx.tools.execute({
      callId: CallId('empty-url'),
      name: 'browser_navigate',
      arguments: { target, expectedRevision: 0, url: ' ' },
      signal,
    })
    expect(emptyUrl).toMatchObject({ isError: true })

    const negativeRevision = await ctx.tools.execute({
      callId: CallId('negative-revision'),
      name: 'browser_focus',
      arguments: { target, expectedRevision: -1 },
      signal,
    })
    expect(negativeRevision).toMatchObject({ isError: true })

    const unsafeRevision = await ctx.tools.execute({
      callId: CallId('unsafe-revision'),
      name: 'browser_focus',
      arguments: { target, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      signal,
    })
    expect(unsafeRevision).toMatchObject({ isError: true })

    expect(() => { ToolBrowser.apply(new Context(), { timeoutMs: 0 }) }).toThrow(/positive safe integer/)
    expect(() => { ToolBrowser.apply(new Context(), { timeoutMs: 1.5 }) }).toThrow(/positive safe integer/)
  })

  it('fails loud without deferred discovery and rolls back every partial registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { toolSearch: false })
    await ctx.plugin(BrowserRuntimeDeterministic, {
      pages: [{
        url: 'https://example.test/',
        title: 'Example Domain',
        text: 'A deterministic browser page.',
        screenshotPngBase64: PNG_1X1,
      }],
    })

    await expect(ctx.plugin(ToolBrowser)).rejects.toThrow(/sets deferLoading but dsh-tools toolSearch is disabled/)
    expect(ctx.tools.catalogSchemas()).toEqual([])
  })

  it('removes every deferred browser definition when the Consumer fiber disposes', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { toolSearch: { maxResultBytes: 65_536 } })
    await ctx.plugin(BrowserRuntimeDeterministic, {
      pages: [{
        url: 'https://example.test/',
        title: 'Example Domain',
        text: 'A deterministic browser page.',
        screenshotPngBase64: PNG_1X1,
      }],
    })
    const fiber = await ctx.plugin(ToolBrowser)
    expect(ctx.tools.catalogSchemas()).toHaveLength(6)
    await fiber.dispose()
    expect(ctx.tools.catalogSchemas()).toEqual([])
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['tool_search'])
  })

  it('uses the direct-call timeout default and disposes its empty invariant companion', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { toolSearch: { maxResultBytes: 65_536 } })
    await ctx.plugin(BrowserRuntimeDeterministic, {
      pages: [{
        url: 'https://example.test/',
        title: 'Example Domain',
        text: 'A deterministic browser page.',
        screenshotPngBase64: PNG_1X1,
      }],
    })
    ToolBrowser.apply(ctx, {})
    expect(ctx.tools.catalogSchemas()).toHaveLength(6)

    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(ToolBrowserInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})
