import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BrowserProfileName } from '@deepseek-ai/dsh-browser-runtime'
import ElectronBrowserRuntime, { isElectronProcess } from '@deepseek-ai/dsh-browser-runtime-electron'

// Real-runtime check against this process's Electron. Self-skips on Node
// because spawning a second Electron application (including Tandem.app) is
// out of scope; the unit suite covers the same operations through an injected
// Electron host.
const electronAvailable = isElectronProcess()
const REAL_PAGE = 'https://example.com/'
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
})

describe.skipIf(!electronAvailable)('Electron Browser Runtime real-runtime e2e', () => {
  it('drives one real page through in-process Electron webContents', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'dsh-electron-runtime-e2e-'))
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(ElectronBrowserRuntime, {
      idPrefix: 'electron-e2e',
      requestTimeoutMs: 30_000,
    })

    const created = await ctx.browserRuntime.create({ profile: 'temporary' })
    expect(created).toMatchObject({
      status: 'open',
      revision: 0,
      chrome: { kind: 'temporary', partition: 'session-electron-e2e-tmp-1' },
    })
    const navigated = await ctx.browserRuntime.navigate({
      target: created.target,
      expectedRevision: created.revision,
      url: REAL_PAGE,
    })
    expect(navigated).toMatchObject({ status: 'open', revision: 1, url: REAL_PAGE })
    expect(typeof navigated.title).toBe('string')
    expect(await ctx.browserRuntime.observe({ target: created.target })).toEqual(navigated)
    const shot = await ctx.browserRuntime.screenshot({ target: created.target })
    expect(shot).toMatchObject({ revision: 1, url: REAL_PAGE, mediaType: 'image/png' })
    expect(shot.data.length).toBeGreaterThan(0)
    const focused = await ctx.browserRuntime.focus({ target: created.target, expectedRevision: 1 })
    expect(focused).toMatchObject({ revision: 2, focused: true, controlOwner: 'agent' })
    const taken = await ctx.browserRuntime.takeover({ target: created.target, expectedRevision: 2 })
    expect(taken).toMatchObject({ revision: 3, controlOwner: 'human', target: created.target })
    const returned = await ctx.browserRuntime.returnControl({
      target: created.target,
      expectedRevision: taken.revision,
    })
    expect(returned).toMatchObject({ revision: 4, controlOwner: 'agent', target: created.target })
    const closed = await ctx.browserRuntime.close({ target: created.target, expectedRevision: returned.revision })
    expect(closed).toEqual({ status: 'closed', target: created.target, revision: 5 })
    await rm(userData, { recursive: true, force: true })
  }, 120_000)

  it('types a newline and a non-BMP character and isolates cookies across partitions', async () => {
    const pages = await serveLocalPages()
    const ctx = new Context()
    contexts.push(ctx)
    try {
      await ctx.plugin(ElectronBrowserRuntime, {
        idPrefix: 'electron-e2e-input',
        requestTimeoutMs: 30_000,
      })
      const created = await ctx.browserRuntime.create({ profile: 'temporary' })
      const form = await ctx.browserRuntime.navigate({
        target: created.target,
        expectedRevision: created.revision,
        url: `${pages.origin}/form`,
      })
      const typed = await ctx.browserRuntime.input({
        target: created.target,
        expectedRevision: form.revision,
        text: 'line\n👍',
      })
      expect(typed.text).toContain('line')
      expect(typed.text).toContain('\n')
      expect(typed.text).toContain('👍')

      const work = await ctx.browserRuntime.create({
        profile: 'persistent',
        name: BrowserProfileName('work'),
      })
      const workSet = await ctx.browserRuntime.navigate({
        target: work.target,
        expectedRevision: work.revision,
        url: `${pages.origin}/cookie?name=work`,
      })
      expect(workSet.text).toContain('iso=work')
      const personal = await ctx.browserRuntime.create({
        profile: 'persistent',
        name: BrowserProfileName('personal'),
      })
      const personalSet = await ctx.browserRuntime.navigate({
        target: personal.target,
        expectedRevision: personal.revision,
        url: `${pages.origin}/cookie?name=personal`,
      })
      expect(personalSet.text).toContain('iso=personal')
      const workRead = await ctx.browserRuntime.navigate({
        target: work.target,
        expectedRevision: workSet.revision,
        url: `${pages.origin}/cookie-read`,
      })
      expect(workRead.text).toContain('iso=work')
      expect(workRead.text).not.toContain('iso=personal')
      const personalRead = await ctx.browserRuntime.navigate({
        target: personal.target,
        expectedRevision: personalSet.revision,
        url: `${pages.origin}/cookie-read`,
      })
      expect(personalRead.text).toContain('iso=personal')
      expect(personalRead.text).not.toContain('iso=work')
    } finally {
      await pages.close()
    }
  }, 120_000)
})

describe.skipIf(electronAvailable)('Electron Browser Runtime real-runtime e2e skip', () => {
  it('records the named Node skip reason without spawning Tandem', () => {
    expect(isElectronProcess()).toBe(false)
  })
})

/** Local pages for input and cookie-isolation checks. */
async function serveLocalPages(): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/form') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html><html><body>
<textarea id="box" autofocus></textarea>
<pre id="out"></pre>
<script>
const box = document.getElementById('box')
const out = document.getElementById('out')
const sync = () => { out.textContent = box.value }
box.addEventListener('input', sync)
</script>
</body></html>`)
      return
    }
    if (url.pathname === '/cookie') {
      const name = url.searchParams.get('name') ?? 'anon'
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': `iso=${name}; Path=/`,
      })
      response.end(`<!doctype html><html><body><pre id="out"></pre>
<script>document.getElementById('out').textContent = document.cookie</script>
</body></html>`)
      return
    }
    if (url.pathname === '/cookie-read') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html><html><body><pre id="out"></pre>
<script>document.getElementById('out').textContent = document.cookie</script>
</body></html>`)
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected TCP test port')
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    }),
  }
}
