// Real Web Host, Browser Workspace RPC, and built Browser UI/workbench bundles.
// The shipped deterministic Runtime supplies page text and PNGs without network browsing.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { BrowserContext, Page, Response as BrowserResponse } from 'playwright'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type { BrowserPageState, BrowserTarget } from '@deepseek-ai/dsh-browser-runtime'
import type { Config as DeterministicBrowserConfig } from '@deepseek-ai/dsh-browser-runtime-deterministic'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  assertFixtureInventory, launchWebScaffold, seedSession,
  watchConsole, type WebScaffold,
} from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const GOLDENS = fileURLToPath(new URL('./snapshots/browser-dock', import.meta.url))
const RESTART_EVIDENCE = fileURLToPath(new URL('../../../.artifacts/browser-dock/restart.json', import.meta.url))
const SESSION_ID = SessionId('browser-dock-session')
const TITLE = 'Fixture 历史会话'
const READY = 'Browser fixture ready.'
const PAGE_URL = 'https://example.test/'

function historyFixture(): string {
  const session = Session.create(SESSION_ID)
  session.append('turn/start', { turn: 1 })
  const user = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Inspect the Browser workspace.' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('session/title', { title: TITLE, messageSeqs: [user.seq], source: { kind: 'fallback' } })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1, step: 1,
    message: createMessage({
      role: 'assistant', content: [{ type: 'text', text: READY }],
      source: { kind: 'model', provider: 'fixture', model: 'fixture' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return [
    JSON.stringify({ type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}', createdAt: 0, cwd: '{{cwd}}' }),
    ...session.snapshotEvents().map(event => JSON.stringify(event)),
    '',
  ].join('\n')
}

async function browserRpc<T>(scaffold: WebScaffold, verb: string, args: Record<string, unknown>): Promise<T> {
  const method = `browserWorkspace/${verb}`
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
  })
  expect(response.ok).toBe(true)
  const body = await response.json() as { result: RemoteResult<T> }
  if (!body.result.ok) throw new Error(`${method}: ${JSON.stringify(body.result.error)}`)
  return body.result.value
}

async function openSession(page: Page, scaffold: WebScaffold): Promise<void> {
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  const tree = page.getByRole('tree', { name: 'Sessions', exact: true })
  const group = tree.getByRole('treeitem').first()
  await group.waitFor()
  if (await group.getAttribute('aria-expanded') === 'false') await group.click()
  expect(await group.getAttribute('aria-expanded')).toBe('true')
  await tree.getByText(TITLE, { exact: true }).click()
  await page.getByText(READY, { exact: true }).waitFor()
}

async function committedPage(response: BrowserResponse): Promise<BrowserPageState> {
  expect(response.ok()).toBe(true)
  const body = await response.json() as { result: RemoteResult<BrowserPageState> }
  if (!body.result.ok) throw new Error(JSON.stringify(body.result.error))
  return body.result.value
}

interface BrowserScenario {
  scaffold: WebScaffold
  context: BrowserContext
  page: Page
  committed: BrowserPageState
}

async function withBrowserScenario(run: (scenario: BrowserScenario) => Promise<void>): Promise<void> {
  const scaffold = await launchWebScaffold({})
  let agent: AgentHandle | undefined
  try {
    await seedSession(scaffold, historyFixture(), SESSION_ID)
    agent = await scaffold.ctx.agents.resume({
      resumeSessionId: SESSION_ID,
      setup: ctx => scaffold.ctx.agentPresets.mount(ctx).then(() => undefined),
    })
    const browser = await chromium.launch()
    let failurePage: Page | undefined
    let scenario: BrowserScenario | undefined
    try {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1000 }, locale: 'en-US' })
      const tripwires: ReturnType<typeof watchConsole>[] = []
      context.on('page', (page) => { tripwires.push(watchConsole(page)) })
      const page = await context.newPage()
      failurePage = page
      await openSession(page, scaffold)
      const created = await browserRpc<BrowserPageState>(scaffold, 'create', {
        sessionId: SESSION_ID, request: { profile: 'shared' },
      })
      const committed = await browserRpc<BrowserPageState>(scaffold, 'navigate', {
        sessionId: SESSION_ID, target: created.target, expectedRevision: created.revision, url: PAGE_URL,
      })
      await expect.poll(() => pageShape(page), { timeout: 10_000 }).toContain(`address=${PAGE_URL}`)
      await page.locator('[data-dsh-toggle-cluster]').getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Expand Example Domain', exact: true }).waitFor()
      scenario = { scaffold, context, page, committed }
      await run(scenario)
      expect(tripwires.flatMap(tripwire => tripwire.pageErrors)).toEqual([])
    } catch (error) {
      const page = scenario?.page ?? failurePage
      if (page !== undefined) await saveFailureShot(page, 'browser-dock')
      throw error
    } finally {
      await browser.close()
    }
  } finally {
    try {
      await agent?.dispose()
    } finally {
      await scaffold.close()
    }
  }
}

