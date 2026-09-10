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
})
