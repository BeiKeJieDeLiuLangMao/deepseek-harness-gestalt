/**
 * Loopback HTTP adapter that exposes Tandem's operation vocabulary over the
 * in-process Electron Browser Runtime.
 * @module @deepseek-ai/dsh-browser-runtime-electron/http
 */

import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BrowserProfileName, BrowserRuntimeError } from '@deepseek-ai/dsh-browser-runtime'
import type { BrowserPageState, BrowserRuntime, BrowserTarget } from '@deepseek-ai/dsh-browser-runtime'
import { TANDEM_UPSTREAM_VERSION } from './protocol.ts'

/** Bound loopback HTTP server that speaks Tandem's session/tab protocol. */
export interface ElectronBrowserHttpServer {
  /** Absolute loopback origin, including the assigned port. */
  readonly origin: string
  /** Local file that stores the generated bearer token. */
  readonly tokenFile: string
  /** Close the listener and remaining sockets. */
  close(): Promise<void>
}

interface TabRecord {
  readonly id: string
  readonly target: BrowserTarget
  revision: number
}

interface SessionRecord {
  readonly name: string
  readonly persistent: boolean
  readonly tabs: Map<string, TabRecord>
}

/** JSON object decoded from one HTTP body. */
type JsonObject = Record<string, unknown>

/** Read one request body as UTF-8 JSON. */
async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.length === 0) return {}
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BrowserRuntimeError('HTTP request body must be an object', 'BROWSER_PROTOCOL')
  }
  return parsed as JsonObject
}

/** Write one JSON response. */
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

/** Inventory object matching Tandem's tab list fields. */
function inventoryTab(id: string, page: BrowserPageState, active: boolean) {
  return {
    id,
    webContentsId: 1,
    title: page.title,
    url: page.url,
    favicon: '',
    groupId: null,
    active,
    createdAt: 0,
    source: 'session',
    pinned: false,
    partition: page.chrome.partition,
    emoji: null,
    emojiFlash: null,
  }
}

/**
 * Bind one loopback HTTP server over an in-process Electron Browser Runtime.
 * @param options - Runtime, token file, and optional bind host and port.
 * @returns origin, token file, and closer for the bound listener.
 */
