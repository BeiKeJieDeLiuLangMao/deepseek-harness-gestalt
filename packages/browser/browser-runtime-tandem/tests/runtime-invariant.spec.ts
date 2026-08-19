import { createServer } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  BrowserInstanceId,
  BrowserProfileId,
  type BrowserRuntimeState,
  BrowserTabId,
  browserTargetKey,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'
import TandemBrowserRuntime from '@deepseek-ai/dsh-browser-runtime-tandem'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import * as TandemBrowserRuntimeInvariant from '../src/invariant.ts'
import {
  registerTandemRuntimeStateReader,
  registerTandemRuntimeStateValidator,
  TANDEM_RUNTIME_STATE_OWNER,
  tandemRuntimeStateReader,
  tandemRuntimeStateValidator,
  type TandemRuntimeStateOwner,
} from '../src/runtime-state.ts'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/tandem-http-fixture.mjs')
// Fixture children are real Node processes; coverage instrumentation slows their boot.
vi.setConfig({ testTimeout: 30_000 })
const contexts: Context[] = []

const TARGET = Object.freeze({
  profileId: BrowserProfileId('tandem-invariant-profile'),
  workspaceId: BrowserWorkspaceId('tandem-invariant-workspace'),
  browserId: BrowserInstanceId('tandem-invariant-browser'),
  tabId: BrowserTabId('tandem-invariant-tab'),
})

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected TCP test port')
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
  return address.port
}

interface Mount {
  readonly ctx: Context
  readonly fiber: ReturnType<Context['plugin']>
}

async function mountTandem(
  parent: Context,
  idPrefix: string,
  extraEnv: Record<string, string> = {},
  overrides: Record<string, unknown> = {},
  mountSubprocess = true,
): Promise<Mount> {
  if (mountSubprocess) await parent.plugin(SubprocessLocal).await()
  const root = await mkdtemp(join(tmpdir(), `dsh-tandem-invariant-${idPrefix}-`))
  const port = await freePort()
  const tokenFile = join(root, 'api-token')
  const fiber = parent.plugin(TandemBrowserRuntime, {
    command: process.execPath,
    args: [FIXTURE],
    cwd: root,
    env: {
      TANDEM_FIXTURE_PORT: String(port),
      TANDEM_FIXTURE_TOKEN_FILE: tokenFile,
      TANDEM_FIXTURE_FAULTS: '{}',
      ...extraEnv,
    },
    baseUrl: `http://127.0.0.1:${String(port)}`,
    tokenFile,
    idPrefix,
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 2_000,
    healthPollMs: 10,
    reconnectAttempts: 0,
    reconnectDelayMs: 10,
    processGraceMs: 100,
    maxResponseBytes: 1024 * 1024,
    ...overrides,
  })
  await fiber.await()
  return { ctx: fiber.ctx ?? parent, fiber }
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(InvariantRegistry).await()
  await mountTandem(ctx, 'tandem-invariant')
  return ctx
}

async function mountInvariant(ctx: Context): Promise<ReturnType<Context['plugin']>> {
  const fiber = ctx.plugin(TandemBrowserRuntimeInvariant)
  await fiber.await()
  return fiber
}

function ownerOf(ctx: Context): TandemRuntimeStateOwner {
  const owner = (ctx.browserRuntime as typeof ctx.browserRuntime & {
    readonly [TANDEM_RUNTIME_STATE_OWNER]?: TandemRuntimeStateOwner
  })[TANDEM_RUNTIME_STATE_OWNER]
  if (owner === undefined) throw new Error('expected Tandem Browser Runtime owner')
  return owner
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
})

