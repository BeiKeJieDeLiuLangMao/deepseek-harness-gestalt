import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
// Empty type imports carry the agents, presets, and tools Context merges.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-tools'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  fixtureUserPrompts, launchWebScaffold, selectedSessionFixture, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, writeComposerDraft } from './support.ts'

type SettingsRequest = { kind: 'settings'; requestId: string; sectionId?: string }
type SettingsResult = { type: 'close'; requestId: string }
interface SettingsPreloadFixture {
  readonly chromeOverlayShow: (request: SettingsRequest) => Promise<void>
  chromeOverlayResult(result: SettingsResult): void
  onChromeOverlayResult(listener: (result: SettingsResult) => void): () => void
}

const DESKTOP_BRIDGE_FIXTURE = fileURLToPath(
  new URL('../../../packages/client/ui-desktop/tests/desktop-bridge-fixture.client.ts', import.meta.url),
)

const OVERLAY = fileURLToPath(new URL('../../desktop/cordis.patch.yml', import.meta.url))
const DESKTOP_INSTALL_ANCHOR = fileURLToPath(new URL('../../desktop/package.json', import.meta.url))
const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/desktop-chrome/session.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/desktop-chrome', import.meta.url))
const INACTIVE_EXPECTED = fileURLToPath(new URL('./snapshots/desktop-chrome/inactive.expected.md', import.meta.url))
const MENU_EXPECTED = fileURLToPath(new URL('./snapshots/desktop-chrome/overlay-menu.expected.md', import.meta.url))
const SETTINGS_EXPECTED = fileURLToPath(new URL('./snapshots/desktop-chrome/overlay-settings.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const PROMPT = 'Reply with the single word LIGHTHOUSE and stop.'

async function openDesktopPage(
  browser: Browser, authenticatedUrl: string, platform: 'darwin' | 'win32', overlay = false,
): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  // Dynamic import keeps this host-plane spec from loading packages/client/*/src.
  const { installDesktopBridgeFixture } = await import(pathToFileURL(DESKTOP_BRIDGE_FIXTURE).href) as {
    installDesktopBridgeFixture: (platform: 'darwin' | 'win32') => void
  }
  await page.addInitScript(installDesktopBridgeFixture, platform)
  const login = await page.request.get(authenticatedUrl)
  expect(login.ok()).toBe(true)
  const target = new URL('/', authenticatedUrl)
  if (overlay) target.searchParams.set('dsh-desktop-overlay', '1')
  await page.goto(target.href, { waitUntil: 'load' })
  await page.waitForSelector(
    overlay
      ? '[data-dsh-desktop-overlay-root], html[data-dsh-desktop-overlay]'
      : `[data-desktop-chrome="${platform === 'darwin' ? 'mac' : 'win'}"]`,
    { timeout: 30_000 },
  )
  return page
}

async function sessionSurfaceGeometry(page: Page): Promise<{
  inset: number
  paddingTop: number
  chrome: string | null
}> {
  return await page.locator('[data-phase="active"]').first().evaluate((surface) => {
    const frame = surface.closest('[style*="grid-template-columns"]')
    let center = surface.parentElement
    while (center !== null && center.parentElement !== frame) center = center.parentElement
    if (center === null || frame === null) throw new Error('assembled Session Surface geometry is unavailable')
    return {
      inset: Math.round(surface.getBoundingClientRect().top - frame.getBoundingClientRect().top),
      paddingTop: Number.parseFloat(getComputedStyle(center).paddingTop),
      chrome: frame.querySelector('[data-desktop-chrome]')?.getAttribute('data-desktop-chrome') ?? null,
    }
  })
}

describe('web e2e: Desktop Session Surface overlay', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let macPage: Page
  let winPage: Page

  beforeAll(async () => {
    const fixture = await readFile(await selectedSessionFixture(FIXTURE), 'utf8')
    expect(fixtureUserPrompts(fixture)).toEqual([PROMPT])
    scaffold = await launchWebScaffold({
      extraOverlayPath: OVERLAY,
      extraInstallAnchors: [DESKTOP_INSTALL_ANCHOR],
      replayFixture: FIXTURE,
      paceMs: 5,
    })
    browser = await chromium.launch()
    macPage = await openDesktopPage(browser, scaffold.authenticatedUrl, 'darwin')
    await connectFreshWorkspace(macPage, scaffold.workspaceCwd)
    const input = macPage.locator('[data-composer-input]').first()
    await writeComposerDraft(macPage, input, PROMPT)
    const settled = scaffold.whenTurnSettled()
    await Promise.all([input.press('Enter'), settled])
    await macPage.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    await macPage.getByText('Standard mode', { exact: true }).waitFor({ timeout: 15_000 })

    winPage = await openDesktopPage(browser, scaffold.authenticatedUrl, 'win32')
    await winPage.locator('[role="treeitem"]').filter({ hasText: 'Reply with the single word' }).first().click()
    await winPage.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    await winPage.getByText('Standard mode', { exact: true }).waitFor({ timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('composes the Gestalt brand and drag strip without an inactive updater control', async () => {
    expect(await macPage.locator('svg text', { hasText: 'GESTALT' }).count()).toBe(1)
    expect(await macPage.locator('[data-desktop-chrome="mac"]').count()).toBe(1)
    expect(await macPage.getByRole('button', { name: 'Updates disabled in development' }).count()).toBe(0)
    await compareOrRefreshGolden(INACTIVE_EXPECTED, await captureStableAria(
      macPage,
      '[class*="footArea"]',
      scaffold.workspaceCwd,
    ), MODE)
  })

  it('gives a fresh Desktop Session the Schedule tools', async () => {
    const ctx = scaffold.ctx
    const handle = await ctx.agents.create({
      sessionId: SessionId('desktop-schedule-default'),
      meta: { cwd: scaffold.workspaceCwd },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx).then(() => undefined),
    })
    try {
      expect(ctx.tools.schemas(handle.agent)
        .map(schema => schema.name)
        .filter(name => name.startsWith('schedule_'))
        .sort()).toEqual(['schedule_create', 'schedule_delete', 'schedule_list'])
    } finally {
      await handle.dispose()
    }
  })

  it('insets the active Session Surface below the Desktop drag strip', async () => {
    expect(await sessionSurfaceGeometry(macPage)).toEqual({
      inset: 36,
      paddingTop: 36,
      chrome: 'mac',
    })
    expect(await sessionSurfaceGeometry(winPage)).toEqual({
      inset: 36,
      paddingTop: 36,
      chrome: 'win',
    })
  })

  it('renders a native menu and reports Side Chat selection from the overlay document', async () => {
    const page = await openDesktopPage(browser, scaffold.authenticatedUrl, 'darwin', true)
    const replies: unknown[] = []
    try {
      await page.exposeFunction('recordOverlayReply', (reply: unknown) => { replies.push(reply) })
      await page.evaluate(async () => {
        const bridge = (globalThis as unknown as {
          dshDesktop: {
            chromeOverlayShow(request: unknown): Promise<void>
            onChromeOverlayResult(listener: (reply: unknown) => void): () => void
          }
        }).dshDesktop
        bridge.onChromeOverlayResult((reply) => {
          void (globalThis as unknown as { recordOverlayReply(reply: unknown): Promise<void> }).recordOverlayReply(reply)
        })
        await bridge.chromeOverlayShow({
          kind: 'menu',
          requestId: 'overlay-menu',
          items: [{ id: 'sidechat', label: 'Side Chat', icon: 'sidechat' }],
          anchor: { x: 600, y: 36, width: 24, height: 24 },
        })
      })
      await page.getByRole('menuitem', { name: 'Side Chat', exact: true }).waitFor({ timeout: 10_000 })
      await compareOrRefreshGolden(MENU_EXPECTED, await captureStableAria(
        page, '[role="menu"]', scaffold.workspaceCwd,
      ), MODE)
      await page.getByRole('menuitem', { name: 'Side Chat', exact: true }).click()
      await expect.poll(() => replies).toEqual([{ type: 'select', requestId: 'overlay-menu', id: 'sidechat' }])
      await page.getByRole('menu').waitFor({ state: 'hidden' })

      expect(await macPage.locator('html[data-dsh-desktop-overlay]').count()).toBe(0)
    } finally {
      await page.close()
    }
  })

  it('opens the same fullscreen Settings through native chrome and returns its close result', async () => {
    const overlay = await openDesktopPage(browser, scaffold.authenticatedUrl, 'darwin', true)
    const requests: SettingsRequest[] = []
    const replies: SettingsResult[] = []
    try {
      await macPage.exposeFunction('forwardSettingsRequest', async (request: SettingsRequest) => {
        requests.push(request)
        await overlay.evaluate(async (value) => {
          await (globalThis as unknown as { dshDesktop: SettingsPreloadFixture }).dshDesktop.chromeOverlayShow(value)
        }, request)
      })
      await overlay.exposeFunction('returnSettingsReply', async (reply: SettingsResult) => {
        replies.push(reply)
        await macPage.evaluate((value) => {
          (globalThis as unknown as { dshDesktop: SettingsPreloadFixture }).dshDesktop.chromeOverlayResult(value)
        }, reply)
      })
      await macPage.evaluate(() => {
        const bridge = (globalThis as unknown as { dshDesktop: SettingsPreloadFixture }).dshDesktop
        const show = bridge.chromeOverlayShow
        Object.defineProperty(bridge, 'chromeOverlayShow', { value: async (request: SettingsRequest) => {
          await show(request)
          await (globalThis as unknown as { forwardSettingsRequest(value: SettingsRequest): Promise<void> })
            .forwardSettingsRequest(request)
        } })
      })
      await overlay.evaluate(() => {
        (globalThis as unknown as { dshDesktop: SettingsPreloadFixture }).dshDesktop.onChromeOverlayResult((reply) => {
          void (globalThis as unknown as { returnSettingsReply(value: SettingsResult): Promise<void> })
            .returnSettingsReply(reply)
        })
      })
      const trigger = macPage.getByRole('button', { name: 'Settings', exact: true })
      const dialog = overlay.getByRole('dialog', { name: 'Settings', exact: true })
      await trigger.click()
      await dialog.waitFor({ timeout: 10_000 })
      expect(await macPage.getByRole('dialog', { name: 'Settings', exact: true }).count()).toBe(0)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.kind).toBe('settings')
      expect(await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return [rect.x, rect.y, rect.width, rect.height, window.innerWidth, window.innerHeight]
      })).toEqual([0, 0, 1280, 800, 1280, 800])
      await dialog.getByRole('button', { name: 'Models', exact: true }).click()
      await dialog.getByRole('button', { name: 'Add a custom provider', exact: true }).waitFor()
      await compareOrRefreshGolden(SETTINGS_EXPECTED, await captureStableAria(
        overlay, '[role="dialog"]', scaffold.workspaceCwd,
      ), MODE)
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      await expect.poll(() => replies).toEqual([{ type: 'close', requestId: requests[0]!.requestId }])
      await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false')
      expect(await trigger.evaluate(element => document.activeElement === element)).toBe(true)
      await trigger.click()
      await dialog.waitFor()
      await overlay.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await expect.poll(() => replies).toEqual([
        { type: 'close', requestId: requests[0]!.requestId },
        { type: 'close', requestId: requests[1]!.requestId },
      ])
      expect(requests[1]!.requestId).not.toBe(requests[0]!.requestId)
    } finally {
      await overlay.close()
    }
  })

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['inactive.expected.md', 'overlay-menu.expected.md', 'overlay-settings.expected.md'])
    await assertFixtureInventory(fileURLToPath(new URL('../../../snapshots/web/desktop-chrome', import.meta.url)), [
      'session.jsonl', 'system-prompt.expected.md', 'tool-schemas.expected.json',
    ])
  })
})
