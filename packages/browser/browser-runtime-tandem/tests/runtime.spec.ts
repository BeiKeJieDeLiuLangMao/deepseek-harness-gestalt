import { createServer } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TandemBrowserRuntime from '@deepseek-ai/dsh-browser-runtime-tandem'
import { BrowserRuntimeError } from '@deepseek-ai/dsh-browser-runtime'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/tandem-http-fixture.mjs')
// Fixture children are real Node processes; coverage instrumentation slows their boot.
vi.setConfig({ testTimeout: 30_000 })
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const contexts: Context[] = []

interface Harness {
  readonly ctx: Context
  readonly root: string
  readonly tokenFile: string
  readonly pidFile: string
  readonly crashMarker: string
}

/** Private seams reachable only from this package's own behavioral tests. */
interface RuntimeInternals {
  tandemTabId: string | undefined
  closing: boolean
  recoveryScheduled: boolean
  disposed: boolean
  state: unknown
  ctx: Context
  process: unknown
  page(state: never, signal: AbortSignal | undefined): Promise<unknown>
  processExited(handle: unknown, detail: string): void
  scheduleRecovery(reason: 'crashed' | 'unhealthy', projectNow: boolean): unknown
  reconnect(lastOpen: never, unavailable: never): Promise<void>
  readTab(tabId: string, signal: AbortSignal | undefined): Promise<unknown>
}

function runtimeOf(ctx: Context): RuntimeInternals {
  return ctx.browserRuntime as unknown as RuntimeInternals
}

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

async function setup(faults: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tandem-provider-'))
  const port = await freePort()
  const tokenFile = join(root, 'api-token')
  const pidFile = join(root, 'fixture.pid')
  const crashMarker = join(root, 'crash-marker')
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SubprocessLocal)
  await ctx.plugin(TandemBrowserRuntime, {
    command: process.execPath,
    args: [FIXTURE],
    cwd: root,
    env: {
      TANDEM_FIXTURE_PORT: String(port),
      TANDEM_FIXTURE_TOKEN_FILE: tokenFile,
      TANDEM_FIXTURE_CRASH_MARKER: crashMarker,
      TANDEM_FIXTURE_PID_FILE: pidFile,
      TANDEM_FIXTURE_FAULTS: JSON.stringify(faults),
    },
    baseUrl: `http://127.0.0.1:${String(port)}`,
    tokenFile,
    idPrefix: 'tandem-test',
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 2_000,
    healthPollMs: 10,
    reconnectAttempts: 1,
    reconnectDelayMs: 10,
    processGraceMs: 100,
    maxResponseBytes: 1024 * 1024,
    ...overrides,
  })
  return { ctx, root, tokenFile, pidFile, crashMarker }
}

/** Poll until the recorded fixture child pid is no longer schedulable. */
async function assertJoined(pidFile: string): Promise<void> {
  let pid = 0
  const appear = Date.now() + 3_000
  while (Date.now() < appear) {
    try {
      pid = Number((await readFile(pidFile, 'utf8')).trim())
      break
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  if (pid === 0) throw new Error('fixture child never recorded its pid')
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`fixture child ${String(pid)} did not exit`)
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
})

