// Test double for the Tandem Browser HTTP API at pinned revision
// 3b613cfd4c299609ca7ca415d638c1b71c6ba5de. Response bodies mirror the real
// protocol: tab inventory objects carry id/webContentsId/title/url/favicon/
// groupId/active/createdAt/source/pinned/partition/emoji and never a loading
// field; /status carries loading and an activeTab instead. Like the real app
// a default-session tab exists from boot, so /status reports ready before any
// isolated session is created. TANDEM_FIXTURE_FAULTS injects malformed
// responses; navigating to https://crash.test/ (exit once) or
// https://die.test/ (arm create-exit, then exit once) drives the crash and
// reconnect-exhaustion modes through marker files that survive restarts, and
// https://forget.test/ drops the isolated tab from the inventory.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'

const port = Number(process.env.TANDEM_FIXTURE_PORT)
const tokenFile = process.env.TANDEM_FIXTURE_TOKEN_FILE
const crashMarker = process.env.TANDEM_FIXTURE_CRASH_MARKER
const pidFile = process.env.TANDEM_FIXTURE_PID_FILE
const faults = JSON.parse(process.env.TANDEM_FIXTURE_FAULTS ?? '{}')
if (!Number.isInteger(port) || port < 1 || tokenFile === undefined) process.exit(64)
if (faults.exitAtBoot === true) process.exit(64)

const token = faults.token === 'short' ? 'short-token' : 'fixture-token-value-with-more-than-thirty-two-bytes'
mkdirSync(dirname(tokenFile), { recursive: true })
writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 })
if (pidFile !== undefined) writeFileSync(pidFile, `${process.pid}\n`, { mode: 0o600 })

const sessions = new Map()
const persisted = new Map()
let tabSeq = 0

function inventoryTab(id, url, title, active, partition) {
  return {
    id,
    webContentsId: 7,
    title,
    url,
    favicon: '',
    groupId: null,
    active,
    createdAt: 1755432000000,
    source: 'session',
    pinned: false,
    partition,
    emoji: null,
    emojiFlash: null,
  }
}

const defaultTab = inventoryTab('tandem-default-tab', 'about:blank', 'New Tab', false, 'persist:default')

function titleFor(url) {
  if (url === 'about:blank') return 'New Tab'
  if (url === 'https://example.test/') return 'Example Domain'
  return 'Loaded page'
}

function listedTabs() {
  return [...sessions.values()].map(session => session.tab).concat(defaultTab)
}

function emptyStorage() {
  return { cookies: '', localStorage: '', indexedDb: '', cache: '', serviceWorker: '' }
}

function storageFor(token) {
  if (token.length === 0) return emptyStorage()
  return {
    cookies: `profile=${token}`,
    localStorage: token,
    indexedDb: token,
    cache: token,
    serviceWorker: token,
  }
}

function identityToken(sessionName) {
  const temporary = sessionName.match(/-tmp-\d+$/)
  if (temporary !== null) return ''
  const marker = sessionName.lastIndexOf('-')
  return marker === -1 ? sessionName : sessionName.slice(marker + 1)
}

