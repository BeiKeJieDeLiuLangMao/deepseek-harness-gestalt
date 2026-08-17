import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  MemoryAccountBackend,
  MemoryAccountInvalidationBus,
  PlatformAccount,
  type GitHubIdentityProvider,
} from '@deepseek-ai/dsh-platform-account-core'
import {
  DesktopAccountController,
  type DesktopAccountStore,
  type PersistedDesktopAccount,
} from '../src/platform-account.ts'

const NOW = Date.parse('2026-08-17T10:00:00.000Z')

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
    backend: new MemoryAccountBackend(),
    invalidation: new MemoryAccountInvalidationBus(),
    github: github(),
    clock: { now: () => NOW },
    config: {
      environment: 'development',
      identityNamespace: 'gestalt-development',
      origin: 'https://platform.dev.example.com',
      callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
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
      environment: 'development',
      transport: service,
      store,
      now: () => NOW,
      openSystemBrowser: async (url) => { authorizationUrl = url },
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
      environment: 'development',
      transport: service,
      store,
      now: () => NOW,
      openSystemBrowser: async (url) => { authorizationUrl = url },
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