describe('Tandem Browser Runtime configuration', () => {
  it('rejects invalid Config values at load', async () => {
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['empty command', { command: '' }, /command must be non-empty/],
      ['blank cwd', { cwd: ' ' }, /cwd must be non-empty/],
      ['empty tokenFile', { tokenFile: '' }, /tokenFile must be non-empty/],
      ['blank idPrefix', { idPrefix: ' \t' }, /idPrefix must be non-empty/],
      ['zero startupTimeoutMs', { startupTimeoutMs: 0 }, /startupTimeoutMs/],
      ['fractional requestTimeoutMs', { requestTimeoutMs: 1.5 }, /requestTimeoutMs/],
      ['oversized healthPollMs', { healthPollMs: 2_147_483_648 }, /healthPollMs/],
      ['zero reconnectDelayMs', { reconnectDelayMs: 0 }, /reconnectDelayMs/],
      ['fractional pageSettleMs', { pageSettleMs: 1.5 }, /pageSettleMs/],
      ['fractional processGraceMs', { processGraceMs: 1.5 }, /processGraceMs/],
      ['zero maxResponseBytes', { maxResponseBytes: 0 }, /maxResponseBytes must be a positive safe integer/],
      ['negative reconnectAttempts', { reconnectAttempts: -1 }, /reconnectAttempts/],
      ['fractional reconnectAttempts', { reconnectAttempts: 1.5 }, /reconnectAttempts/],
      ['unparseable baseUrl', { baseUrl: 'not-a-url' }, /loopback HTTP origin/],
      ['non-http baseUrl', { baseUrl: 'https://127.0.0.1:8765/' }, /loopback HTTP origin/],
      ['remote baseUrl', { baseUrl: 'http://example.com/' }, /loopback HTTP origin/],
      ['private-address baseUrl', { baseUrl: 'http://10.0.0.5:8765/' }, /loopback HTTP origin/],
      ['credentialed baseUrl', { baseUrl: 'http://user:pass@127.0.0.1:8765/' }, /loopback HTTP origin/],
      ['baseUrl pathname', { baseUrl: 'http://127.0.0.1:8765/base' }, /loopback HTTP origin/],
      ['baseUrl search', { baseUrl: 'http://127.0.0.1:8765/?q=1' }, /loopback HTTP origin/],
      ['baseUrl hash', { baseUrl: 'http://127.0.0.1:8765/#f' }, /loopback HTTP origin/],
    ]
    for (const [label, overrides, failure] of cases) {
      const ctx = new Context()
      contexts.push(ctx)
      await ctx.plugin(SubprocessLocal)
      await expect(ctx.plugin(TandemBrowserRuntime, {
        command: process.execPath,
        args: [],
        cwd: process.cwd(),
        baseUrl: 'http://127.0.0.1:8765',
        tokenFile: '/tmp/token',
        ...overrides,
      }), label).rejects.toThrow(failure)
    }
  })

  it('accepts every loopback hostname form and the default identity prefix', async () => {
    for (const baseUrl of [`http://localhost:${String(await freePort())}`, `http://[::1]:${String(await freePort())}`]) {
      const ctx = new Context()
      contexts.push(ctx)
      await ctx.plugin(SubprocessLocal)
      await ctx.plugin(TandemBrowserRuntime, {
        command: process.execPath,
        cwd: process.cwd(),
        baseUrl,
        tokenFile: '/tmp/token',
      })
    }
  })
})