describe('Tandem Browser Runtime invariant lifecycle', () => {
  it('fails load against a different Browser Runtime Provider', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry).await()
    ctx.provide('browserRuntime', {} as never)
    await expect(ctx.plugin(TandemBrowserRuntimeInvariant).await())
      .rejects.toThrow(/requires its own Provider implementation/)

    const missingReader = new Context()
    contexts.push(missingReader)
    await missingReader.plugin(InvariantRegistry).await()
    missingReader.provide('browserRuntime', {
      [TANDEM_RUNTIME_STATE_OWNER]: Object.freeze({}) as TandemRuntimeStateOwner,
    } as never)
    await expect(missingReader.plugin(TandemBrowserRuntimeInvariant).await())
      .rejects.toThrow(/requires its Provider state reader/)
  })

  it('rejects an impossible initial transition before state commit', async () => {
    const ctx = await setup()
    await mountInvariant(ctx)
    const validate = tandemRuntimeStateValidator(ownerOf(ctx))
    if (validate === undefined) throw new Error('expected Tandem Browser Runtime validator')
    expect(() => { validate({ status: 'closed', target: TARGET, revision: 0 }) })
      .toThrow(/must begin with an open revision 0 state/)
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).resolves.toMatchObject({ revision: 0 })
  })

  it('seeds and reloads its pre-commit validator from authoritative live state', async () => {
    const ctx = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const firstInvariant = await mountInvariant(ctx)
    const firstValidate = tandemRuntimeStateValidator(ownerOf(ctx))
    if (firstValidate === undefined) throw new Error('expected Tandem Browser Runtime validator')
    expect(() => { firstValidate({ status: 'closed', target: created.target, revision: 2 }) })
      .toThrow(/revision 2 must follow 0/)

    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
    })
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(navigated)

    await firstInvariant.dispose()
    await mountInvariant(ctx)
    const reloadedValidate = tandemRuntimeStateValidator(ownerOf(ctx))
    if (reloadedValidate === undefined) throw new Error('expected reloaded Tandem Browser Runtime validator')
    expect(() => { reloadedValidate({ status: 'closed', target: created.target, revision: 3 }) })
      .toThrow(/revision 3 must follow 1/)
    const focused = await ctx.browserRuntime.focus({
      target: created.target,
      expectedRevision: navigated.revision,
    })
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(focused)
  })

  it('rejects identity, revision, and terminal-to-open discontinuities before commit', async () => {
    const wrongIdentity = await setup()
    await mountInvariant(wrongIdentity)
    const first = await wrongIdentity.browserRuntime.create({ profile: 'temporary' })
    const validateIdentity = tandemRuntimeStateValidator(ownerOf(wrongIdentity))
    if (validateIdentity === undefined) throw new Error('expected Tandem Browser Runtime validator')
    expect(() => {
      validateIdentity({
        ...first,
        target: { ...first.target, tabId: BrowserTabId('different-tab') },
        revision: 1,
      })
    }).toThrow(/must begin with an open revision 0 state/)

    const skippedRevision = await setup()
    await mountInvariant(skippedRevision)
    const revisionZero = await skippedRevision.browserRuntime.create({ profile: 'temporary' })
    const validateRevision = tandemRuntimeStateValidator(ownerOf(skippedRevision))
    if (validateRevision === undefined) throw new Error('expected Tandem Browser Runtime validator')
    expect(() => { validateRevision({ status: 'closed', target: revisionZero.target, revision: 2 }) })
      .toThrow(/revision 2 must follow 0/)

    const terminal = await setup()
    const terminalOpen = await terminal.browserRuntime.create({ profile: 'temporary' })
    await terminal.browserRuntime.close({ target: terminalOpen.target, expectedRevision: terminalOpen.revision })
    await mountInvariant(terminal)
    const validateTerminal = tandemRuntimeStateValidator(ownerOf(terminal))
    if (validateTerminal === undefined) throw new Error('expected Tandem Browser Runtime validator')
    expect(() => { validateTerminal(terminalOpen) })
      .toThrow(/terminal state cannot reopen/)
  })

  it('leaves authoritative state unchanged when a pre-commit validator rejects', async () => {
    const ctx = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const disposeValidator = registerTandemRuntimeStateValidator(ownerOf(ctx), () => {
      throw new InvariantError(
        '@deepseek-ai/dsh-browser-runtime-tandem',
        'forced pre-commit rejection',
      )
    })

    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'INVARIANT' })
    expect(tandemRuntimeStateReader(ownerOf(ctx))?.().get(browserTargetKey(created.target)))
      .toMatchObject({ status: 'open', target: created.target, revision: created.revision })
    disposeValidator()
    await expect(ctx.browserRuntime.observe({ target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target, revision: 1 })
  })

  it('keeps an unavailable projection when the restored commit fails validation', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry).await()
    const root = await mkdtemp(join(tmpdir(), 'dsh-tandem-invariant-recovery-'))
    await mountTandem(ctx, 'tandem-invariant', { TANDEM_FIXTURE_CRASH_MARKER: join(root, 'crash-marker') }, {
      reconnectAttempts: 1,
    })
    const disposeValidator = registerTandemRuntimeStateValidator(ownerOf(ctx), (state) => {
      if (state.status === 'open' && state.revision === 3) throw new Error('forced recovery rejection')
      return undefined
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://crash.test/',
    })

    const deadline = Date.now() + 5_000
    let state = await ctx.browserRuntime.observe({ target: created.target })
    while (state.status === 'open' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      state = await ctx.browserRuntime.observe({ target: created.target })
    }
    expect(state).toMatchObject({
      status: 'unavailable',
      reason: 'reconnect-failed',
      revision: 3,
      reconnecting: false,
    })
    disposeValidator()
  })

  it('logs a rejected reconnect transaction without losing the unavailable projection', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry).await()
    const root = await mkdtemp(join(tmpdir(), 'dsh-tandem-invariant-reject-'))
    await mountTandem(ctx, 'tandem-invariant', { TANDEM_FIXTURE_CRASH_MARKER: join(root, 'crash-marker') }, {
      reconnectAttempts: 1,
    })
    const disposeValidator = registerTandemRuntimeStateValidator(ownerOf(ctx), (state) => {
      if (state.status === 'unavailable' && state.revision === 3) throw new Error('forced exhaustion rejection')
      return undefined
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://die.test/',
    })
    const deadline = Date.now() + 5_000
    let state = await ctx.browserRuntime.observe({ target: created.target })
    while (state.status === 'open' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      state = await ctx.browserRuntime.observe({ target: created.target })
    }
    // The exhaustion commit itself fails validation, so the projected
    // unavailable revision 2 remains authoritative.
    expect(state).toMatchObject({ status: 'unavailable', revision: 2, reconnecting: true })
    disposeValidator()
  })

  it('scopes readers to isolated Provider owners and tears down only the disposed Provider', async () => {
    const root = new Context()
    contexts.push(root)
    await root.plugin(InvariantRegistry).await()
    await root.plugin(SubprocessLocal).await()
    const left = root.isolate('browserRuntime')
    const right = root.isolate('browserRuntime')
    const leftMount = await mountTandem(left, 'left', {}, {}, false)
    const rightMount = await mountTandem(right, 'right', {}, {}, false)
    const leftOwner = ownerOf(leftMount.ctx)
    const rightOwner = ownerOf(rightMount.ctx)
    expect(leftOwner).not.toBe(rightOwner)

    const leftState = await leftMount.ctx.browserRuntime.create({ profile: 'temporary' })
    const rightState = await rightMount.ctx.browserRuntime.create({ profile: 'temporary' })
    expect(tandemRuntimeStateReader(leftOwner)?.().get(browserTargetKey(leftState.target))).toEqual(leftState)
    expect(tandemRuntimeStateReader(rightOwner)?.().get(browserTargetKey(rightState.target))).toEqual(rightState)

    await leftMount.fiber.dispose()
    expect(tandemRuntimeStateReader(leftOwner)).toBeUndefined()
    expect(tandemRuntimeStateReader(rightOwner)?.().get(browserTargetKey(rightState.target))).toEqual(rightState)
    await rightMount.fiber.dispose()
  })

  it('uses registration identity for replacement disposal and rejects missing or duplicate owners', () => {
    const owner = Object.freeze({}) as TandemRuntimeStateOwner
    const otherOwner = Object.freeze({}) as TandemRuntimeStateOwner
    const replacementState = { status: 'closed', target: TARGET, revision: 1 } satisfies BrowserRuntimeState
    const initialStates = new Map<string, BrowserRuntimeState>()
    const replacementStates = new Map([[browserTargetKey(replacementState.target), replacementState]])
    const disposeInitial = registerTandemRuntimeStateReader(owner, () => initialStates)
    const disposeOther = registerTandemRuntimeStateReader(otherOwner, () => replacementStates)
    expect(() => registerTandemRuntimeStateReader(owner, () => replacementStates)).toThrow(/already registered/)

    disposeInitial()
    const disposeReplacement = registerTandemRuntimeStateReader(owner, () => replacementStates)
    disposeInitial()
    expect(tandemRuntimeStateReader(owner)?.()).toEqual(replacementStates)
    expect(tandemRuntimeStateReader(otherOwner)?.()).toEqual(replacementStates)

    const validate = (): undefined => undefined
    expect(() => registerTandemRuntimeStateValidator(Object.freeze({}) as TandemRuntimeStateOwner, validate))
      .toThrow(/has no state reader/)
    const disposeValidator = registerTandemRuntimeStateValidator(owner, validate)
    expect(() => registerTandemRuntimeStateValidator(owner, validate)).toThrow(/already registered/)
    disposeValidator()
    const replacementValidator = (): undefined => undefined
    const disposeReplacementValidator = registerTandemRuntimeStateValidator(owner, replacementValidator)
    disposeValidator()
    expect(tandemRuntimeStateValidator(owner)).toBe(replacementValidator)

    disposeReplacementValidator()
    disposeReplacement()
    disposeOther()
  })
})
