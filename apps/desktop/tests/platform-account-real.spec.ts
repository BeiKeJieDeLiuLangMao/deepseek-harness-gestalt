/** Desktop Host Account lifecycle over a REAL Loader and TCP Platform composition. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { selectPlatformEnvironment, validatePlatformEnvironmentPair } from '@deepseek-ai/dsh-platform-account'
import { PlatformAccountHttpTransport } from '@deepseek-ai/dsh-platform-account-client'
import {
  ACCESS_TOKEN_TTL_MS,
  MemoryAccountBackend,
  MemoryAccountInvalidationBus,
  PlatformAccount,
  type GitHubIdentityProvider,
} from '@deepseek-ai/dsh-platform-account-core'
import * as PlatformAccountHttp from '@deepseek-ai/dsh-platform-account-http/src/index.ts'
import WebServer from '@deepseek-ai/dsh-host-webserver/src/index.ts'
import { DesktopAccountController, EncryptedDesktopAccountStore } from '../src/platform-account.ts'

const ENVIRONMENT = selectPlatformEnvironment(validatePlatformEnvironmentPair({
  development: {
    environment: 'development', origin: 'https://platform.dev.example.com',
    callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
    githubClientId: 'desktop-real-development', credentialReference: 'credentials://development',
    databaseIdentity: 'desktop-real-database-development', identityNamespace: 'desktop-real-development',
  },
  production: {
    environment: 'production', origin: 'https://platform.example.com',
    callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
    githubClientId: 'desktop-real-production', credentialReference: 'credentials://production',
    databaseIdentity: 'desktop-real-database-production', identityNamespace: 'desktop-real-production',
  },
}), 'development')

/** UTF-8 passthrough standing in for Electron safeStorage in composition tests. */
const passthroughProtection = {
  encrypt: (value: string) => new TextEncoder().encode(value),
  decrypt: (value: Uint8Array) => new TextDecoder().decode(value),
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('Desktop Platform Account over a real HTTP Platform', () => {
  it('signs in through the system browser, restores after restart, refreshes, and invalidates its session on sign-out', { timeout: 60_000 }, async () => {
    let now = Date.parse('2026-08-19T09:00:00.000Z')
    let callback: { code: string; state: string } | undefined
    const github: GitHubIdentityProvider = {
      environment: ENVIRONMENT,
      authorizationUrl(input) {
        callback = { code: 'desktop-real-code', state: input.state }
        return `https://github.com/login/oauth/authorize?state=${input.state}`
      },
      async exchange() {
        return { providerSubject: 13994321, login: 'octocat', avatarUrl: 'https://avatars.example/octocat' }
      },
    }
    const provider = {
      name: 'desktop-real-platform-account-provider',
      apply(ctx: Context) {
        new PlatformAccount(ctx, {
          backend: new MemoryAccountBackend(ENVIRONMENT.databaseIdentity),
          invalidation: new MemoryAccountInvalidationBus(),
          github,
          environment: ENVIRONMENT,
          clock: { now: () => now },
          config: { tokenSigningKey: Buffer.alloc(32, 7), pollingSigningKey: Buffer.alloc(32, 9) },
        })
      },
    }
    const loaded = await bootPlatform(provider)
    const networkFetch = platformFetch(loaded.port)
    const transport = new PlatformAccountHttpTransport({ environment: ENVIRONMENT, fetch: networkFetch })
    const polls: Array<() => void> = []
    const controller = new DesktopAccountController({
      environment: ENVIRONMENT,
      transport,
      store: new EncryptedDesktopAccountStore(join(loaded.root, 'platform-account.bin'), passthroughProtection),
      systemBrowser: { open: () => {} },
      schedule: (task) => {
        polls.push(task)
        return { unref: () => {} } as ReturnType<typeof setTimeout>
      },
      now: () => now,
    })

    await controller.start()
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', privacyAccepted: false })
    await expect(controller.beginLogin()).rejects.toThrow('privacy notice must be accepted before authorization')
    controller.acceptPrivacy()
    await controller.beginLogin()
    expect(controller.getSnapshot()).toMatchObject({ status: 'polling' })
    if (callback === undefined) throw new Error('composition provider did not receive authorization input')
    const authorization = await networkFetch(`${ENVIRONMENT.callbackUrl}?${new URLSearchParams(callback)}`)
    expect(authorization.status).toBe(200)
    await drainPolls(polls, () => controller.getSnapshot().status === 'signed-in')
    expect(controller.getSnapshot()).toMatchObject({
      status: 'signed-in',
      account: { githubLogin: 'octocat', githubId: 13994321 },
    })
    const firstAuthorization = await controller.authorizeCurrentInstallation()
    expect(firstAuthorization.accessToken).not.toBe('')
    await controller.dispose()

    const restart = new DesktopAccountController({
      environment: ENVIRONMENT,
      transport,
      store: new EncryptedDesktopAccountStore(join(loaded.root, 'platform-account.bin'), passthroughProtection),
      systemBrowser: { open: () => {} },
      schedule: (task) => {
        polls.push(task)
        return { unref: () => {} } as ReturnType<typeof setTimeout>
      },
      now: () => now,
    })
    await restart.start()
    expect(restart.getSnapshot()).toMatchObject({ status: 'signed-in', account: { githubLogin: 'octocat' } })

    now += ACCESS_TOKEN_TTL_MS + 1
    const rotated = await restart.authorizeCurrentInstallation()
    expect(rotated.accessToken).not.toBe(firstAuthorization.accessToken)
    expect(rotated.accessToken).not.toBe('')

    await restart.signOut()
    expect(restart.getSnapshot()).toMatchObject({ status: 'idle' })
    await expect(transport.current(rotated)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })

    const afterSignOut = new DesktopAccountController({
      environment: ENVIRONMENT,
      transport,
      store: new EncryptedDesktopAccountStore(join(loaded.root, 'platform-account.bin'), passthroughProtection),
      systemBrowser: { open: () => {} },
      schedule: (task) => {
        polls.push(task)
        return { unref: () => {} } as ReturnType<typeof setTimeout>
      },
      now: () => now,
    })
    await afterSignOut.start()
    expect(afterSignOut.getSnapshot()).toMatchObject({ status: 'idle' })
    await afterSignOut.dispose()
  })
})

/** Execute controller-scheduled polls until the stop condition holds. */
async function drainPolls(polls: Array<() => void>, finished: () => boolean): Promise<void> {
  for (let round = 0; round < 10 && !finished(); round += 1) {
    const scheduled = polls.splice(0)
    for (const poll of scheduled) poll()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
}

function platformFetch(port: number): typeof fetch {
  return async (input, init = {}) => {
    const source = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init.headers)
    headers.set('origin', ENVIRONMENT.origin)
    return fetch(`http://127.0.0.1:${String(port)}${source.pathname}${source.search}`, { ...init, headers })
  }
}

async function bootPlatform(provider: unknown): Promise<{ root: string; port: number }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-desktop-platform-account-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: 'desktop-real-platform-account-provider'",
    "- name: '@deepseek-ai/dsh-platform-account-http'",
    `  config:\n    origin: '${ENVIRONMENT.origin}'`,
    '',
  ].join('\n'))
  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['desktop-real-platform-account-provider', provider],
    ['@deepseek-ai/dsh-platform-account-http', PlatformAccountHttp],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  const webServer = context.get('webServer') as unknown as { port: number }
  if (typeof webServer.port !== 'number') throw new Error('desktop composition exposed no WebServer port')
  return { root, port: webServer.port }
}