describe('Tandem Browser Runtime public lifecycle', () => {
  it('runs one temporary Profile through the pinned Tandem HTTP protocol', async () => {
    const { ctx, pidFile } = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    expect(created).toEqual({
      status: 'open',
      target: {
        profileId: 'tandem-test-profile',
        workspaceId: 'tandem-test-workspace',
        browserId: 'tandem-test-browser',
        tabId: 'tandem-test-tab',
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
      text: 'A real Tandem protocol page.',
    })
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toEqual(navigated)
    await expect(ctx.browserRuntime.screenshot({ target: created.target })).resolves.toMatchObject({
      target: created.target,
      revision: 1,
      url: 'https://example.test/',
      title: 'Example Domain',
      mediaType: 'image/png',
      data: PNG_1X1,
    })
    const focused = await ctx.browserRuntime.focus({ target: created.target, expectedRevision: 1 })
    expect(focused).toMatchObject({ revision: 2, focused: true })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: 2 })
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 3 })
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toEqual(closed)
    await assertJoined(pidFile)
  })

  it('rejects operations on absent, foreign, closed, and revision-mismatched state', async () => {
    const { ctx } = await setup()
    await expect(ctx.browserRuntime.observe({
      target: { profileId: 'p' as never, workspaceId: 'w' as never, browserId: 'b' as never, tabId: 't' as never },
    })).rejects.toMatchObject({ code: 'BROWSER_NOT_FOUND' })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const foreign = { ...created.target, tabId: 'other-tab' as never }
    await expect(ctx.browserRuntime.navigate({
      target: foreign,
      expectedRevision: 0,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_NOT_FOUND' })
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 7,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_REVISION_CONFLICT' })
    await expect(ctx.browserRuntime.focus({ target: created.target, expectedRevision: 3 }))
      .rejects.toMatchObject({ code: 'BROWSER_REVISION_CONFLICT' })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' }))
      .rejects.toMatchObject({ code: 'BROWSER_CAPACITY' })
    await ctx.browserRuntime.close({ target: created.target, expectedRevision: 0 })
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 1,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_NOT_OPEN' })
    await expect(ctx.browserRuntime.close({ target: created.target, expectedRevision: 1 }))
      .rejects.toMatchObject({ code: 'BROWSER_NOT_OPEN' })
    await expect(ctx.browserRuntime.screenshot({ target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_NOT_OPEN' })
  })

  it('rejects already-aborted work before touching process or HTTP state', async () => {
    const { ctx } = await setup()
    const controller = new AbortController()
    controller.abort(new Error('cancelled before entry'))
    const target = { profileId: 'p' as never, workspaceId: 'w' as never, browserId: 'b' as never, tabId: 't' as never }
    await expect(ctx.browserRuntime.create({ profile: 'temporary', signal: controller.signal }))
      .rejects.toMatchObject({ code: 'BROWSER_ABORTED' })
    for (const rejected of [
      ctx.browserRuntime.navigate({ target, expectedRevision: 0, url: 'https://example.test/', signal: controller.signal }),
      ctx.browserRuntime.observe({ target, signal: controller.signal }),
      ctx.browserRuntime.screenshot({ target, signal: controller.signal }),
      ctx.browserRuntime.focus({ target, expectedRevision: 0, signal: controller.signal }),
      ctx.browserRuntime.close({ target, expectedRevision: 0, signal: controller.signal }),
    ]) {
      await expect(rejected).rejects.toMatchObject({ code: 'BROWSER_ABORTED' })
    }
  })

  it('rejects operations once disposal begins', async () => {
    const { ctx } = await setup()
    const runtime = ctx.browserRuntime
    await runtime.create({ profile: 'temporary' })
    await ctx.fiber.dispose()
    await expect(runtime.create({ profile: 'temporary' }))
      .rejects.toMatchObject({ code: 'BROWSER_DISPOSED' })
  })

  it('contains post-commit observer failures without starving later observers', async () => {
    const { ctx } = await setup()
    const observed: number[] = []
    ctx.on('browser/runtime-state', () => { throw new Error('ordinary observer failed') })
    ctx.on('browser/runtime-state', async () => { throw new Error('async observer failed') })
    ctx.on('browser/runtime-state', (state: { revision: number }) => { observed.push(state.revision) })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
    })
    expect(observed).toEqual([created.revision, navigated.revision])
  })
})

describe('Tandem Browser Runtime startup bounds', () => {
  it('aborts a pending health probe and joins the child', async () => {
    const { ctx, pidFile } = await setup({ slow: 'health' }, { requestTimeoutMs: 5_000 })
    const controller = new AbortController()
    setTimeout(() => { controller.abort(new Error('cancelled mid-health')) }, 1_500)
    await expect(ctx.browserRuntime.create({ profile: 'temporary', signal: controller.signal }))
      .rejects.toMatchObject({ code: 'BROWSER_ABORTED' })
    await assertJoined(pidFile)
  })

  it('aborts a pending health-poll delay', async () => {
    const { ctx } = await setup({ status: 'never-ready' }, { startupTimeoutMs: 10_000, healthPollMs: 250 })
    const controller = new AbortController()
    setTimeout(() => { controller.abort(new Error('cancelled mid-poll')) }, 350)
    await expect(ctx.browserRuntime.create({ profile: 'temporary', signal: controller.signal }))
      .rejects.toMatchObject({ code: 'BROWSER_ABORTED' })
  })

  it('rejects a child that exits before startup health completes', async () => {
    const { ctx } = await setup({ exitAtBoot: true }, { startupTimeoutMs: 1_000 })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' }))
      .rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE', message: /child exited before startup health/ })
  })

  it('bounds startup health verification in time', async () => {
    const { ctx, pidFile } = await setup({ status: 'never-ready' }, { startupTimeoutMs: 1_000, healthPollMs: 20 })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' }))
      .rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE', message: /startup health timed out/ })
    await assertJoined(pidFile)
  })

  it('verifies the pinned product and version before admitting the session', async () => {
    for (const [faults, failure] of [
      [{ version: 'wrong-name' }, /must report tandem-browser 1\.11\.4/],
      [{ version: 'wrong-version' }, /must report tandem-browser 1\.11\.4/],
      [{ version: 'missing-name' }, /version response field name/],
      [{ version: 'non-object' }, /version response must be an object/],
      [{ status: 'bad-ready' }, /status response field ready must be boolean/],
    ] as const) {
      const { ctx } = await setup({ ...faults }, { startupTimeoutMs: 3_000 })
      await expect(ctx.browserRuntime.create({ profile: 'temporary' }), JSON.stringify(faults))
        .rejects.toMatchObject({ code: 'BROWSER_PROTOCOL', message: failure })
    }
  })

  it('rejects a spawn failure before any state exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-tandem-spawn-'))
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SubprocessLocal)
    await ctx.plugin(TandemBrowserRuntime, {
      command: process.execPath,
      args: [join(root, 'not-executable.js')],
      cwd: root,
      env: {},
      baseUrl: `http://127.0.0.1:${String(await freePort())}`,
      tokenFile: join(root, 'api-token'),
      idPrefix: 'tandem-test',
      startupTimeoutMs: 500,
      requestTimeoutMs: 300,
      healthPollMs: 10,
      reconnectAttempts: 0,
      reconnectDelayMs: 10,
      processGraceMs: 100,
      maxResponseBytes: 1024 * 1024,
    })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).rejects.toThrow()
    await rm(root, { recursive: true, force: true })
  })
})

