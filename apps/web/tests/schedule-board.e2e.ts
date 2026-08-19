// Keyless assembled Desktop coverage for the Session Schedule board. The
// fixture contains only durable Schedule events; the browser receives the
// independent projection and mutations cross the generated Remote gateway.
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type {} from '@deepseek-ai/dsh-schedule'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria,
  compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { REPO_ROOT, saveFailureShot } from './support.ts'

const OVERLAY = fileURLToPath(new URL('../../desktop/cordis.patch.yml', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/schedule-board', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const BOARD_EXPECTED = join(SNAPSHOT_DIR, 'board.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'schedule-board-web-e2e'

async function openSeed(page: Page): Promise<void> {
  const groupRow = page.locator('[role="treeitem"]').first()
  await groupRow.waitFor({ timeout: 15_000 })
  await groupRow.click()
  const sessionRow = page.locator('[role="treeitem"]').nth(1)
  await sessionRow.waitFor({ timeout: 10_000 })
  await sessionRow.click()
}

describe.skipIf(MODE === 'record')('web e2e: Desktop Session Schedule board', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    // Pin the browser zone so scheduledAt instants keep the same AM/PM as the
    // golden on UTC CI runners and on developer hosts.
    page = await browser.newPage({
      viewport: { width: 1680, height: 1000 },
      locale: 'en-US',
      timezoneId: 'Asia/Shanghai',
    })
    await page.addInitScript(() => {
      const browserNow = Date.parse('2100-01-01T12:00:00.000Z')
      Date.now = () => browserNow
    })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSeed(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the independent durable projection with the confirmed A-variant states', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-schedule-board'))
    const trigger = page.getByRole('button', { name: '2 scheduled tasks waiting' })
    await trigger.waitFor({ timeout: 15_000 })
    await trigger.click()
    await page.getByRole('list', { name: 'Scheduled tasks' }).waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(page, 'section[aria-label="Scheduled tasks"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(BOARD_EXPECTED, snapshot, MODE)
    mkdirSync(join(REPO_ROOT, '.artifacts'), { recursive: true })
    await page.screenshot({ path: join(REPO_ROOT, '.artifacts', 'issue-25-schedule-board.png') })
  }, 60_000)

  it('persists pause across reload, then resumes and deletes through Remote mutations', async () => {
    await page.getByRole('button', { name: 'Pause Audit CI' }).click()
    await page.getByRole('button', { name: '1 scheduled task waiting' }).waitFor({ timeout: 10_000 })
    await expect.poll(() => page.locator('[role="treeitem"]').nth(1).isVisible()).toBe(true)
    await expect.poll(() => page.locator('textarea').isEnabled()).toBe(true)

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const pausedTrigger = page.getByRole('button', { name: '1 scheduled task waiting' })
    await pausedTrigger.waitFor({ timeout: 15_000 })
    await pausedTrigger.click()
    await page.getByRole('button', { name: 'Resume Audit CI' }).click()
    const resumedTrigger = page.getByRole('button', { name: '2 scheduled tasks waiting' })
    await resumedTrigger.waitFor({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Delete Paused review' }).click()
    expect(await page.getByText('Delete this task?').count()).toBe(1)
    await page.getByRole('button', { name: 'Confirm deleting Paused review' }).click()
    await expect.poll(() => page.getByText('Paused review', { exact: true }).count(), { timeout: 10_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['board.expected.md', 'session.jsonl'])
  })
})
