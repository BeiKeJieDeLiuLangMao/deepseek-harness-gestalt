import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ElectronBrowserRuntime, { isElectronProcess } from '@deepseek-ai/dsh-browser-runtime-electron'

// Real-runtime check against this process's Electron. Self-skips on Node
// because spawning a second Electron application (including Tandem.app) is
// out of scope; the unit suite covers the same operations through an injected
// Electron host.
const electronAvailable = isElectronProcess()
const REAL_PAGE = 'https://example.com/'
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
})

describe.skipIf(!electronAvailable)('Electron Browser Runtime real-runtime e2e', () => {
  it('drives one real page through in-process Electron webContents', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'dsh-electron-runtime-e2e-'))
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(ElectronBrowserRuntime, {
      idPrefix: 'electron-e2e',
      requestTimeoutMs: 30_000,
    })

    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    expect(created).toMatchObject({
      status: 'open',
      revision: 0,
      chrome: { kind: 'temporary', partition: 'session-electron-e2e-tmp-1' },
    })
    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: REAL_PAGE,
    })
    expect(navigated).toMatchObject({ status: 'open', revision: 1, url: REAL_PAGE })
    expect(typeof navigated.title).toBe('string')
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(navigated)
    const shot = await ctx.browserRuntime.screenshot({ target: created.target })
    expect(shot).toMatchObject({ revision: 1, url: REAL_PAGE, mediaType: 'image/png' })
    expect(shot.data.length).toBeGreaterThan(0)
    const focused = await ctx.browserRuntime.focus({ target: created.target, expectedRevision: 1 })
    expect(focused).toMatchObject({ revision: 2, focused: true, controlOwner: 'agent' })
    const taken = await ctx.browserRuntime.takeover({ target: created.target, expectedRevision: 2 })
    expect(taken).toMatchObject({ revision: 3, controlOwner: 'human', target: created.target })
    const returned = await ctx.browserRuntime.returnControl({
      target: created.target,
      expectedRevision: taken.revision,
    })
    expect(returned).toMatchObject({ revision: 4, controlOwner: 'agent', target: created.target })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: returned.revision })
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 5 })
    await rm(userData, { recursive: true, force: true })
  }, 120_000)
})

describe.skipIf(electronAvailable)('Electron Browser Runtime real-runtime e2e skip', () => {
  it('records the named Node skip reason without spawning Tandem', () => {
    expect(isElectronProcess()).toBe(false)
  })
})
