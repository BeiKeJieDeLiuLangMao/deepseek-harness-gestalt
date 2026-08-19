import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ElectronBrowserRuntime, { installElectronTestHost, listenElectronBrowserHttp } from '@deepseek-ai/dsh-browser-runtime-electron'
import { FakeElectronHost, PNG_1X1_BASE64 } from './fake-electron.ts'

const contexts: Context[] = []
const servers: Array<{ close(): Promise<void> }> = []
const temps: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
  await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  installElectronTestHost(undefined)
})

async function json(
  origin: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${origin}${path}`, init)
  return { status: response.status, body: await response.json() as unknown }
}

describe('Electron Browser HTTP protocol', () => {
  it('serves Tandem-shaped session, tab, content, screenshot, focus, and destroy operations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-http-'))
    temps.push(root)
    const tokenFile = join(root, 'api-token')
    const ctx = new Context()
    contexts.push(ctx)
    installElectronTestHost(new FakeElectronHost())
    await ctx.plugin(ElectronBrowserRuntime, {
      idPrefix: 'electron-http',
    })
    const server = await listenElectronBrowserHttp({ runtime: ctx.browserRuntime, tokenFile })
    servers.push(server)
    const token = (await readFile(tokenFile, 'utf8')).trim()
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const version = await json(server.origin, '/agent/version')
    expect(version).toEqual({
      status: 200,
      body: {
        name: 'tandem-browser',
        version: '1.11.4',
        capabilityFamilies: ['tabs', 'sessions'],
        transports: ['http'],
      },
    })
    const unauthorized = await json(server.origin, '/sessions/create', { method: 'POST' })
    expect(unauthorized.status).toBe(401)

    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const created = await json(server.origin, '/sessions/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'electron-http-tmp-1', url: 'about:blank' }),
    })
    expect(created.status).toBe(200)
    const createdBody = created.body as { tab: { id: string; url: string; title: string; partition: string } }
    expect(createdBody.tab).toMatchObject({
      url: 'about:blank',
      title: 'New Tab',
      partition: 'session-electron-http-tmp-1',
    })
    const tabId = createdBody.tab.id

    const status = await json(server.origin, '/status')
    expect(status).toMatchObject({ status: 200, body: { ready: true, version: '1.11.4' } })

    const navigated = await json(server.origin, '/navigate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://example.test/', tabId }),
    })
    expect(navigated).toMatchObject({ status: 200, body: { ok: true, url: 'https://example.test/' } })

    const listed = await json(server.origin, '/tabs/list', { headers: { authorization: `Bearer ${token}` } })
    expect(listed).toMatchObject({
      status: 200,
      body: { tabs: [{ id: tabId, url: 'https://example.test/', title: 'Example Domain' }] },
    })

    const content = await json(server.origin, '/page-content', {
      headers: { authorization: `Bearer ${token}`, 'x-tab-id': tabId },
    })
    expect(content).toMatchObject({
      status: 200,
      body: { url: 'https://example.test/', title: 'Example Domain', text: 'An Electron protocol page.' },
    })

    const shot = await fetch(`${server.origin}/screenshot`, {
      headers: { authorization: `Bearer ${token}`, 'x-tab-id': tabId },
    })
    expect(shot.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await shot.arrayBuffer()).toString('base64')).toBe(PNG_1X1_BASE64)

    const focused = await json(server.origin, '/tabs/focus', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tabId }),
    })
    expect(focused).toEqual({ status: 200, body: { ok: true } })

    const missingName = await json(server.origin, '/sessions/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(missingName.status).toBe(400)
    const missingTab = await json(server.origin, '/navigate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://example.test/', tabId: 'missing' }),
    })
    expect(missingTab.status).toBe(404)
    const unknownRoute = await json(server.origin, '/nope', { headers: { authorization: `Bearer ${token}` } })
    expect(unknownRoute.status).toBe(404)
    const badJson = await fetch(`${server.origin}/sessions/create`, {
      method: 'POST',
      headers,
      body: '[]',
    })
    expect(badJson.status).toBe(500)

    const tracked = await ctx.browserRuntime.observe({
      target: {
        profileId: 'electron-http-tmp-1' as never,
        workspaceId: 'electron-http-tmp-1-workspace' as never,
        browserId: 'electron-http-tmp-1-browser-1' as never,
        tabId: 'electron-http-tmp-1-tab-1' as never,
      },
    })
    if (tracked.status === 'open') {
      await ctx.browserRuntime.close({ target: tracked.target, expectedRevision: tracked.revision })
    }
    const listedClosed = await json(server.origin, '/tabs/list', { headers: { authorization: `Bearer ${token}` } })
    expect(listedClosed.status).toBe(200)
    const closedContent = await json(server.origin, '/page-content', {
      headers: { authorization: `Bearer ${token}`, 'x-tab-id': tabId },
    })
    expect(closedContent.status).toBe(404)
    const named = await json(server.origin, '/sessions/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'electron-http-work' }),
    })
    expect(named.status).toBe(200)
    const namedBody = named.body as { tab: { id: string; partition: string } }
    expect(namedBody.tab.partition).toBe('persist:session-electron-http-work')

    const destroyed = await json(server.origin, '/sessions/destroy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'electron-http-tmp-1' }),
    })
    expect(destroyed).toEqual({ status: 200, body: { ok: true, name: 'electron-http-tmp-1' } })
    const missingSession = await json(server.origin, '/sessions/destroy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'electron-http-tmp-1' }),
    })
    expect(missingSession.status).toBe(404)
    const missingContent = await json(server.origin, '/page-content', {
      headers: { authorization: `Bearer ${token}`, 'x-tab-id': 'missing' },
    })
    expect(missingContent.status).toBe(404)
    const missingShot = await fetch(`${server.origin}/screenshot`, {
      headers: { authorization: `Bearer ${token}`, 'x-tab-id': 'missing' },
    })
    expect(missingShot.status).toBe(404)
    const missingFocus = await json(server.origin, '/tabs/focus', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tabId: 'missing' }),
    })
    expect(missingFocus.status).toBe(404)
    const emptyCreate = await json(server.origin, '/sessions/create', {
      method: 'POST',
      headers,
      body: '',
    })
    expect(emptyCreate.status).toBe(400)
    const missingNavigateFields = await json(server.origin, '/navigate', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(missingNavigateFields.status).toBe(404)
    const missingHeaderContent = await json(server.origin, '/page-content', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(missingHeaderContent.status).toBe(404)
    const missingHeaderShot = await fetch(`${server.origin}/screenshot`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(missingHeaderShot.status).toBe(404)
    const missingFocusId = await json(server.origin, '/tabs/focus', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(missingFocusId.status).toBe(404)
    const missingDestroyName = await json(server.origin, '/sessions/destroy', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(missingDestroyName.status).toBe(404)
    const closedThenDestroy = await json(server.origin, '/sessions/destroy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'electron-http-work' }),
    })
    expect(closedThenDestroy.status).toBe(200)
    const statusEmpty = await json(server.origin, '/status')
    expect(statusEmpty).toMatchObject({ status: 200, body: { ready: true, url: 'about:blank', title: 'New Tab' } })
  })
})