export async function listenElectronBrowserHttp(options: {
  readonly runtime: BrowserRuntime
  readonly tokenFile: string
  readonly host?: string
  readonly port?: number
}): Promise<ElectronBrowserHttpServer> {
  const token = randomBytes(24).toString('hex')
  await mkdir(dirname(options.tokenFile), { recursive: true })
  await writeFile(options.tokenFile, `${token}\n`, { mode: 0o600 })
  const sessions = new Map<string, SessionRecord>()
  let tabSeq = 0

  const findTab = (tabId: string): { session: SessionRecord; tab: TabRecord } | undefined => {
    for (const session of sessions.values()) {
      const tab = session.tabs.get(tabId)
      if (tab !== undefined) return { session, tab }
    }
    return undefined
  }

  const listedTabs = async () => {
    const tabs = []
    for (const session of sessions.values()) {
      for (const tab of session.tabs.values()) {
        const state = await options.runtime.observe({ target: tab.target })
        if (state.status === 'open') tabs.push(inventoryTab(tab.id, state, true))
      }
    }
    return tabs
  }

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url as string, 'http://127.0.0.1')
    if (url.pathname === '/agent/version') {
      json(response, 200, {
        name: 'tandem-browser',
        version: TANDEM_UPSTREAM_VERSION,
        capabilityFamilies: ['tabs', 'sessions'],
        transports: ['http'],
      })
      return
    }
    if (url.pathname === '/status') {
      const tabs = await listedTabs()
      json(response, 200, {
        ready: true,
        url: tabs.at(-1)?.url ?? 'about:blank',
        title: tabs.at(-1)?.title ?? 'New Tab',
        loading: false,
        activeTab: tabs.at(-1) ?? null,
        tabs,
        version: TANDEM_UPSTREAM_VERSION,
      })
      return
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      json(response, 401, { error: 'Unauthorized' })
      return
    }
    if (request.method === 'POST' && url.pathname === '/sessions/create') {
      const input = await readJson(request)
      const name = typeof input.name === 'string' ? input.name : ''
      if (name.length === 0) {
        json(response, 400, { error: 'name is required' })
        return
      }
      const persistent = !/-tmp-\d+$/.test(name)
      const marker = name.lastIndexOf('-')
      const profileName = persistent ? name.slice(marker + 1) : undefined
      const created = persistent && profileName !== undefined
        ? await options.runtime.create({ profile: 'persistent', name: BrowserProfileName(profileName) })
        : await options.runtime.create({ profile: 'temporary' })
      tabSeq += 1
      const tabId = `electron-tab-${String(tabSeq)}`
      const session = sessions.get(name) ?? {
        name,
        persistent,
        tabs: new Map<string, TabRecord>(),
      }
      session.tabs.set(tabId, { id: tabId, target: created.target, revision: created.revision })
      sessions.set(name, session)
      json(response, 200, {
        ok: true,
        name,
        partition: created.chrome.partition,
        tab: inventoryTab(tabId, created, true),
      })
      return
    }
    if (request.method === 'POST' && url.pathname === '/navigate') {
      const input = await readJson(request)
      const tabId = typeof input.tabId === 'string' ? input.tabId : ''
      const nextUrl = typeof input.url === 'string' ? input.url : ''
      const found = findTab(tabId)
      if (found === undefined) {
        json(response, 404, { error: `tab ${tabId} does not exist` })
        return
      }
      const navigated = await options.runtime.navigate({
        target: found.tab.target,
        expectedRevision: found.tab.revision,
        url: nextUrl,
      })
      found.tab.revision = navigated.revision
      json(response, 200, { ok: true, url: navigated.url, tab: found.tab.id })
      return
    }
    if (request.method === 'GET' && url.pathname === '/tabs/list') {
      json(response, 200, { tabs: await listedTabs(), groups: [] })
      return
    }
    if (request.method === 'GET' && url.pathname === '/page-content') {
      const tabId = request.headers['x-tab-id']
      const found = typeof tabId === 'string' ? findTab(tabId) : undefined
      if (found === undefined) {
        json(response, 404, { error: 'tab does not exist' })
        return
      }
      const state = await options.runtime.observe({ target: found.tab.target })
      if (state.status !== 'open') {
        json(response, 404, { error: 'tab is not open' })
        return
      }
      json(response, 200, {
        title: state.title,
        url: state.url,
        description: '',
        text: state.text,
        length: state.text.length,
        storage: state.storage,
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/screenshot') {
      const tabId = request.headers['x-tab-id']
      const found = typeof tabId === 'string' ? findTab(tabId) : undefined
      if (found === undefined) {
        json(response, 404, { error: 'tab does not exist' })
        return
      }
      const shot = await options.runtime.screenshot({ target: found.tab.target })
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(Buffer.from(shot.data, 'base64'))
      return
    }
    if (request.method === 'POST' && url.pathname === '/tabs/focus') {
      const input = await readJson(request)
      const tabId = typeof input.tabId === 'string' ? input.tabId : ''
      const found = findTab(tabId)
      if (found === undefined) {
        json(response, 404, { error: `tab ${tabId} does not exist` })
        return
      }
      const focused = await options.runtime.focus({
        target: found.tab.target,
        expectedRevision: found.tab.revision,
      })
      found.tab.revision = focused.revision
      json(response, 200, { ok: true })
      return
    }
    if (request.method === 'POST' && url.pathname === '/sessions/destroy') {
      const input = await readJson(request)
      const name = typeof input.name === 'string' ? input.name : ''
      const session = sessions.get(name)
      if (session === undefined) {
        json(response, 404, { error: `Session ${name} does not exist` })
        return
      }
      for (const tab of session.tabs.values()) {
        const state = await options.runtime.observe({ target: tab.target })
        if (state.status !== 'closed') {
          await options.runtime.close({ target: tab.target, expectedRevision: state.revision })
        }
      }
      sessions.delete(name)
      json(response, 200, { ok: true, name })
      return
    }
    json(response, 404, { error: `route not found: ${String(request.method)} ${url.pathname}` })
  }

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      const message = (error as Error).message
      json(response, 500, { error: message })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve)
  })
  const address = server.address() as { port: number }
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    tokenFile: options.tokenFile,
    close: () => new Promise<void>((resolve) => {
      server.close(() => { resolve() })
    }),
  }
}
