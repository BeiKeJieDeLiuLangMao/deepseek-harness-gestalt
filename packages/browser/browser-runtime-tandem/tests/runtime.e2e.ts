import { execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { TANDEM_UPSTREAM_REVISION } from '@deepseek-ai/dsh-browser-runtime-tandem'
import TandemBrowserRuntime from '@deepseek-ai/dsh-browser-runtime-tandem'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'

// Real-runtime check against a local Tandem Browser checkout at the pinned
// revision. Self-skips without DSH_TANDEM_CHECKOUT (the checkout root) and
// DSH_TANDEM_BIN (the launcher to run); the child gets an isolated HOME so
// its ~/.tandem config, token, and data directory cannot touch the user's
// own, and its API port comes from that isolated config.json because the
// application itself does not honor a port environment variable.
const tandemCheckout = process.env.DSH_TANDEM_CHECKOUT
const tandemBin = process.env.DSH_TANDEM_BIN
const REAL_PAGE = 'https://example.com/'

const contexts: Context[] = []

/** Reserve one loopback TCP port for the isolated Tandem API. */
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected TCP e2e port')
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
  return address.port
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
})

describe.skipIf(tandemCheckout === undefined || tandemBin === undefined)('Tandem Browser Runtime real-runtime e2e', () => {
  it('drives one real page through the pinned Tandem revision', async () => {
    const { stdout: head } = await promisify(execFile)('git', ['-C', tandemCheckout as string, 'rev-parse', 'HEAD'])
    expect(head.trim()).toBe(TANDEM_UPSTREAM_REVISION)

    const home = await mkdtemp(join(tmpdir(), 'dsh-tandem-e2e-'))
    const port = await freePort()
    const tandemDir = join(home, '.tandem')
    await mkdir(tandemDir, { recursive: true })
    await writeFile(join(tandemDir, 'config.json'), `${JSON.stringify({ general: { apiPort: port } })}\n`, { mode: 0o600 })
    const tokenFile = join(tandemDir, 'api-token')
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SubprocessLocal)
    await ctx.plugin(TandemBrowserRuntime, {
      command: tandemBin as string,
      args: [],
      cwd: tandemCheckout as string,
      env: { HOME: home },
      baseUrl: `http://127.0.0.1:${String(port)}`,
      tokenFile,
      idPrefix: 'tandem-e2e',
      startupTimeoutMs: 60_000,
      requestTimeoutMs: 30_000,
      healthPollMs: 250,
      pageSettleMs: 500,
      reconnectAttempts: 0,
      reconnectDelayMs: 500,
      processGraceMs: 5_000,
    })

    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    expect(created).toMatchObject({
      status: 'open',
      revision: 0,
      target: {
        profileId: 'tandem-e2e-tmp-1',
        workspaceId: 'tandem-e2e-tmp-1-workspace',
        browserId: 'tandem-e2e-tmp-1-browser',
        tabId: 'tandem-e2e-tmp-1-tab-1',
      },
      chrome: { kind: 'temporary', partition: 'persist:session-tandem-e2e-tmp-1' },
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
    expect(focused).toMatchObject({ revision: 2, focused: true })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: 2 })
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 3 })
    await rm(home, { recursive: true, force: true })
  }, 120_000)
})
