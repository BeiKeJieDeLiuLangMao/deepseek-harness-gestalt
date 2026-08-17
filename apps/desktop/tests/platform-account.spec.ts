import { Context } from '@deepseek-ai/cordis'
import { generateKeyPairSync } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseInstallationId, selectPlatformEnvironment, validatePlatformEnvironmentPair } from '@deepseek-ai/dsh-platform-account'
import {
  MemoryAccountBackend,
  MemoryAccountInvalidationBus,
  PlatformAccount,
  type GitHubIdentityProvider,
} from '@deepseek-ai/dsh-platform-account-core'
import {
  DesktopAccountController,
  EncryptedDesktopAccountStore,
  type DesktopAccountStore,
  type PersistedDesktopAccount,
} from '../src/platform-account.ts'
import { loadDesktopPlatformEnvironment } from '../src/platform-environment.ts'

const NOW = Date.parse('2026-08-17T10:00:00.000Z')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
const ENVIRONMENT = selectPlatformEnvironment(validatePlatformEnvironmentPair({
  development: {
    environment: 'development', origin: 'https://platform.dev.example.com',
    callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
    githubClientId: 'desktop-development', credentialReference: 'credentials://development',
    databaseIdentity: 'database-development', identityNamespace: 'gestalt-development',
  },
  production: {
    environment: 'production', origin: 'https://platform.example.com',
    callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
    githubClientId: 'desktop-production', credentialReference: 'credentials://production',
    databaseIdentity: 'database-production', identityNamespace: 'gestalt-production',
  },
}), 'development')

class MemoryDesktopStore implements DesktopAccountStore {
  record: PersistedDesktopAccount | undefined
  material = new Map<string, unknown>()

  async load(): Promise<PersistedDesktopAccount | undefined> {
    return this.record === undefined ? undefined : structuredClone(this.record)
  }

  async save(record: PersistedDesktopAccount): Promise<void> {
    this.record = structuredClone(record)
  }
}

function github(): GitHubIdentityProvider {
  return {
    environment: ENVIRONMENT,
    authorizationUrl(input) {
      const url = new URL('https://github.com/login/oauth/authorize')
      url.searchParams.set('client_id', 'desktop-development')
      url.searchParams.set('redirect_uri', input.callbackUrl)
      url.searchParams.set('state', input.state)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },
    async exchange() {
      return { providerSubject: 13994321, login: 'octocat', avatarUrl: 'https://avatars.example/octocat' }
    },
  }
}

function platform() {
  return new PlatformAccount(new Context(), {
    backend: new MemoryAccountBackend(ENVIRONMENT.databaseIdentity),
    invalidation: new MemoryAccountInvalidationBus(),
    github: github(),
    environment: ENVIRONMENT,
    clock: { now: () => NOW },
    config: {
      tokenSigningKey: Buffer.alloc(32, 7),
      pollingSigningKey: Buffer.alloc(32, 9),
    },
  })
}

describe('DesktopAccountController', () => {
  it('keeps the P-256 private key in Host storage and completes signed polling', async () => {
    const service = platform()
    const store = new MemoryDesktopStore()
    const scheduled: Array<() => void> = []
    let authorizationUrl = ''
    const controller = new DesktopAccountController({
      environment: ENVIRONMENT,
      transport: service,
      store,
      now: () => NOW,
      systemBrowser: { open: async (url) => { authorizationUrl = url } },
      schedule: (task) => {
        scheduled.push(task)
        return { unref() {}, [Symbol.dispose]() {} } as never
      },
    })
    await controller.start()
    await expect(controller.beginLogin()).rejects.toThrow('privacy notice must be accepted')
    await controller.acceptPrivacy()
    await controller.beginLogin()
    expect(new URL(authorizationUrl).searchParams.has('scope')).toBe(false)
    expect(store.record?.pendingPrivateKey).toContain('BEGIN PRIVATE KEY')

    const state = new URL(authorizationUrl).searchParams.get('state')
    if (state === null) throw new Error('missing state')
    await service.completeGitHubCallback({ code: 'github-code', state })
    scheduled.shift()?.()
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('signed-in') })

    expect(controller.getSnapshot().account?.githubLogin).toBe('octocat')
    expect(store.record?.pendingPrivateKey).toBeUndefined()
    expect(store.record?.sessionPrivateKey).toContain('BEGIN PRIVATE KEY')
  })

  it('revokes only the stored installation session and preserves account-scoped material', async () => {
    const service = platform()
    const store = new MemoryDesktopStore()
    const scheduled: Array<() => void> = []
    let authorizationUrl = ''
    const controller = new DesktopAccountController({
      environment: ENVIRONMENT,
      transport: service,
      store,
      now: () => NOW,
      systemBrowser: { open: async (url) => { authorizationUrl = url } },
      schedule: (task) => {
        scheduled.push(task)
        return { unref() {}, [Symbol.dispose]() {} } as never
      },
    })
    await controller.start()
    const installationId = store.record?.installationId
    await controller.acceptPrivacy()
    await controller.beginLogin()
    const state = new URL(authorizationUrl).searchParams.get('state')
    if (state === null) throw new Error('missing state')
    await service.completeGitHubCallback({ code: 'github-code', state })
    scheduled.shift()?.()
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('signed-in') })
    store.material.set('personal-pairing', 'preserved')

    await controller.signOut()

    expect(controller.getSnapshot().status).toBe('idle')
    expect(store.record?.installationId).toBe(installationId)
    expect(store.record?.session).toBeUndefined()
    expect(store.material.get('personal-pairing')).toBe('preserved')
  })
})

