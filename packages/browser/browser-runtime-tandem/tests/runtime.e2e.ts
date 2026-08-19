import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  assertTandemQualificationHost,
  isolateTandemHost,
  tandemQualificationFailure,
  tandemQualificationPlatform,
  TANDEM_UPSTREAM_REVISION,
  withTandemLauncherPath,
} from '@deepseek-ai/dsh-browser-runtime-tandem'
import TandemBrowserRuntime from '@deepseek-ai/dsh-browser-runtime-tandem'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'

// Real-runtime qualification of the pinned Tandem Browser on named macOS and
// Windows hosts. Self-skips without DSH_TANDEM_CHECKOUT (the checkout root)
// and DSH_TANDEM_BIN (the launcher to run). Wine is diagnostic only and
// cannot satisfy this suite; native Windows CI owns the platform matrix.
const tandemCheckout = process.env.DSH_TANDEM_CHECKOUT
const tandemBin = process.env.DSH_TANDEM_BIN
const REAL_PAGE = 'https://example.com/'

const contexts: Context[] = []
const scratchHomes: string[] = []

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

/**
 * Run one Tandem child step and wrap its failure with the host, command, and error.
 * @param platformName - `macOS` or `Windows`.
 * @param command - executable, Browser Runtime method, or documented gate that failed.
 * @param run - isolated Tandem step.
 */
async function qualify<T>(
  platformName: 'macOS' | 'Windows',
  command: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw tandemQualificationFailure(platformName, command, error)
  }
}

/**
 * Write a scratch launcher that starts Tandem Electron with isolated HOME and user-data-dir.
 * @param isolation - scratch home and Electron user-data directory.
 * @param checkout - pinned Tandem checkout used as Electron's app path.
 * @param electronBin - Electron executable from that checkout.
 */
async function writeIsolatedLauncher(
  isolation: ReturnType<typeof isolateTandemHost>,
  checkout: string,
  electronBin: string,
): Promise<string> {
  const launcher = join(isolation.home, isolation.platform === 'win32' ? 'launch-tandem.cmd' : 'launch-tandem')
  if (isolation.platform === 'win32') {
    await writeFile(
      launcher,
      [
        '@echo off',
        `set "HOME=${isolation.home}"`,
        `set "USERPROFILE=${isolation.home}"`,
        `set "APPDATA=${isolation.env.APPDATA ?? ''}"`,
        `set "LOCALAPPDATA=${isolation.env.LOCALAPPDATA ?? ''}"`,
        `"${electronBin}" "${checkout}" --user-data-dir="${isolation.userDataDir}"`,
        '',
      ].join('\r\n'),
    )
    return launcher
  }
  await writeFile(
    launcher,
    [
      '#!/bin/sh',
      `export HOME=${JSON.stringify(isolation.home)}`,
      `exec ${JSON.stringify(electronBin)} ${JSON.stringify(checkout)} --user-data-dir=${JSON.stringify(isolation.userDataDir)}`,
      '',
    ].join('\n'),
    { mode: 0o700 },
  )
  await chmod(launcher, 0o700)
  return launcher
}

afterEach(async () => {
  const disposalErrors: unknown[] = []
  for (const context of contexts.splice(0)) {
    try {
      await context.fiber.dispose()
    } catch (error) {
      disposalErrors.push(error)
    }
  }
  for (const home of scratchHomes.splice(0)) {
    try {
      await rm(home, { recursive: true, force: true })
    } catch (error) {
      disposalErrors.push(error)
    }
  }
  if (disposalErrors.length === 1) throw disposalErrors[0]
  if (disposalErrors.length > 1) {
    throw new AggregateError(disposalErrors, 'Tandem e2e teardown failed')
  }
})

describe.skipIf(tandemCheckout === undefined || tandemBin === undefined)('Tandem Browser Runtime real-runtime e2e', () => {
  it('opens, navigates, screenshots, and closes one isolated page on the named host', async () => {
    const platform = tandemQualificationPlatform()
    assertTandemQualificationHost()
    const platformName = platform === 'darwin' ? 'macOS' : 'Windows'

    const { stdout: head } = await qualify(platformName, 'git rev-parse HEAD', () =>
      promisify(execFile)('git', ['-C', tandemCheckout as string, 'rev-parse', 'HEAD']))
    expect(head.trim()).toBe(TANDEM_UPSTREAM_REVISION)

    const home = await mkdtemp(join(tmpdir(), 'dsh-tandem-e2e-home-69-'))
    scratchHomes.push(home)
    const isolation = withTandemLauncherPath(isolateTandemHost(home), tandemBin as string)
    const port = await freePort()
    await mkdir(isolation.dataDir, { recursive: true })
    await mkdir(isolation.userDataDir, { recursive: true })
    await Promise.all(isolation.nativeHostDirs.map(directory => mkdir(directory, { recursive: true })))
    await writeFile(join(isolation.dataDir, 'config.json'), `${JSON.stringify({ general: { apiPort: port } })}\n`, { mode: 0o600 })
    const launcher = await writeIsolatedLauncher(isolation, tandemCheckout as string, tandemBin as string)
    const ctx = new Context()
    contexts.push(ctx)
    await qualify(platformName, launcher, async () => {
      await ctx.plugin(SubprocessLocal)
      await ctx.plugin(TandemBrowserRuntime, {
        command: launcher,
        args: [],
        cwd: tandemCheckout as string,
        env: { ...isolation.env },
        baseUrl: `http://127.0.0.1:${String(port)}`,
        tokenFile: isolation.tokenFile,
        idPrefix: 'tandem-e2e',
        startupTimeoutMs: 60_000,
        requestTimeoutMs: 30_000,
        healthPollMs: 250,
        pageSettleMs: 500,
        reconnectAttempts: 0,
        reconnectDelayMs: 500,
        processGraceMs: 5_000,
      })
    })

    const created = await qualify(platformName, 'browserRuntime.create', () =>
      ctx.browserRuntime.create({ profile: 'temporary' }))
    expect(created).toMatchObject({
      status: 'open',
      revision: 0,
      target: {
        profileId: 'tandem-e2e-tmp-1',
        workspaceId: 'tandem-e2e-tmp-1-workspace',
        browserId: 'tandem-e2e-tmp-1-browser-1',
        tabId: 'tandem-e2e-tmp-1-tab-1',
      },
      chrome: { kind: 'temporary', partition: 'persist:session-tandem-e2e-tmp-1' },
    })
    const navigated = await qualify(platformName, 'browserRuntime.navigate', () =>
      ctx.browserRuntime.navigate({
        target: created.target,
        expectedRevision: created.revision,
        url: REAL_PAGE,
      }))
    expect(navigated).toMatchObject({ status: 'open', revision: 1, url: REAL_PAGE })
    expect(typeof navigated.title).toBe('string')
    const shot = await qualify(platformName, 'browserRuntime.screenshot', () =>
      ctx.browserRuntime.screenshot({ target: created.target }))
    expect(shot).toMatchObject({ revision: 1, url: REAL_PAGE, mediaType: 'image/png' })
    expect(shot.data.length).toBeGreaterThan(0)
    const closed = await qualify(platformName, 'browserRuntime.close', () =>
      ctx.browserRuntime.close({ target: created.target, expectedRevision: navigated.revision }))
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 2 })
  }, 120_000)
})