describe('Tandem Browser Runtime protocol fidelity', () => {
  it('rejects malformed session-create receipts', async () => {
    for (const [faults, failure] of [
      [{ create: 'no-tab' }, /session create tab response must be an object/],
      [{ create: 'bad-tab-id' }, /session create tab response field id/],
      [{ create: 'bad-title-type' }, /session create tab response field title must be a string/],
      [{ token: 'short' }, /at least 32 characters/],
    ] as const) {
      const { ctx, pidFile } = await setup({ ...faults })
      await expect(ctx.browserRuntime.create({ profile: 'temporary' }), JSON.stringify(faults))
        .rejects.toMatchObject({ code: 'BROWSER_PROTOCOL', message: failure })
      await assertJoined(pidFile)
    }
  })

  it('rejects an unreadable API token at the first authenticated request', async () => {
    const { ctx, tokenFile } = await setup()
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await rm(tokenFile)
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE', message: /API token is unavailable/ })
  })

  it('rejects malformed navigation and inventory responses', async () => {
    const cases: Array<[Record<string, string>, (ctx: Context, target: unknown) => Promise<unknown>, RegExp]> = [
      [{ navigate: 'non-json' }, (ctx, t) => ctx.browserRuntime.navigate({
        target: t as never, expectedRevision: 0, url: 'https://example.test/',
      }), /must be valid JSON/],
      [{ navigate: 'status-500' }, (ctx, t) => ctx.browserRuntime.navigate({
        target: t as never, expectedRevision: 0, url: 'https://example.test/',
      }), /HTTP 500 .*internal fixture failure/],
      [{ tabsList: 'not-array' }, (ctx, t) => ctx.browserRuntime.observe({ target: t as never }), /tabs must be an array/],
      [{ tabsList: 'bad-tab-shape' }, (ctx, t) => ctx.browserRuntime.observe({ target: t as never }), /tabs list tab response must be an object/],
      [{ pageContent: 'non-object' }, (ctx, t) => ctx.browserRuntime.observe({ target: t as never }), /page content response must be an object/],
      [{ pageContent: 'bad-title' }, (ctx, t) => ctx.browserRuntime.observe({ target: t as never }), /page content response field title/],
      [{ pageContent: 'bad-text' }, (ctx, t) => ctx.browserRuntime.observe({ target: t as never }), /page content response field text must be a string/],
      [{ screenshot: 'bad-type' }, (ctx, t) => ctx.browserRuntime.screenshot({ target: t as never }), /must be image\/png/],
      [{ screenshot: 'oversize-declared' }, (ctx, t) => ctx.browserRuntime.screenshot({ target: t as never }), /exceeds maxResponseBytes/],
      [{ screenshot: 'oversize-actual' }, (ctx, t) => ctx.browserRuntime.screenshot({ target: t as never }), /exceeds maxResponseBytes/],
      [{ focus: 'ok-false' }, (ctx, t) => ctx.browserRuntime.focus({ target: t as never, expectedRevision: 0 }), /did not focus the addressed tab/],
      [{ destroy: 'unknown' }, (ctx, t) => ctx.browserRuntime.close({ target: t as never, expectedRevision: 0 }), /HTTP 404 .*does not exist/],
      [{ destroy: 'ok-false' }, (ctx, t) => ctx.browserRuntime.close({ target: t as never, expectedRevision: 0 }), /did not destroy the temporary session/],
      [{ destroy: '500' }, (ctx, t) => ctx.browserRuntime.close({ target: t as never, expectedRevision: 0 }), /HTTP 500/],
    ]
    for (const [faults, operate, failure] of cases) {
      const { ctx } = await setup(faults, faults.screenshot === 'oversize-actual' ? { maxResponseBytes: 1024 } : {})
      const created = await ctx.browserRuntime.create({ profile: 'temporary' })
      await expect(operate(ctx, created.target), JSON.stringify(faults))
        .rejects.toMatchObject({ code: 'BROWSER_PROTOCOL', message: failure })
    }
  })

  it('bounds every HTTP request in time and reports caller aborts promptly', async () => {
    const timeoutHarness = await setup({ slow: 'navigate' }, { requestTimeoutMs: 200 })
    const timeoutCreated = await timeoutHarness.ctx.browserRuntime.create({ profile: 'temporary' })
    await expect(timeoutHarness.ctx.browserRuntime.navigate({
      target: timeoutCreated.target,
      expectedRevision: 0,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE', message: /HTTP request failed/ })

    const abortHarness = await setup({ slow: 'navigate' }, { requestTimeoutMs: 5_000 })
    const abortCreated = await abortHarness.ctx.browserRuntime.create({ profile: 'temporary' })
    const controller = new AbortController()
    setTimeout(() => { controller.abort(new Error('cancelled mid-navigate')) }, 100)
    await expect(abortHarness.ctx.browserRuntime.navigate({
      target: abortCreated.target,
      expectedRevision: 0,
      url: 'https://example.test/',
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'BROWSER_ABORTED' })
  })
})

describe('Tandem Browser Runtime failure projection', () => {
  it('recovers a mid-navigation crash onto the same DSH target without an orphan', async () => {
    const { ctx, pidFile } = await setup()
    const states: string[] = []
    ctx.on('browser/runtime-state', (state: { status: string; revision: number; reconnecting?: boolean }) => {
      states.push(`${state.status}:${String(state.revision)}:${'reconnecting' in state ? String(state.reconnecting) : '-'}`)
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://crash.test/',
    })

    const deadline = Date.now() + 5_000
    let recovered = await ctx.browserRuntime.observe({ target: created.target })
    while ((recovered.status !== 'open' || recovered.revision === 1) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      recovered = await ctx.browserRuntime.observe({ target: created.target })
    }

    expect(states).toContain('unavailable:2:true')
    expect(recovered).toMatchObject({
      status: 'open',
      target: created.target,
      revision: 3,
      url: 'https://crash.test/',
      title: 'Loaded page',
      text: 'Recovered crash page.',
    })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: 3 })
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 4 })
    await assertJoined(pidFile)
  })

  it('projects a terminal crash when no reconnect attempts are configured', async () => {
    const { ctx } = await setup({}, { reconnectAttempts: 0 })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
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
      reason: 'crashed',
      reconnecting: false,
      revision: 2,
    })
    const runtime = runtimeOf(ctx)
    runtime.recoveryScheduled = false
    expect(runtime.scheduleRecovery('crashed', false)).toMatchObject({ status: 'unavailable' })
  })

  it('projects an unhealthy page as unavailable and recovers the same target', async () => {
    const { ctx } = await setup()
    interface UnavailableProjection {
      status: string
      reason?: string | undefined
      revision?: number | undefined
      reconnecting?: boolean | undefined
    }
    const projections: UnavailableProjection[] = []
    ctx.on('browser/runtime-state', (state: { status: string; reason?: string; revision?: number; reconnecting?: boolean }) => {
      if (state.status === 'unavailable') {
        projections.push({ status: state.status, reason: state.reason, revision: state.revision, reconnecting: state.reconnecting })
      }
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://forget.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE' })

    const deadline = Date.now() + 5_000
    let state = await ctx.browserRuntime.observe({ target: created.target })
    while (state.status !== 'open' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      state = await ctx.browserRuntime.observe({ target: created.target })
    }
    expect(state).toMatchObject({
      status: 'open',
      target: created.target,
      revision: 2,
      url: 'about:blank',
    })
    expect(projections).toContainEqual({ status: 'unavailable', reason: 'unhealthy', revision: 1, reconnecting: true })
  })

  it('stops a still-live child when an unhealthy page will not reconnect', async () => {
    const { ctx, pidFile } = await setup({}, { reconnectAttempts: 0 })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://forget.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE' })

    const deadline = Date.now() + 5_000
    let state = await ctx.browserRuntime.observe({ target: created.target })
    while (state.status === 'open' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      state = await ctx.browserRuntime.observe({ target: created.target })
    }
    expect(state).toMatchObject({
      status: 'unavailable',
      reason: 'unhealthy',
      reconnecting: false,
      revision: 1,
    })
    await assertJoined(pidFile)
    expect(await ctx.browserRuntime.observe({ target: created.target })).toMatchObject({
      status: 'unavailable',
      reconnecting: false,
    })
  })

  it('reports exhausted reconnect attempts truthfully and still closes cleanly', async () => {
    const { ctx, pidFile } = await setup()
    const states: Array<{ status: string; reason?: string; reconnecting?: boolean }> = []
    ctx.on('browser/runtime-state', (state: { status: string; reason?: string; reconnecting?: boolean }) => {
      states.push({ status: state.status, ...'reason' in state ? { reason: state.reason } : {}, ...'reconnecting' in state ? { reconnecting: state.reconnecting } : {} })
    })
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://die.test/',
    })

    const deadline = Date.now() + 5_000
    let state = await ctx.browserRuntime.observe({ target: created.target })
    while (!(state.status === 'unavailable' && !state.reconnecting) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      state = await ctx.browserRuntime.observe({ target: created.target })
    }
    expect(state).toMatchObject({
      status: 'unavailable',
      reason: 'reconnect-failed',
      reconnecting: false,
      revision: 3,
    })
    expect(states).toContainEqual({ status: 'unavailable', reason: 'crashed', reconnecting: true })
    await expect(ctx.browserRuntime.focus({ target: created.target, expectedRevision: 3 }))
      .rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE' })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: 3 })
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 4 })
    await assertJoined(pidFile)
  })

})

