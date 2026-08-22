import { once } from 'node:events'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const EXPECTED = fileURLToPath(new URL('../snapshots/product-entry.expected.txt', import.meta.url))
let preview: ChildProcess | undefined
let browser: Browser | undefined
let origin = ''

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
  ], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
  await waitForPreview(origin)
  const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
  browser = await chromium.launch(executablePath === undefined ? { headless: true } : { headless: true, executablePath })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  if (preview !== undefined && preview.exitCode === null) {
    preview.kill('SIGTERM')
    await Promise.race([once(preview, 'exit'), new Promise(resolve => setTimeout(resolve, 5_000))])
  }
})

describe('bundled Mobile product entry', () => {
  it('loads the production entry and matches its keyless account snapshot', async () => {
    if (browser === undefined) throw new Error('Mobile snapshot browser unavailable')
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(origin)
    const main = page.locator('[data-mobile-platform-account]')
    await expect.poll(async () => await main.getAttribute('data-mobile-platform-account')).toBe('idle')
    const text = (await main.innerText()).replace(/[ \t]+$/gm, '').trimEnd() + '\n'
    await expect(text).toMatchFileSnapshot(EXPECTED)
    expect(page.url()).not.toMatch(/:517[34](?:\/|$)/)
    expect(await page.locator('[data-mobile-conversation]').count()).toBe(0)
    await page.close()
  })
})
