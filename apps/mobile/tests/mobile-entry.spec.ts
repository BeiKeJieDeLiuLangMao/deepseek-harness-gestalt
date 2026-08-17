// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const browserOpen = vi.hoisted(() => vi.fn<(options: { url: string }) => Promise<void>>())

vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }))

afterEach(() => {
  cleanup()
  browserOpen.mockReset()
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  vi.resetModules()
})

describe('Mobile Platform Account entry', () => {
  it('opens the prepared GitHub URL through Capacitor from the user click and polls over HTTPS', async () => {
    configureEnvironment()
    document.body.innerHTML = '<div id="root"></div>'
    const windowOpen = vi.spyOn(window, 'open')
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push({ url, init })
      if (url.endsWith('/login-attempts')) {
        return json({
          id: 'attempt-mobile-entry',
          state: 'state-mobile-entry',
          authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=mobile-development&redirect_uri=https%3A%2F%2Fdev.example%2Fv1%2Faccount%2Foauth%2Fgithub%2Fcallback&state=state-mobile-entry&code_challenge=challenge&code_challenge_method=S256',
          pollingToken: 'signed-polling-token',
          expiresAt: Date.now() + 300_000,
        })
      }
      return json({ status: 'pending' })
    }))

    await import('../src/main.tsx')
    fireEvent.click(await screen.findByRole('checkbox'))
    const button = screen.getByRole('button', { name: '使用 GitHub 继续' })
    await waitFor(() => { expect(button.hasAttribute('disabled')).toBe(false) })
    fireEvent.click(button)

    await waitFor(() => { expect(browserOpen).toHaveBeenCalledOnce() })
    const opened = new URL(browserOpen.mock.calls[0]?.[0].url as string)
    expect(opened.protocol).toBe('https:')
    expect(opened.origin).toBe('https://github.com')
    expect(opened.searchParams.get('redirect_uri')).toBe('https://dev.example/v1/account/oauth/github/callback')
    expect(opened.searchParams.get('code_challenge_method')).toBe('S256')
    expect(opened.searchParams.has('scope')).toBe(false)
    expect(opened.searchParams.has('access_token')).toBe(false)
    expect(windowOpen).not.toHaveBeenCalled()
    await waitFor(() => { expect(calls.some(call => call.url.endsWith('/login-poll'))).toBe(true) })
    expect(calls.every(call => call.url.startsWith('https://dev.example/'))).toBe(true)
  })

  it('fails before rendering or traffic when deployment selection is missing', async () => {
    configureEnvironment()
    vi.stubEnv('VITE_PLATFORM_ENV', '')
    document.body.innerHTML = '<div id="root"></div>'
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(import('../src/main.tsx')).rejects.toThrow('must be development or production')
    expect(document.getElementById('root')?.childElementCount).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

function configureEnvironment(): void {
  const fields: Record<string, string> = {
    VITE_PLATFORM_ENV: 'development',
    VITE_PLATFORM_DEVELOPMENT_ORIGIN: 'https://dev.example',
    VITE_PLATFORM_DEVELOPMENT_CALLBACK_URL: 'https://dev.example/v1/account/oauth/github/callback',
    VITE_PLATFORM_DEVELOPMENT_GITHUB_CLIENT_ID: 'mobile-development',
    VITE_PLATFORM_DEVELOPMENT_CREDENTIAL_REFERENCE: 'credentials://development',
    VITE_PLATFORM_DEVELOPMENT_DATABASE_IDENTITY: 'database-development',
    VITE_PLATFORM_DEVELOPMENT_IDENTITY_NAMESPACE: 'namespace-development',
    VITE_PLATFORM_PRODUCTION_ORIGIN: 'https://prod.example',
    VITE_PLATFORM_PRODUCTION_CALLBACK_URL: 'https://prod.example/v1/account/oauth/github/callback',
    VITE_PLATFORM_PRODUCTION_GITHUB_CLIENT_ID: 'mobile-production',
    VITE_PLATFORM_PRODUCTION_CREDENTIAL_REFERENCE: 'credentials://production',
    VITE_PLATFORM_PRODUCTION_DATABASE_IDENTITY: 'database-production',
    VITE_PLATFORM_PRODUCTION_IDENTITY_NAMESPACE: 'namespace-production',
  }
  for (const [key, value] of Object.entries(fields)) vi.stubEnv(key, value)
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
