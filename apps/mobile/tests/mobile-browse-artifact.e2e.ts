import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { build, normalizePath, preview, type Plugin, type PreviewServer } from 'vite'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const MOBILE_ROOT = normalizePath(resolve(fileURLToPath(new URL('..', import.meta.url))))
const DESKTOP_MANIFEST = normalizePath(fileURLToPath(new URL('../../desktop/package.json', import.meta.url)))
const FIXTURE_ENTRY = normalizePath(fileURLToPath(new URL('./mobile-browse-artifact.fixture.tsx', import.meta.url)))
const MOBILE_JS = normalizePath(fileURLToPath(new URL('../lib/MobileBrowse.js', import.meta.url)))
const MOBILE_CSS = normalizePath(fileURLToPath(new URL('../lib/src/MobileBrowse.module.css', import.meta.url)))
const MOBILE_CSS_IMPORT = './src/MobileBrowse.module.css'
const CLIENT_RUNTIME_SOURCE = normalizePath(fileURLToPath(new URL('../../../packages/client/runtime/lib/types/client/index.js', import.meta.url)))
const desktopRequire = createRequire(DESKTOP_MANIFEST)
const fixtureSource = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MobileBrowse } from '#testing/mobile/MobileBrowse'
const sessions = { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }
const search = { query: '', status: 'idle', items: [], hasMore: false }
const clock = { subscribe: () => () => {}, getSnapshot: () => 0 }
createRoot(document.getElementById('root')).render(React.createElement(MobileBrowse, {
  desktopName: 'Artifact Desktop', connection: 'online', onOpenAccount() {}, sessions, workspaces: [],
  conversations: {}, locale: 'en', theme: 'light', loadImage: async () => '', canMutate: true, clock, search,
}))
`
let root = ''
let server: PreviewServer | undefined
let browser: Browser | undefined
let origin = ''

function artifactResolutionGuard(): Plugin {
  return {
    name: 'dsh-mobile-artifact-resolution-guard',
    enforce: 'pre',
    load(id) {
      if (id === FIXTURE_ENTRY) return fixtureSource
      if (id.startsWith(`${MOBILE_ROOT}/src/`)) throw new Error(`Mobile artifact smoke loaded source module ${id}`)
      return null
    },
    transform(code, id) {
      if (id.startsWith(`${MOBILE_ROOT}/src/`)) throw new Error(`Mobile artifact smoke transformed source module ${id}`)
      if (id === MOBILE_JS && !code.includes(MOBILE_CSS_IMPORT)) {
        throw new Error('MobileBrowse artifact lost its relative stylesheet import')
      }
      return null
    },
    async resolveId(source, importer, options) {
      if (source === FIXTURE_ENTRY) return FIXTURE_ENTRY
      if (source === '@deepseek-ai/dsh-client-runtime/client') return CLIENT_RUNTIME_SOURCE
      if (source === '#testing/mobile/MobileBrowse') {
        const resolved = normalizePath(desktopRequire.resolve(source))
        if (resolved !== MOBILE_JS) throw new Error(`Desktop import map resolved MobileBrowse to ${resolved}, expected ${MOBILE_JS}`)
        return resolved
      }
      if (source !== MOBILE_CSS_IMPORT || importer !== MOBILE_JS) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved === null || normalizePath(resolved.id) !== MOBILE_CSS) {
        throw new Error(`MobileBrowse stylesheet resolved to ${resolved?.id ?? 'nothing'}, expected ${MOBILE_CSS}`)
      }
      return resolved
    },
  }
}

beforeAll(async () => {
  root = await mkdtemp(join(MOBILE_ROOT, '.mobile-artifact-smoke-'))
  await writeFile(join(root, 'index.html'), `<div id="root"></div><script type="module" src="${FIXTURE_ENTRY}"></script>\n`)
  await build({
    root,
    configFile: false,
    plugins: [artifactResolutionGuard()],
    build: { outDir: join(root, 'dist'), emptyOutDir: true, target: 'chrome83' },
  })
  server = await preview({ root, configFile: false, preview: { host: '127.0.0.1', port: 0 }, build: { outDir: join(root, 'dist') } })
  const address = server.httpServer.address()
  if (address === null || typeof address === 'string') throw new Error('Mobile artifact preview did not bind TCP')
  origin = `http://127.0.0.1:${String(address.port)}`
}, 120_000)

afterEach(async () => {
  const owned = browser
  browser = undefined
  await owned?.close()
})

afterAll(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve, reject) => {
      server?.httpServer.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })
  }
  if (root !== '') await rm(root, { recursive: true, force: true })
})

describe('MobileBrowse built artifact', () => {
  it('renders its emitted CSS Module through the Desktop import map', async () => {
    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined
      ? { headless: true, timeout: 15_000 }
      : { headless: true, executablePath, timeout: 15_000 })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => { errors.push(error.message) })
    await page.goto(origin)
    const surface = page.locator('[data-mobile-browse="list"]')
    await page.waitForTimeout(1_000)
    expect({ count: await surface.count(), errors }).toEqual({ count: 1, errors: [] })
    const evidence = await surface.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        className: element.getAttribute('class') ?? '',
        display: style.display,
        flexDirection: style.flexDirection,
        maxWidth: style.maxWidth,
        boxSizing: style.boxSizing,
      }
    })
    expect(evidence.className).toMatch(/\S/u)
    expect(evidence).toMatchObject({ display: 'flex', flexDirection: 'column', maxWidth: '430px', boxSizing: 'border-box' })
    expect(errors).toEqual([])
  }, 30_000)
})
