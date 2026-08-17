import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GitHubOAuthIdentityProvider,
  validatePlatformEnvironmentPair,
} from '../src/index.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('GitHubOAuthIdentityProvider', () => {
  it('requests no scope and retains only numeric id, login, and avatar URL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'provider-token',
        token_type: 'bearer',
        scope: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 13994321,
        login: 'octocat',
        avatar_url: 'https://avatars.example/octocat',
        email: 'must-not-be-retained@example.com',
        company: 'must-not-be-retained',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = new GitHubOAuthIdentityProvider({
      clientId: 'client-development',
      clientSecret: 'secret-development',
      callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
      fetch,
    })
    const authorization = new URL(provider.authorizationUrl({
      callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
      state: 'random-state',
      codeChallenge: 'challenge',
    }))
    expect(authorization.searchParams.has('scope')).toBe(false)

    await expect(provider.exchange('github-code', 'pkce-verifier')).resolves.toEqual({
      providerSubject: 13994321,
      login: 'octocat',
      avatarUrl: 'https://avatars.example/octocat',
    })
    const tokenBody = new URLSearchParams(fetch.mock.calls[0]?.[1]?.body as string)
    expect(tokenBody.get('code_verifier')).toBe('pkce-verifier')
    expect(tokenBody.has('scope')).toBe(false)
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer provider-token' })
  })

  it('rejects an inherited GitHub scope instead of using the broader token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'provider-token',
      token_type: 'bearer',
      scope: 'repo,user',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = new GitHubOAuthIdentityProvider({
      clientId: 'client-development',
      clientSecret: 'secret-development',
      callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
      fetch,
    })
    await expect(provider.exchange('github-code', 'pkce-verifier'))
      .rejects.toThrow('GitHub returned a token with OAuth scopes')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('defaults to global fetch and enforces the fixed HTTPS callback', () => {
    vi.stubGlobal('fetch', vi.fn())
    expect(() => new GitHubOAuthIdentityProvider({
      clientId: 'client', clientSecret: 'secret', callbackUrl: 'http://platform.example/callback',
    })).toThrow('must use HTTPS')
    const provider = new GitHubOAuthIdentityProvider({
      clientId: 'client', clientSecret: 'secret',
      callbackUrl: 'https://platform.example/v1/account/oauth/github/callback',
    })
    expect(() => provider.authorizationUrl({
      callbackUrl: 'https://other.example/v1/account/oauth/github/callback', state: 'state', codeChallenge: 'challenge',
    })).toThrow('does not match')
  })

  it.each([
    { name: 'token HTTP failure', responses: [new Response('', { status: 502 })], message: 'token exchange failed' },
    { name: 'non-object token body', responses: [json(null)], message: 'no access token' },
    { name: 'missing access token', responses: [json({ scope: '' })], message: 'no access token' },
    { name: 'missing token scope', responses: [json({ access_token: 'token' })], message: 'with OAuth scopes' },
    { name: 'identity HTTP failure', responses: [json({ access_token: 'token', scope: '' }), new Response('', { status: 503 })], message: 'identity lookup failed' },
    { name: 'non-object identity', responses: [json({ access_token: 'token', scope: '' }), json(null)], message: 'missing public identity fields' },
    { name: 'invalid identity id', responses: [json({ access_token: 'token', scope: '' }), json({ id: '1', login: 'octocat', avatar_url: 'avatar' })], message: 'missing public identity fields' },
    { name: 'missing identity login', responses: [json({ access_token: 'token', scope: '' }), json({ id: 1, avatar_url: 'avatar' })], message: 'missing public identity fields' },
    { name: 'missing identity avatar', responses: [json({ access_token: 'token', scope: '' }), json({ id: 1, login: 'octocat' })], message: 'missing public identity fields' },
  ])('rejects $name', async ({ responses, message }) => {
    const fetch = vi.fn()
    for (const response of responses) fetch.mockResolvedValueOnce(response)
    const provider = new GitHubOAuthIdentityProvider({
      clientId: 'client', clientSecret: 'secret',
      callbackUrl: 'https://platform.example/v1/account/oauth/github/callback', fetch,
    })
    await expect(provider.exchange('code', 'verifier')).rejects.toThrow(message)
  })
})

describe('validatePlatformEnvironmentPair', () => {
  const development = {
    environment: 'development' as const,
    origin: 'https://platform.dev.example.com',
    callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
    githubClientId: 'github-development',
    credentialNamespace: 'credentials-development',
    databaseNamespace: 'database-development',
    identityNamespace: 'identity-development',
  }
  const production = {
    environment: 'production' as const,
    origin: 'https://platform.example.com',
    callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
    githubClientId: 'github-production',
    credentialNamespace: 'credentials-production',
    databaseNamespace: 'database-production',
    identityNamespace: 'identity-production',
  }

  it('accepts two completely separate deployment identities', () => {
    expect(validatePlatformEnvironmentPair({ development, production })).toEqual({ development, production })
  })

  it.each([
    'origin', 'callbackUrl', 'githubClientId', 'credentialNamespace', 'databaseNamespace', 'identityNamespace',
  ] as const)('rejects a shared %s', (field) => {
    expect(() => validatePlatformEnvironmentPair({
      development,
      production: { ...production, [field]: development[field] },
    })).toThrow(`must use distinct ${field}`)
  })

  it.each([
    { field: 'origin', value: 'http://platform.dev.example.com', message: 'share one HTTPS origin' },
    { field: 'callbackUrl', value: 'http://platform.dev.example.com/v1/account/oauth/github/callback', message: 'share one HTTPS origin' },
    { field: 'callbackUrl', value: 'https://other.example.com/v1/account/oauth/github/callback', message: 'share one HTTPS origin' },
    { field: 'callbackUrl', value: 'https://platform.dev.example.com/wrong', message: 'callback path is invalid' },
    { field: 'githubClientId', value: ' ', message: 'identity fields must be non-empty' },
    { field: 'credentialNamespace', value: '', message: 'identity fields must be non-empty' },
    { field: 'databaseNamespace', value: '', message: 'identity fields must be non-empty' },
    { field: 'identityNamespace', value: '', message: 'identity fields must be non-empty' },
  ])('rejects invalid development $field', ({ field, value, message }) => {
    expect(() => validatePlatformEnvironmentPair({
      development: { ...development, [field]: value }, production,
    })).toThrow(message)
  })
})

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
