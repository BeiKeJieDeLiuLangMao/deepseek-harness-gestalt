import { describe, expect, it } from 'vitest'
import { createDesktopAccountPool } from '../src/account-pool.ts'
import type { CLIProxyAPISupervisor } from '../src/cliproxyapi-runtime.ts'

describe('Desktop account-pool GLM key submit', () => {
  it('PUTs the first Coding Plan key and PATCHes later keys at the existing length', async () => {
    const calls: { method: string; path: string; body?: string }[] = []
    let plans: unknown[] = []
    const pool = createDesktopAccountPool({
      supervisor: () => ({
        coreRequest: async (request) => {
          calls.push({ method: request.method, path: request.path, ...request.body === undefined ? {} : { body: request.body } })
          if (request.path === '/v0/management/glm-coding-plan' && request.method === 'GET') {
            return { statusCode: 200, body: JSON.stringify({ 'glm-coding-plan': plans }) }
          }
          if (request.path === '/v0/management/glm-coding-plan' && request.method === 'PUT') {
            plans = JSON.parse(request.body ?? '[]') as unknown[]
            return { statusCode: 200, body: '{}' }
          }
          if (request.path === '/v0/management/glm-coding-plan' && request.method === 'PATCH') {
            const payload = JSON.parse(request.body ?? '{}') as { index: number; value: unknown }
            plans = [...plans.slice(0, payload.index), payload.value]
            return { statusCode: 200, body: '{}' }
          }
          if (request.path === '/v0/management/auth-files' && request.method === 'GET') {
            return { statusCode: 200, body: JSON.stringify({ files: [] }) }
          }
          return { statusCode: 404, body: '{"error":"unexpected"}' }
        },
      } as CLIProxyAPISupervisor),
      management: () => undefined,
      wait: async () => {},
    })

    await pool.submitGlmKey({ apiKey: 'first-secret', site: 'cn' })
    expect(calls.filter(call => call.path === '/v0/management/glm-coding-plan').map(call => call.method)).toEqual(['GET', 'PUT'])
    expect(JSON.parse(calls.find(call => call.method === 'PUT')?.body ?? '[]')).toEqual([{ 'api-key': 'first-secret', site: 'cn' }])

    calls.length = 0
    await pool.submitGlmKey({ apiKey: 'second-secret', site: 'international' })
    const glmCalls = calls.filter(call => call.path === '/v0/management/glm-coding-plan')
    expect(glmCalls.map(call => call.method)).toEqual(['GET', 'PATCH'])
    expect(JSON.parse(glmCalls[1]?.body ?? '{}')).toEqual({
      index: 1,
      value: { 'api-key': 'second-secret', site: 'international' },
    })
    expect(JSON.stringify(pool.getSnapshot())).not.toMatch(/first-secret|second-secret|api-key/i)
  })

  it('retries the roster until a newly saved GLM file appears', async () => {
    let rosterCalls = 0
    const waits: number[] = []
    const pool = createDesktopAccountPool({
      supervisor: () => ({
        coreRequest: async (request) => {
          if (request.path === '/v0/management/glm-coding-plan' && request.method === 'GET') {
            return { statusCode: 200, body: JSON.stringify({ 'glm-coding-plan': [] }) }
          }
          if (request.path === '/v0/management/glm-coding-plan' && request.method === 'PUT') {
            return { statusCode: 200, body: '{}' }
          }
          if (request.path === '/v0/management/auth-files' && request.method === 'GET') {
            rosterCalls += 1
            if (rosterCalls < 3) return { statusCode: 200, body: JSON.stringify({ files: [] }) }
            return {
              statusCode: 200,
              body: JSON.stringify({ files: [{ auth_index: 'glm-1', name: 'glm.json', provider: 'glm' }] }),
            }
          }
          return { statusCode: 404, body: '{"error":"unexpected"}' }
        },
      } as CLIProxyAPISupervisor),
      management: () => undefined,
      wait: async (ms) => { waits.push(ms) },
    })
    await pool.submitGlmKey({ apiKey: 'glm-secret', site: 'cn' })
    expect(rosterCalls).toBe(3)
    expect(waits).toEqual([400, 400])
    expect(pool.getSnapshot().accounts.map(account => account.name)).toEqual(['glm.json'])
  })

  it('keeps a failed XAI start on the login snapshot instead of throwing', async () => {
    const pool = createDesktopAccountPool({
      supervisor: () => undefined,
      management: () => undefined,
      wait: async () => {},
    })
    const login = await pool.startLogin('xai')
    expect(login).toEqual({
      kind: 'xai',
      flow: 'device',
      error: 'CLIProxyAPI account pool is unavailable',
    })
    expect(pool.getSnapshot().login).toEqual(login)
  })

  it('publishes an XAI wait snapshot before the core answers', async () => {
    const seen: string[] = []
    const pool = createDesktopAccountPool({
      supervisor: () => ({
        coreRequest: async () => {
          seen.push(pool.getSnapshot().login?.kind ?? '')
          return { statusCode: 200, body: JSON.stringify({ url: 'https://example.test/xai', state: 'xai-1', user_code: 'XAI-99' }) }
        },
      } as CLIProxyAPISupervisor),
      management: () => undefined,
      wait: async () => {},
    })
    const login = await pool.startLogin('xai')
    expect(seen).toEqual(['xai'])
    expect(login).toEqual({
      kind: 'xai',
      flow: 'device',
      state: 'xai-1',
      url: 'https://example.test/xai',
      userCode: 'XAI-99',
    })
  })

  it('submits a PKCE callback URL and redacts health metadata onto the roster', async () => {
    const calls: { method: string; path: string; body?: string }[] = []
    const pool = createDesktopAccountPool({
      supervisor: () => ({
        coreRequest: async (request) => {
          calls.push({ method: request.method, path: request.path, ...request.body === undefined ? {} : { body: request.body } })
          if (request.path === '/v0/management/oauth-callback' && request.method === 'POST') {
            return { statusCode: 200, body: '{"status":"ok"}' }
          }
          if (request.path === '/v0/management/auth-files' && request.method === 'GET') {
            return {
              statusCode: 200,
              body: JSON.stringify({
                files: [{
                  auth_index: 'codex-1',
                  name: 'codex.json',
                  provider: 'codex',
                  success: 2,
                  failed: 1,
                  size: 554,
                  modtime: '2026-09-11 11:11:17',
                  recent_requests: [{ success: 1, failed: 0 }, { success: 0, failed: 1 }],
                }],
              }),
            }
          }
          return { statusCode: 404, body: '{"error":"unexpected"}' }
        },
      } as CLIProxyAPISupervisor),
      management: () => undefined,
      wait: async () => {},
    })
    await pool.submitCallback({
      provider: 'codex',
      redirectUrl: 'http://localhost:1455/auth/callback?code=abc&state=s2',
    })
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v0/management/oauth-callback' })
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      provider: 'codex',
      redirect_url: 'http://localhost:1455/auth/callback?code=abc&state=s2',
    })
    expect(pool.getSnapshot().accounts[0]).toMatchObject({
      authIndex: 'codex-1',
      sizeBytes: 554,
      modifiedAt: '2026-09-11 11:11:17',
      successCount: 2,
      failCount: 1,
      recentRequests: [{ success: 1, failed: 0 }, { success: 0, failed: 1 }],
    })
  })

  it('lists models, downloads JSON, and patches a note', async () => {
    const calls: { method: string; path: string; body?: string }[] = []
    const pool = createDesktopAccountPool({
      supervisor: () => ({
        coreRequest: async (request) => {
          calls.push({ method: request.method, path: request.path, ...request.body === undefined ? {} : { body: request.body } })
          if (request.path.startsWith('/v0/management/auth-files/models')) {
            return { statusCode: 200, body: JSON.stringify({ models: [{ id: 'grok-4', display_name: 'Grok 4', owned_by: 'xai' }, { id: '' }] }) }
          }
          if (request.path.startsWith('/v0/management/auth-files/download')) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                type: 'xai',
                access_token: 'secret-token',
                excluded_models: ['grok-3', 'gpt-5-*'],
                headers: { 'X-Test': '1' },
                prefix: 'p0',
              }),
            }
          }
          if (request.path === '/v0/management/auth-files/fields') {
            return { statusCode: 200, body: '{}' }
          }
          if (request.path === '/v0/management/auth-files' && request.method === 'GET') {
            return { statusCode: 200, body: JSON.stringify({ files: [] }) }
          }
          return { statusCode: 404, body: '{"error":"unexpected"}' }
        },
      } as CLIProxyAPISupervisor),
      management: () => undefined,
      wait: async () => {},
    })
    await expect(pool.listModels('xai.json')).resolves.toEqual([{ id: 'grok-4', name: 'Grok 4', ownedBy: 'xai' }])
    await expect(pool.downloadAuthFile('xai.json')).resolves.toMatchObject({ name: 'xai.json' })
    await expect(pool.readFields('xai.json')).resolves.toMatchObject({
      name: 'xai.json',
      info: { id: 'xai.json', type: 'xai', prefix: 'p0' },
      fields: { prefix: 'p0', excludedModels: ['grok-3', 'gpt-5-*'], headers: { 'X-Test': '1' } },
    })
    expect(JSON.stringify(await pool.readFields('xai.json'))).not.toMatch(/secret-token/)
    await pool.patchFields('xai.json', {
      note: 'team', prefix: 'p1', proxyUrl: 'socks5://proxy', priority: 10, weight: 1,
      disableCooling: true, websockets: false, excludedModels: ['gpt-5-*'], headers: { 'X-Test': '1' },
    })
    const patch = calls.find(call => call.method === 'PATCH' && call.path === '/v0/management/auth-files/fields')
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({
      name: 'xai.json',
      note: 'team',
      prefix: 'p1',
      proxy_url: 'socks5://proxy',
      priority: 10,
      weight: 1,
      disable_cooling: true,
      websockets: false,
      excluded_models: ['gpt-5-*'],
      headers: { 'X-Test': '1' },
    })
  })
})
