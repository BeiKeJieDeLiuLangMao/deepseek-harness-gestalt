import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  BrowserInstanceId,
  BrowserProfileId,
  type BrowserRuntimeState,
  BrowserTabId,
  browserTargetKey,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'
import ElectronBrowserRuntime from '@deepseek-ai/dsh-browser-runtime-electron'
import { installElectronTestHost } from '@deepseek-ai/dsh-browser-runtime-electron/testing'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import * as ElectronBrowserRuntimeInvariant from '../src/invariant.ts'
import {
  ELECTRON_RUNTIME_STATE_OWNER,
  electronRuntimeStateReader,
  electronRuntimeStateValidator,
  registerElectronRuntimeStateReader,
  registerElectronRuntimeStateValidator,
  type ElectronRuntimeStateOwner,
} from '../src/runtime-state.ts'
import { FakeElectronHost } from './fake-electron.ts'

const contexts: Context[] = []

const TARGET = Object.freeze({
  profileId: BrowserProfileId('electron-invariant-profile'),
  workspaceId: BrowserWorkspaceId('electron-invariant-workspace'),
  browserId: BrowserInstanceId('electron-invariant-browser'),
  tabId: BrowserTabId('electron-invariant-tab'),
})

async function setup(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(InvariantRegistry).await()
  installElectronTestHost(new FakeElectronHost())
  await ctx.plugin(ElectronBrowserRuntime, {
    idPrefix: 'electron-invariant',
  }).await()
  return ctx
}

async function mountInvariant(ctx: Context): Promise<ReturnType<Context['plugin']>> {
  const fiber = ctx.plugin(ElectronBrowserRuntimeInvariant)
  await fiber.await()
  return fiber
}

function ownerOf(ctx: Context): ElectronRuntimeStateOwner {
  const owner = (ctx.browserRuntime as typeof ctx.browserRuntime & {
    readonly [ELECTRON_RUNTIME_STATE_OWNER]?: ElectronRuntimeStateOwner
  })[ELECTRON_RUNTIME_STATE_OWNER]
  if (owner === undefined) throw new Error('expected Electron Browser Runtime owner')
  return owner
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
  installElectronTestHost(undefined)
})

