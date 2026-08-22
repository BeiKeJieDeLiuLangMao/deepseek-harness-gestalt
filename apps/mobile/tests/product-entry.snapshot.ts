import { once } from 'node:events'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const EXPECTED = fileURLToPath(new URL('../snapshots/product-entry.expected.txt', import.meta.url))
let preview: ChildProcess | undefined
let browser: Browser | undefined
let origin = ''
let previewClosed: Promise<unknown> | undefined
let previewStdout: Promise<void> | undefined
let previewStderr: Promise<void> | undefined

const BUILD_ENV = {
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
  VITE_MOBILE_PRESENTATION_EXAMPLE: '1',
}

function drain(stream: Readable | null): Promise<void> {
  if (stream === null) return Promise.resolve()
  stream.resume()
  return new Promise((resolve, reject) => {
    stream.once('end', resolve)
    stream.once('error', reject)
  })
}

async function settlesWithin(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => { resolve(false) }, milliseconds) })
  const settled = await Promise.race([promise.then(() => true), timeout])
  if (timer !== undefined) clearTimeout(timer)
  return settled
}

function signalPreview(signal: NodeJS.Signals): void {
  if (preview?.pid === undefined || preview.exitCode !== null || preview.signalCode !== null) return
  if (process.platform === 'win32') {
    preview.kill(signal)
    return
  }
  try {
    process.kill(-preview.pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

async function processGroupExited(pid: number): Promise<boolean> {
  if (process.platform === 'win32') return true
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      process.kill(-pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return false
}

async function stopPreview(): Promise<void> {
  if (preview === undefined || previewClosed === undefined) return
  const pid = preview.pid
  if (preview.exitCode === null && preview.signalCode === null) signalPreview('SIGTERM')
  if (!await settlesWithin(previewClosed, 3_000)) signalPreview('SIGKILL')
  if (!await settlesWithin(previewClosed, 5_000)) throw new Error('Mobile preview did not close after SIGKILL')
  if (pid !== undefined && !await processGroupExited(pid)) {
    throw new Error('Mobile preview process tree remained alive after close')
  }
  await Promise.all([previewStdout, previewStderr])
}

async function availablePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Mobile snapshot could not reserve a loopback port')
  await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  return address.port
}

async function waitForPreview(url: string): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The preview process is still binding the loopback socket.
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Mobile preview did not become ready at ${url}`)
}

beforeAll(async () => {
  const build = spawnSync('pnpm', ['--filter', '@deepseek-ai/dsh-mobile', 'build'], {
    cwd: REPO,
    env: { ...process.env, ...BUILD_ENV },
    encoding: 'utf8',
  })
  if (build.status !== 0) throw new Error(`Mobile product build failed:\n${build.stdout}\n${build.stderr}`)
  const port = await availablePort()
  if (port === 5173 || port === 5174) throw new Error('Mobile product snapshot reserved a prohibited prototype port')
  origin = `http://127.0.0.1:${String(port)}`
  preview = spawn('pnpm', [
    '--filter', '@deepseek-ai/dsh-mobile', 'exec', 'vite', 'preview',
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  previewClosed = once(preview, 'close')
  previewStdout = drain(preview.stdout)
  previewStderr = drain(preview.stderr)
  await waitForPreview(origin)
  const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
  browser = await chromium.launch(executablePath === undefined ? { headless: true } : { headless: true, executablePath })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await stopPreview()
})

async function mobilePage(options: { locale: string; colorScheme: 'light' | 'dark' }): Promise<{
  context: BrowserContext
  page: Page
}> {
  if (browser === undefined) throw new Error('Mobile snapshot browser unavailable')
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: options.locale,
    colorScheme: options.colorScheme,
  })
  await context.route('https://dev.example/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const now = Date.now()
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-dsh-installation-proof',
        },
      })
      return
    }
    if (path === '/v1/account/login-attempts') {
      await route.fulfill({ headers: { 'access-control-allow-origin': origin }, json: {
        id: 'mobile-snapshot-attempt',
        state: 'mobile-snapshot-state',
        authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=mobile-development&state=mobile-snapshot-state',
        pollingToken: 'mobile-snapshot-token',
        expiresAt: now + 300_000,
      } })
      return
    }
    if (path === '/v1/account/login-poll') {
      await route.fulfill({ headers: { 'access-control-allow-origin': origin }, json: {
        status: 'complete',
        sessionId: 'mobile-snapshot-session',
        account: { id: 'mobile-snapshot-account', githubId: 220, githubLogin: 'snapshot-user', avatarUrl: 'https://avatars.example/snapshot-user' },
        accessToken: 'snapshot-access-token',
        refreshToken: 'snapshot-refresh-token',
        accessExpiresAt: now + 900_000,
        refreshExpiresAt: now + 2_592_000_000,
      } })
      return
    }
    await route.fulfill({ status: 404, body: 'unexpected snapshot route' })
  })
  await context.route('https://github.com/**', route => route.fulfill({ status: 200, body: 'OAuth window owned by the keyless snapshot' }))
  const page = await context.newPage()
  await page.goto(origin)
  await page.getByRole('checkbox').check()
  const login = page.getByRole('button', { name: '使用 GitHub 继续' })
  await expect.poll(async () => ({
    enabled: await login.isEnabled(),
    status: await page.locator('[data-mobile-platform-account]').getAttribute('data-mobile-platform-account'),
    alerts: await page.getByRole('alert').allTextContents(),
  }), { timeout: 10_000 }).toEqual({ enabled: true, status: 'ready', alerts: [] })
  await login.click()
  await expect.poll(
    async () => await page.locator('[data-mobile-platform-account]').getAttribute('data-mobile-platform-account'),
    { timeout: 10_000 },
  ).toBe('signed-in')
  await page.getByRole('button', { name: /Shared Web presentation/ }).click()
  await expect.poll(async () => await page.locator('[data-mobile-conversation="detail"]').count()).toBe(1)
  return { context, page }
}

