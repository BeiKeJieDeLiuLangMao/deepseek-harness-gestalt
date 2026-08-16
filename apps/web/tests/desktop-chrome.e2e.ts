import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'

const OVERLAY = fileURLToPath(new URL('../../desktop/cordis.patch.yml', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/desktop-chrome', import.meta.url))
const UPDATE_EXPECTED = fileURLToPath(new URL('./snapshots/desktop-chrome/update.expected.md', import.meta.url))
const MODE = webSnapshotMode()

describe('web e2e: Desktop Session Surface overlay', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
    await page.addInitScript(() => {
      Object.defineProperty(window, 'dshDesktop', {
        configurable: true,
        value: {
          platform: 'darwin',
          getStatus: async () => ({ state: 'disabled', lastCheckedAt: null }),
          checkNow: () => {},
          downloadNow: () => {},
          quitAndInstall: () => {},
          onStatus: () => () => {},
          windowMinimize: () => {},
          windowMaximize: () => {},
          windowClose: () => {},
        },
      })
    })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[data-desktop-chrome="mac"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('composes the Gestalt brand, drag strip, and updater into the shipped sidebar', async () => {
    expect(await page.locator('svg text', { hasText: 'GESTALT' }).count()).toBe(1)
    expect(await page.locator('[data-desktop-chrome="mac"]').count()).toBe(1)
    const update = page.getByRole('button', { name: 'Updates disabled in development' })
    await update.waitFor({ timeout: 10_000 })
    await compareOrRefreshGolden(UPDATE_EXPECTED, await captureStableAria(
      page,
      'button[aria-label="Updates disabled in development"]',
      scaffold.workspaceCwd,
    ), MODE)
  })

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['update.expected.md'])
  })
})