describe('Electron Browser Runtime invariant lifecycle', () => {
  it('fails load against a different Browser Runtime Provider', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(InvariantRegistry).await()
    ctx.provide('browserRuntime', {} as never)
    await expect(ctx.plugin(ElectronBrowserRuntimeInvariant).await())
      .rejects.toThrow(/requires its own Provider implementation/)

    const missingReader = new Context()
    contexts.push(missingReader)
    await missingReader.plugin(InvariantRegistry).await()
    missingReader.provide('browserRuntime', {
      [ELECTRON_RUNTIME_STATE_OWNER]: Object.freeze({}) as ElectronRuntimeStateOwner,
    } as never)
    await expect(missingReader.plugin(ElectronBrowserRuntimeInvariant).await())
      .rejects.toThrow(/requires its Provider state reader/)
  })

  it('rejects an impossible initial transition before state commit', async () => {
    const ctx = await setup()
    await mountInvariant(ctx)
    const validate = electronRuntimeStateValidator(ownerOf(ctx))
    if (validate === undefined) throw new Error('expected Electron Browser Runtime validator')
    expect(() => { validate({ status: 'closed', target: TARGET, revision: 0 }) })
      .toThrow(/must begin with an open revision 0 state/)
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).resolves.toMatchObject({ revision: 0 })
  })

  it('seeds and reloads its pre-commit validator from authoritative live state', async () => {
    const ctx = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const firstInvariant = await mountInvariant(ctx)
    const firstValidate = electronRuntimeStateValidator(ownerOf(ctx))
    if (firstValidate === undefined) throw new Error('expected Electron Browser Runtime validator')
    expect(() => { firstValidate({ ...created, revision: 2 }) })
      .toThrow(/revision 2 must follow 0/)

    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
    })
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(navigated)

    await firstInvariant.dispose()
    await mountInvariant(ctx)
    const reloadedValidate = electronRuntimeStateValidator(ownerOf(ctx))
    if (reloadedValidate === undefined) throw new Error('expected reloaded Electron Browser Runtime validator')
    expect(() => { reloadedValidate({ ...navigated, revision: 3 }) })
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
    const validateIdentity = electronRuntimeStateValidator(ownerOf(wrongIdentity))
    if (validateIdentity === undefined) throw new Error('expected Electron Browser Runtime validator')
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
    const validateRevision = electronRuntimeStateValidator(ownerOf(skippedRevision))
    if (validateRevision === undefined) throw new Error('expected Electron Browser Runtime validator')
    expect(() => { validateRevision({ ...revisionZero, revision: 2 }) })
      .toThrow(/revision 2 must follow 0/)

    const terminal = await setup()
    const terminalOpen = await terminal.browserRuntime.create({ profile: 'temporary' })
    await terminal.browserRuntime.close({ target: terminalOpen.target, expectedRevision: terminalOpen.revision })
    await mountInvariant(terminal)
    const validateTerminal = electronRuntimeStateValidator(ownerOf(terminal))
    if (validateTerminal === undefined) throw new Error('expected Electron Browser Runtime validator')
    expect(() => { validateTerminal(terminalOpen) })
      .toThrow(/terminal state cannot reopen/)
  })

  it('leaves authoritative state unchanged when a pre-commit validator rejects', async () => {
    const ctx = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const disposeValidator = registerElectronRuntimeStateValidator(ownerOf(ctx), () => {
      throw new InvariantError(
        '@deepseek-ai/dsh-browser-runtime-electron',
        'forced pre-commit rejection',
      )
    })

    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'INVARIANT' })
    await expect(ctx.browserRuntime.observe({ target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target, revision: created.revision })
    disposeValidator()
  })

  it('scopes readers to isolated Provider owners and tears down only the disposed Provider', async () => {
    const root = new Context()
    contexts.push(root)
    await root.plugin(InvariantRegistry).await()
    const left = root.isolate('browserRuntime')
    const right = root.isolate('browserRuntime')
    installElectronTestHost(new FakeElectronHost())
    const leftFiber = await left.plugin(ElectronBrowserRuntime, {
      idPrefix: 'left',
    })
    const rightFiber = await right.plugin(ElectronBrowserRuntime, {
      idPrefix: 'right',
    })
    const leftOwner = ownerOf(left)
    const rightOwner = ownerOf(right)
    expect(leftOwner).not.toBe(rightOwner)

    const leftState = await left.browserRuntime.create({ profile: 'temporary' })
    const rightState = await right.browserRuntime.create({ profile: 'temporary' })
    expect(electronRuntimeStateReader(leftOwner)?.().get(browserTargetKey(leftState.target))).toEqual(leftState)
    expect(electronRuntimeStateReader(rightOwner)?.().get(browserTargetKey(rightState.target))).toEqual(rightState)

    await leftFiber.dispose()
    expect(electronRuntimeStateReader(leftOwner)).toBeUndefined()
    expect(electronRuntimeStateReader(rightOwner)?.().get(browserTargetKey(rightState.target))).toEqual(rightState)
    await rightFiber.dispose()
  })

  it('uses registration identity for replacement disposal and rejects missing or duplicate owners', () => {
    const owner = Object.freeze({}) as ElectronRuntimeStateOwner
    const otherOwner = Object.freeze({}) as ElectronRuntimeStateOwner
    const replacementState = { status: 'closed', target: TARGET, revision: 1 } satisfies BrowserRuntimeState
    const initialStates = new Map<string, BrowserRuntimeState>()
    const replacementStates = new Map([[browserTargetKey(replacementState.target), replacementState]])
    const disposeInitial = registerElectronRuntimeStateReader(owner, () => initialStates)
    const disposeOther = registerElectronRuntimeStateReader(otherOwner, () => replacementStates)
    expect(() => registerElectronRuntimeStateReader(owner, () => replacementStates)).toThrow(/already registered/)

    disposeInitial()
    const disposeReplacement = registerElectronRuntimeStateReader(owner, () => replacementStates)
    disposeInitial()
    expect(electronRuntimeStateReader(owner)?.()).toEqual(replacementStates)
    expect(electronRuntimeStateReader(otherOwner)?.()).toEqual(replacementStates)

    const validate = (): undefined => undefined
    expect(() => registerElectronRuntimeStateValidator(Object.freeze({}) as ElectronRuntimeStateOwner, validate))
      .toThrow(/has no state reader/)
    const disposeValidator = registerElectronRuntimeStateValidator(owner, validate)
    expect(() => registerElectronRuntimeStateValidator(owner, validate)).toThrow(/already registered/)
    disposeValidator()
    const replacementValidator = (): undefined => undefined
    const disposeReplacementValidator = registerElectronRuntimeStateValidator(owner, replacementValidator)
    disposeValidator()
    expect(electronRuntimeStateValidator(owner)).toBe(replacementValidator)

    disposeReplacementValidator()
    disposeReplacement()
    disposeOther()
  })
})