async function previewShape(page: Page): Promise<string> {
  return await page.locator('[data-browser-preview]').evaluate(root => [
    'preview=shown',
    ...[...root.querySelectorAll('button')].map(layer =>
      `layer=${layer.hasAttribute('data-active') ? 'current' : 'back'} ${layer.getAttribute('aria-label') ?? ''}`),
  ].join('\n'))
}

async function pageShape(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const root = document.querySelector('[data-browser-page]')
    if (root === null) return 'page=hidden'
    const address = root.querySelector('input')
    return [
      'page=shown',
      `address=${address instanceof HTMLInputElement ? address.value : ''}`,
      `screenshot=${root.querySelector('img')?.getAttribute('alt') ?? 'none'}`,
    ].join('\n')
  })
}

async function openPreview(page: Page, title = 'Example Domain'): Promise<void> {
  await page.getByRole('button', { name: `Expand ${title}`, exact: true }).click()
  await page.locator('[data-browser-page]').waitFor()
}

describe('web e2e: Browser Dock preview', () => {
  it('restores the collapsed preview from the Session Browser Workspace', async () => {
    await withBrowserScenario(async ({ page }) => {
      expect(await previewShape(page)).toBe(await readFile(join(GOLDENS, 'fixture.expected.txt'), 'utf8'))
    })
  })

  it('keeps the committed page after open and Refresh', async () => {
    await withBrowserScenario(async ({ page }) => {
      await openPreview(page)
      await expect.poll(() => pageShape(page)).toContain('screenshot=Example Domain')
      const opened = await pageShape(page)
      await page.locator('[data-browser-page]').getByRole('button', { name: 'Refresh', exact: true }).click()
      await expect.poll(() => pageShape(page)).toContain(`address=${PAGE_URL}`)
      const refreshed = await pageShape(page)
      expect(refreshed).not.toContain('about:blank')
      expect(`after-open\n${opened}\nafter-refresh\n${refreshed}\n`).toBe(await readFile(join(GOLDENS, 'dock-chrome.expected.txt'), 'utf8'))
    })
  })

  it('replaces a missing Runtime page and restores its URL in the existing tab', async () => {
    await withBrowserScenario(async (scenario) => {
      const { scaffold, context } = scenario
      await expect.poll(() => scenario.page.evaluate(id =>
        localStorage.getItem(`dsh-sidebar:v1:${id}`), SESSION_ID)).toContain('"panelOpen":false')
      await scenario.page.close()
      const entry = [...scaffold.ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-browser-runtime-deterministic')
      if (entry?.id === undefined) throw new Error('deterministic Browser Runtime entry is missing')
      const previous = scaffold.ctx.browserRuntime
      await scaffold.ctx.loader.update(entry.id, {
        config: { pages: (entry.options.config as DeterministicBrowserConfig).pages, idPrefix: 'browser-restarted' },
      })
      await scaffold.ctx.loader.await()
      expect(scaffold.ctx.browserRuntime).not.toBe(previous)
      await expect(previous.observe({ target: scenario.committed.target })).rejects.toMatchObject({ code: 'BROWSER_DISPOSED' })
      await expect(scaffold.ctx.browserRuntime.observe({ target: scenario.committed.target })).rejects.toMatchObject({ code: 'BROWSER_NOT_FOUND' })
      scenario.page = await context.newPage()
      const navigation = () => scenario.page.waitForResponse(response =>
        new URL(response.url()).pathname === '/api/browserWorkspace/navigate', { timeout: 10_000 })
      const [, recoveryResponse] = await Promise.all([
        openSession(scenario.page, scaffold).then(() => openPreview(scenario.page)),
        navigation(),
      ])
      const replacement = await committedPage(recoveryResponse)
      expect(replacement.target).not.toEqual(scenario.committed.target)
      expect(replacement.target.profileId).toContain('browser-restarted')
      expect(replacement.url).toBe(PAGE_URL)
      const refreshed = navigation()
      await scenario.page.locator('[data-browser-page]').getByRole('button', { name: 'Refresh', exact: true }).click()
      const refreshedPage = await committedPage(await refreshed)
      expect(refreshedPage.target).toEqual(replacement.target)
      expect(refreshedPage.revision).toBeGreaterThan(replacement.revision)
      expect(await scaffold.ctx.browserRuntime.observe({ target: replacement.target })).toMatchObject({
        status: 'open', url: PAGE_URL, title: 'Example Domain',
      })
      await expect.poll(() => pageShape(scenario.page), { timeout: 10_000 }).toContain('screenshot=Example Domain')
      const recovered = await pageShape(scenario.page)
      expect(recovered).toContain(`address=${PAGE_URL}`)
      expect(`after-restart\n${recovered}\n`).toBe(await readFile(join(GOLDENS, 'restart-recovery.expected.txt'), 'utf8'))
      await mkdir(dirname(RESTART_EVIDENCE), { recursive: true })
      await writeFile(RESTART_EVIDENCE, JSON.stringify({
        previousTarget: scenario.committed.target, replacementTarget: replacement.target,
        restoredUrl: replacement.url, recoveryRevision: replacement.revision, refreshRevision: refreshedPage.revision,
      }, undefined, 2) + '\n')
    })
  })

  it('recovers a stale close revision through observe and retry', async () => {
    await withBrowserScenario(async ({ page, scaffold }) => {
      await openPreview(page)
      const revisions: number[] = []
      await page.route('**/api/browserWorkspace/close', async (route) => {
        const envelope = route.request().postDataJSON() as {
          payload: { args: { sessionId: string; target: BrowserTarget; expectedRevision: number } }
        }
        const args = envelope.payload.args
        revisions.push(args.expectedRevision)
        if (revisions.length === 1) {
          await browserRpc<BrowserPageState>(scaffold, 'navigate', { ...args, url: PAGE_URL })
        }
        await route.continue()
      })
      const close = page.locator('[data-dsh-better-sidebar]').getByRole('button', { name: 'Close', exact: true })
      expect(await close.count()).toBe(1)
      await close.click()
      await expect.poll(() => revisions.length).toBe(2)
      expect(revisions[1]).toBe(revisions[0]! + 1)
      await expect.poll(() => pageShape(page)).toBe('page=hidden')
      expect(await close.count()).toBe(0)
      expect('page=hidden\nbrowser-tab=hidden\n').toBe(await readFile(join(GOLDENS, 'stale-close.expected.txt'), 'utf8'))
      await assertFixtureInventory(GOLDENS, [
        'fixture.expected.txt', 'dock-chrome.expected.txt', 'restart-recovery.expected.txt', 'stale-close.expected.txt',
      ])
    })
  })
})