describe('Tandem Browser Runtime teardown ownership', () => {
  it('drains, closes the temporary session, and joins the tree on disposal', async () => {
    const { ctx, pidFile } = await setup()
    await ctx.browserRuntime.create({ profile: 'temporary' })
    const pid = Number((await readFile(pidFile, 'utf8')).trim())
    await ctx.fiber.dispose()
    await assertJoined(pidFile)
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('contains a failing session cleanup and still terminates the child', async () => {
    const { ctx, pidFile } = await setup({ destroy: '500' })
    await ctx.browserRuntime.create({ profile: 'temporary' })
    const warnings: unknown[][] = []
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args)
    })
    await ctx.fiber.dispose()
    expect(warnings.some(args => String(args[0]).includes('temporary session cleanup failed'))).toBe(true)
    warn.mockRestore()
    await assertJoined(pidFile)
  })

  it('ignores stale, intentional, and terminal child-exit notifications', async () => {
    const { ctx } = await setup({}, { reconnectAttempts: 0 })
    const runtime = runtimeOf(ctx)
    const stale = { done: Promise.resolve({ exitCode: 0, signal: null }) }
    runtime.processExited(stale, 'stale handle')
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const live = runtime.process
    runtime.closing = true
    runtime.processExited({ done: Promise.resolve({ exitCode: 0, signal: null }) }, 'exit while closing')
    runtime.closing = false
    await ctx.browserRuntime.close({ target: created.target, expectedRevision: 0 })
    runtime.processExited({ done: Promise.resolve({ exitCode: 0, signal: null }) }, 'exit after close')
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toMatchObject({ status: 'closed' })
    expect(live).toBeDefined()
  })

  it('rejects navigation when the upstream tab identity is already gone', async () => {
    const { ctx } = await setup()
    const runtime = runtimeOf(ctx)
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    runtime.tandemTabId = undefined
    await expect(ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: 0,
      url: 'https://example.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE', message: /no longer reports the addressed tab/ })
  })

  it('stops recovery work once disposal begins and ignores closed or already-scheduled recovery', async () => {
    const { ctx } = await setup({}, { reconnectAttempts: 1 })
    const runtime = runtimeOf(ctx)
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    runtime.closing = true
    await expect(runtime.reconnect(created as never, undefined as never)).resolves.toBeUndefined()
    const unavailable = { status: 'unavailable', target: created.target, revision: 1, reason: 'crashed' as const, reconnecting: false }
    await expect(runtime.reconnect(created as never, unavailable as never)).resolves.toBeUndefined()
    const projected = runtime.scheduleRecovery('crashed', true)
    expect(projected).toMatchObject({ status: 'unavailable', revision: 1 })
    await new Promise(resolve => setTimeout(resolve, 50))
    runtime.closing = false

    const fresh = await setup()
    const freshRuntime = runtimeOf(fresh.ctx)
    const freshCreated = await fresh.ctx.browserRuntime.create({ profile: 'temporary' })
    freshRuntime.recoveryScheduled = true
    expect(freshRuntime.scheduleRecovery('crashed', false)).toMatchObject({ status: 'open' })
    freshRuntime.recoveryScheduled = false
    await fresh.ctx.browserRuntime.close({ target: freshCreated.target, expectedRevision: 0 })
    expect(freshRuntime.scheduleRecovery('crashed', false)).toMatchObject({ status: 'closed' })
    freshRuntime.closing = true
    expect(freshRuntime.scheduleRecovery('crashed', false)).toMatchObject({ status: 'closed' })
  })

  it('falls back to the addressed state when recovery cannot project', async () => {
    const { ctx } = await setup()
    const runtime = runtimeOf(ctx)
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    runtime.page = async () => {
      runtime.state = undefined
      throw new BrowserRuntimeError('unreachable', 'BROWSER_RUNTIME_UNAVAILABLE')
    }
    runtime.scheduleRecovery = () => undefined
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toEqual(created)
  })

  it('rethrows non-runtime failures from observe without projecting recovery', async () => {
    const { ctx } = await setup()
    const runtime = runtimeOf(ctx)
    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    const original = runtime.readTab.bind(runtime)
    runtime.readTab = async () => { throw new Error('raw inventory failure') }
    await expect(ctx.browserRuntime.observe({ target: created.target })).rejects.toThrow('raw inventory failure')
    runtime.readTab = original
    await expect(ctx.browserRuntime.observe({ target: created.target })).resolves.toMatchObject({ status: 'open' })
  })

  it('reports a child spawn failure before any state exists', async () => {
    const { ctx } = await setup()
    const runtime = runtimeOf(ctx)
    const service = (runtime.ctx as Context & { subprocess: Record<string, unknown> }).subprocess as {
      spawn: (spec: unknown) => unknown
      resolveExecutable: (command: string, env: unknown, signal: unknown) => Promise<string>
    }
    const rejected = Promise.reject(new Error('spawn EACCES'))
    const failing = {
      done: rejected,
      terminate: () => {},
    }
    const realResolve = service.resolveExecutable.bind(service)
    const realSpawn = service.spawn.bind(service)
    service.resolveExecutable = async () => '/resolved/tandem'
    service.spawn = () => failing
    await expect(ctx.browserRuntime.create({ profile: 'temporary' }))
      .rejects.toMatchObject({ code: 'BROWSER_RUNTIME_UNAVAILABLE', message: /child exited before startup health/ })
    service.resolveExecutable = realResolve
    service.spawn = realSpawn
    rejected.catch(() => {})
    // The spawn-level rejection is contained at the join, so teardown still
    // reaches its terminal flag instead of dying on a secondary throw.
    await ctx.fiber.dispose()
    expect(runtime.disposed).toBe(true)
  })

  it('rejects a child the platform cannot execute', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-tandem-spawn-denied-'))
    const denied = join(root, 'denounced.bin')
    await writeFile(denied, '#!/bin/sh\nexit 0\n', { mode: 0o644 })
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SubprocessLocal)
    await ctx.plugin(TandemBrowserRuntime, {
      command: denied,
      args: [],
      cwd: root,
      env: {},
      baseUrl: `http://127.0.0.1:${String(await freePort())}`,
      tokenFile: join(root, 'api-token'),
      idPrefix: 'tandem-test',
      startupTimeoutMs: 500,
      requestTimeoutMs: 300,
      healthPollMs: 10,
      reconnectAttempts: 0,
      reconnectDelayMs: 10,
      processGraceMs: 100,
      maxResponseBytes: 1024 * 1024,
    })
    await expect(ctx.browserRuntime.create({ profile: 'temporary' })).rejects.toThrow()
    await rm(root, { recursive: true, force: true })
  })
})