describe('bundled Mobile product entry', () => {
  it('renders the authoritative conversation in English dark mode without narrow overflow', async () => {
    const { context, page } = await mobilePage({ locale: 'en-US', colorScheme: 'dark' })
    const conversation = page.locator('[data-mobile-conversation="detail"]')
    await expect.poll(async () => await page.getByAltText('shared-image.gif').count()).toBe(1)
    expect(await conversation.getAttribute('lang')).toBe('en')
    expect(await conversation.getAttribute('data-theme')).toBe('dark')
    expect(await conversation.getAttribute('data-ds-dark-theme')).not.toBeNull()
    expect(await page.locator('[data-toolview="file-mutation"] [data-tool="edit"]').count()).toBe(1)
    expect(await page.locator('[data-toolview="bash"] [data-sample="bash"]').count()).toBe(1)
    expect(await page.locator('[data-toolview="generic"] [data-tool="future_tool"]').count()).toBe(1)
    expect(await page.getByText('Host rejected request').count()).toBe(1)
    await page.locator('[data-toolview="file-mutation"] [data-expandable]').click()
    expect(await page.locator('[data-diff]').count()).toBe(1)
    const overflows = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      conversation: document.querySelector<HTMLElement>('[data-mobile-conversation="detail"]')!.scrollWidth
        - document.querySelector<HTMLElement>('[data-mobile-conversation="detail"]')!.clientWidth,
    }))
    expect(overflows).toEqual({ document: 0, conversation: 0 })
    const text = (await conversation.innerText()).replace(/[ \t]+$/gm, '').trimEnd() + '\n'
    await expect(text).toMatchFileSnapshot(EXPECTED)
    expect(page.url()).not.toMatch(/:517[34](?:\/|$)/)
    await context.close()
  })

  it('renders the same authoritative conversation in Chinese light mode', async () => {
    const { context, page } = await mobilePage({ locale: 'zh-CN', colorScheme: 'light' })
    const conversation = page.locator('[data-mobile-conversation="detail"]')
    expect(await conversation.getAttribute('lang')).toBe('zh-CN')
    expect(await conversation.getAttribute('data-theme')).toBe('light')
    expect(await conversation.getAttribute('data-ds-dark-theme')).toBeNull()
    expect(await page.getByRole('button', { name: '返回' }).count()).toBe(1)
    expect(await page.getByText('HOST_400').count()).toBe(1)
    expect(await page.getByAltText('shared-image.gif').count()).toBe(1)
    await context.close()
  })
})