function isTemporary(sessionName) {
  return /-tmp-\d+$/.test(sessionName)
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function body(request) {
  let value = ''
  for await (const chunk of request) value += chunk
  return value.length === 0 ? {} : JSON.parse(value)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  if (faults.slow === 'health' && url.pathname === '/agent/version') {
    await new Promise(resolve => setTimeout(resolve, 5_000))
  }
  if (url.pathname === '/agent/version') {
    if (faults.version === 'non-object') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('[]')
      return
    }
    json(response, 200, {
      name: faults.version === 'wrong-name' ? 'other-browser' : faults.version === 'missing-name' ? undefined : 'tandem-browser',
      version: faults.version === 'wrong-version' ? '1.11.5' : '1.11.4',
      capabilityFamilies: ['tabs', 'sessions'],
      transports: ['http'],
    })
    return
  }
  if (url.pathname === '/status') {
    if (faults.status === 'bad-ready') {
      json(response, 200, { ready: 'yes', tabs: listedTabs().length, version: '1.11.4' })
      return
    }
    const active = [...sessions.values()].at(-1)?.tab ?? defaultTab
    json(response, 200, {
      ready: faults.status !== 'never-ready',
      url: active.url,
      title: active.title,
      loading: false,
      activeTab: active,
      tabs: listedTabs(),
      version: '1.11.4',
    })
    return
  }
  if (request.headers.authorization !== `Bearer ${token}`) {
    json(response, 401, { error: 'Unauthorized' })
    return
  }
  if (request.method === 'POST' && url.pathname === '/sessions/create') {
    if (crashMarker !== undefined && existsSync(`${crashMarker}.die`)) process.exit(9)
    const input = await body(request)
    const sessionName = input.name
    const stored = persisted.get(sessionName)
    const initialUrl = stored?.url ?? input.url ?? 'about:blank'
    tabSeq += 1
    const base = inventoryTab(`tandem-tab-${String(tabSeq)}`, initialUrl, titleFor(initialUrl), true, `persist:session-${sessionName}`)
    const tab = faults.create === 'bad-tab-id'
      ? { ...base, id: '' }
      : faults.create === 'bad-title-type' ? { ...base, title: 7 } : base
    const session = {
      name: sessionName,
      tab: stored === undefined ? tab : { ...tab, url: stored.url, title: titleFor(stored.url) },
      storage: stored?.storage ?? emptyStorage(),
      text: stored?.text ?? '',
    }
    sessions.set(sessionName, session)
    if (faults.create === 'no-tab') {
      json(response, 200, { ok: true, name: sessionName, partition: tab.partition })
      return
    }
    json(response, 200, { ok: true, name: sessionName, partition: tab.partition, tab })
    return
  }
  if (request.method === 'POST' && url.pathname === '/navigate') {
    if (faults.slow === 'navigate') await new Promise(resolve => setTimeout(resolve, 3_000))
    if (faults.navigate === 'non-json') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('<html>not json</html>')
      return
    }
    if (faults.navigate === 'status-500') {
      json(response, 500, { error: 'internal fixture failure' })
      return
    }
    const input = await body(request)
    const session = [...sessions.values()].find(value => value.tab.id === input.tabId) ?? [...sessions.values()].at(-1)
    if (session !== undefined) {
      session.tab = { ...session.tab, url: input.url, title: titleFor(input.url) }
      if (input.url === 'https://login.test/' || input.url === 'https://example.test/') {
        session.storage = storageFor(identityToken(session.name))
      }
      if (input.url === 'https://forget.test/') sessions.delete(session.name)
    }
    json(response, 200, { ok: true, url: input.url, tab: session?.tab.id ?? input.tabId })
    if (input.url === 'https://crash.test/' && crashMarker !== undefined && !existsSync(crashMarker)) {
      writeFileSync(crashMarker, 'crashed\n')
      setTimeout(() => process.exit(17), 20)
    }
    if (input.url === 'https://die.test/' && crashMarker !== undefined && !existsSync(`${crashMarker}.die`)) {
      writeFileSync(`${crashMarker}.die`, 'armed\n')
      setTimeout(() => process.exit(17), 20)
    }
    return
  }
  if (request.method === 'GET' && url.pathname === '/tabs/list') {
    if (faults.tabsList === 'not-array') {
      json(response, 200, { tabs: {}, groups: [] })
      return
    }
    if (faults.tabsList === 'bad-tab-shape') {
      json(response, 200, { tabs: [42], groups: [] })
      return
    }
    json(response, 200, { tabs: listedTabs(), groups: [] })
    return
  }
  if (request.method === 'GET' && url.pathname === '/page-content') {
    if (faults.pageContent === 'non-object') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('"just a string"')
      return
    }
    if (faults.pageContent === 'bad-text') {
      json(response, 200, { title: 'T', url: 'https://example.test/', description: '', text: 7, length: 0 })
      return
    }
    if (faults.pageContent === 'bad-title') {
      json(response, 200, { title: null, url: '', description: '', text: '', length: 0 })
      return
    }
    const tabId = request.headers['x-tab-id']
    const session = [...sessions.values()].find(value => value.tab.id === tabId) ?? [...sessions.values()].at(-1)
    const tab = session?.tab
    const identity = session?.storage.localStorage ?? ''
    const text = tab?.url === 'https://example.test/'
      ? identity.length === 0 ? 'A real Tandem protocol page.' : `A real Tandem protocol page.\nidentity=${identity}`
      : tab?.url === 'https://login.test/'
        ? `Signed in as ${identity}.\nidentity=${identity}`
        : tab?.url === 'https://crash.test/' || tab?.url === 'https://forget.test/'
          ? 'Recovered crash page.'
          : session?.text || (identity.length === 0 ? '' : `identity=${identity}`)
    if (session !== undefined) session.text = text
    const body = {
      title: tab?.title ?? '',
      url: tab?.url ?? '',
      description: '',
      text,
      length: text.length,
    }
    if (faults.pageContent === 'seed-storage') {
      body.storage = storageFor('seeded')
    } else if (faults.pageContent !== 'omit-storage') {
      body.storage = session?.storage ?? emptyStorage()
    }
    json(response, 200, body)
    return
  }
  if (request.method === 'GET' && url.pathname === '/screenshot') {
    if (faults.screenshot === 'bad-type') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('not a screenshot')
      return
    }
    if (faults.screenshot === 'oversize-declared') {
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': '999999999' })
      response.end('x')
      return
    }
    if (faults.screenshot === 'oversize-actual') {
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end('x'.repeat(4096))
      return
    }
    response.writeHead(200, { 'content-type': 'image/png' })
    response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    return
  }
  if (request.method === 'POST' && url.pathname === '/tabs/focus') {
    json(response, 200, { ok: faults.focus !== 'ok-false' })
    return
  }
  if (request.method === 'POST' && url.pathname === '/sessions/destroy') {
    const input = await body(request)
    if (faults.destroy === '500') {
      json(response, 500, { error: 'internal fixture failure' })
      return
    }
    if (faults.destroy === 'ok-false') {
      json(response, 200, { ok: false })
      return
    }
    if (faults.destroy === 'unknown') {
      json(response, 404, { error: `Session ${input.name} does not exist` })
      return
    }
    const session = sessions.get(input.name)
    if (session === undefined) {
      json(response, 404, { error: `Session ${input.name} does not exist` })
      return
    }
    sessions.delete(input.name)
    if (isTemporary(input.name)) persisted.delete(input.name)
    else persisted.set(input.name, { url: session.tab.url, storage: session.storage, text: session.text })
    json(response, 200, { ok: true, name: input.name })
    return
  }
  json(response, 404, { error: `fixture route not found: ${request.method} ${url.pathname}` })
})

server.listen(port, '127.0.0.1')

const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