describe('Desktop Platform environment composition', () => {
  it('fails before composition for missing, unknown, or cross-environment deployment identities', () => {
    const source = desktopEnvironmentSource()
    expect(loadDesktopPlatformEnvironment(source)).toEqual(ENVIRONMENT)
    expect(() => loadDesktopPlatformEnvironment({ ...source, DSH_PLATFORM_ENV: undefined }))
      .toThrow('must be development or production')
    expect(() => loadDesktopPlatformEnvironment({ ...source, DSH_PLATFORM_ENV: 'preview' }))
      .toThrow('must be development or production')
    expect(() => loadDesktopPlatformEnvironment({
      ...source,
      DSH_PLATFORM_PRODUCTION_DATABASE_IDENTITY: source.DSH_PLATFORM_DEVELOPMENT_DATABASE_IDENTITY,
    })).toThrow('distinct databaseIdentity')
  })
})

describe('EncryptedDesktopAccountStore', () => {
  const protection = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
  }

  it('atomically replaces a symlink without writing its referent and preserves owner-only mode', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'account.bin')
    const victim = join(directory, 'victim.txt')
    await writeFile(victim, 'untouched')
    await symlink(victim, path)
    const store = new EncryptedDesktopAccountStore(path, protection)

    await store.save({ installationId: parseInstallationId('desktop-atomic') })

    expect(await readFile(victim, 'utf8')).toBe('untouched')
    expect((await lstat(path)).isSymbolicLink()).toBe(false)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(store.load()).resolves.toEqual({ installationId: 'desktop-atomic' })
  })

  it('rejects malformed durable variants and non-canonical encrypted bytes', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'account.bin')
    const store = new EncryptedDesktopAccountStore(path, protection)
    await writeFile(path, 'not base64')
    await expect(store.load()).rejects.toThrow('canonical base64')

    const privateKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
      .export({ format: 'pem', type: 'pkcs8' }).toString()
    const invalid = [
      { installationId: 'desktop', session: {}, sessionPrivateKey: privateKey },
      { installationId: 'desktop', pending: {}, pendingPrivateKey: privateKey },
      { installationId: 'desktop', session: { accessToken: 'partial' } },
    ]
    for (const value of invalid) {
      await writeFile(path, Buffer.from(JSON.stringify(value)).toString('base64'))
      await expect(store.load()).rejects.toThrow()
    }
  })

  it('cleans random temporary siblings after a failed commit and never exposes partial concurrent writes', async () => {
    const directory = await temporaryDirectory()
    const targetDirectory = join(directory, 'target')
    await mkdir(targetDirectory)
    const failing = new EncryptedDesktopAccountStore(targetDirectory, protection)
    await expect(failing.save({ installationId: parseInstallationId('failure') })).rejects.toThrow()
    expect((await readdir(directory)).filter(name => name.startsWith('target.') && name.endsWith('.tmp'))).toEqual([])

    const path = join(directory, 'account.bin')
    const store = new EncryptedDesktopAccountStore(path, protection)
    await Promise.all([
      store.save({ installationId: parseInstallationId('concurrent-a') }),
      store.save({ installationId: parseInstallationId('concurrent-b') }),
    ])
    expect(['concurrent-a', 'concurrent-b']).toContain((await store.load())?.installationId)
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-account-'))
  temporaryDirectories.push(directory)
  return directory
}

function desktopEnvironmentSource(): NodeJS.ProcessEnv {
  return {
    DSH_PLATFORM_ENV: 'development',
    DSH_PLATFORM_DEVELOPMENT_ORIGIN: 'https://platform.dev.example.com',
    DSH_PLATFORM_DEVELOPMENT_CALLBACK_URL: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
    DSH_PLATFORM_DEVELOPMENT_GITHUB_CLIENT_ID: 'desktop-development',
    DSH_PLATFORM_DEVELOPMENT_CREDENTIAL_REFERENCE: 'credentials://development',
    DSH_PLATFORM_DEVELOPMENT_DATABASE_IDENTITY: 'database-development',
    DSH_PLATFORM_DEVELOPMENT_IDENTITY_NAMESPACE: 'gestalt-development',
    DSH_PLATFORM_PRODUCTION_ORIGIN: 'https://platform.example.com',
    DSH_PLATFORM_PRODUCTION_CALLBACK_URL: 'https://platform.example.com/v1/account/oauth/github/callback',
    DSH_PLATFORM_PRODUCTION_GITHUB_CLIENT_ID: 'desktop-production',
    DSH_PLATFORM_PRODUCTION_CREDENTIAL_REFERENCE: 'credentials://production',
    DSH_PLATFORM_PRODUCTION_DATABASE_IDENTITY: 'database-production',
    DSH_PLATFORM_PRODUCTION_IDENTITY_NAMESPACE: 'gestalt-production',
  }
}
