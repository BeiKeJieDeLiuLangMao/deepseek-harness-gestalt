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
import * as BrowserRuntimeDeterministicInvariant from '../src/invariant.ts'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PAGE = { url: 'https://one.test/', title: 'One', text: 'one', screenshotPngBase64: PNG_1X1 }

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry).await()
  await ctx.plugin(BrowserRuntimeDeterministic, { pages: [PAGE] }).await()
  return ctx
}

async function mountInvariant(ctx: Context): Promise<ReturnType<Context['plugin']>> {
  const fiber = ctx.plugin(BrowserRuntimeDeterministicInvariant)
  await fiber.await()
  return fiber
}

describe('deterministic Browser Runtime invariant lifecycle', () => {
  it('fails load against a different Browser Runtime Provider', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry).await()
    ctx.provide('browserRuntime', {} as never)
    await expect(ctx.plugin(BrowserRuntimeDeterministicInvariant).await())
      .rejects.toThrow(/requires its own Provider implementation/)
  })

  it('rejects an impossible initial publication', async () => {
    const ctx = await setup()
    await mountInvariant(ctx)
    const target = {
      profileId: BrowserProfileId('initial-profile'),
      workspaceId: BrowserWorkspaceId('initial-workspace'),
      browserId: BrowserInstanceId('initial-browser'),
      tabId: BrowserTabId('initial-tab'),
    }

    expect(() => { ctx.emit('browser/runtime-state', { status: 'closed', target, revision: 0 }) })
      .toThrow(/must begin with an open revision 0 state/)
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).resolves.toMatchObject({ revision: 0 })
  })

  it('seeds and reloads from authoritative live state', async () => {
    const ctx = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const firstInvariant = await mountInvariant(ctx)
    expect(() => { ctx.emit('browser/runtime-state', { ...created, revision: 2 }) })
      .toThrow(/revision 2 must follow 0/)

    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: PAGE.url,
    })
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(navigated)

    await firstInvariant.dispose()
    await mountInvariant(ctx)
    expect(() => { ctx.emit('browser/runtime-state', { ...navigated, revision: 3 }) })
      .toThrow(/revision 3 must follow 1/)
    const focused = await ctx.browserRuntime.focus({
      target: created.target,
      expectedRevision: navigated.revision,
    })
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(focused)
  })

  it('rejects identity, revision, and terminal-to-open discontinuities', async () => {
    const wrongIdentity = await setup()
    await mountInvariant(wrongIdentity)
    const first = await wrongIdentity.browserRuntime.create({ profile: 'temporary' })
    expect(() => {
      wrongIdentity.emit('browser/runtime-state', {
        ...first,
        target: { ...first.target, tabId: BrowserTabId('different-tab') },
        revision: 1,
      })
    }).toThrow(/changed an opaque target identity/)

    const skippedRevision = await setup()
    await mountInvariant(skippedRevision)
    const revisionZero = await skippedRevision.browserRuntime.create({ profile: 'temporary' })
    expect(() => { skippedRevision.emit('browser/runtime-state', { ...revisionZero, revision: 2 }) })
      .toThrow(/revision 2 must follow 0/)

    const terminal = await setup()
    const terminalOpen = await terminal.browserRuntime.create({ profile: 'temporary' })
    await terminal.browserRuntime.close({ target: terminalOpen.target, expectedRevision: terminalOpen.revision })
    await mountInvariant(terminal)
    expect(() => { terminal.emit('browser/runtime-state', terminalOpen) })
      .toThrow(/terminal state cannot reopen/)
  })
})
