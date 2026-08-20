// Web e2e: the shipped @ workspace source lists a seeded workspace file.
// No model call. The host marker is pinned by the Loader composition smoke.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import {
  assertFixtureInventory,
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/workspace-reference-picker', import.meta.url))
const MENU_EXPECTED = join(SNAPSHOT_DIR, 'menu.expected.md')
const MODE = webSnapshotMode()
const MARKER = 'wsref-marker.ts'

describe('web e2e: workspace reference picker', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await mkdir(join(scaffold.workspaceCwd, 'workspace', 'docs'), { recursive: true })
    await writeFile(join(scaffold.workspaceCwd, 'workspace', MARKER), 'export {}\n')
    await writeFile(join(scaffold.workspaceCwd, 'workspace', 'docs', 'guide.md'), '# guide\n')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('lists the seeded workspace file under the workspace @ group', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-reference-picker'))
    const input = page.locator('textarea:enabled').last()
    await input.click()
    await input.pressSequentially('@wsref', { delay: 30 })
    const menu = page.getByRole('listbox', { name: 'Trigger suggestions' })
    await expect.poll(
      () => menu.getByRole('option', { name: new RegExp(MARKER) }).count(),
      { timeout: 15_000 },
    ).toBe(1)
    const snapshot = await captureStableAria(page, '[role="listbox"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MENU_EXPECTED, snapshot, MODE)
    await menu.getByRole('option', { name: new RegExp(MARKER) }).click()
    await expect.poll(() => input.inputValue()).toBe(`@${MARKER} `)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it('lists a picked path on the composer dock and can remove it', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-reference-dock'))
    const input = page.locator('textarea:enabled').last()
    await input.click()
    await input.fill('')
    await input.pressSequentially(`@${MARKER} `, { delay: 20 })
    const chip = page.locator(`[data-workspace-reference-chip="${MARKER}"]`)
    await expect.poll(() => chip.count(), { timeout: 10_000 }).toBe(1)
    const dockBox = await page.locator('[data-workspace-reference-dock]').boundingBox()
    const inputBox = await input.boundingBox()
    expect(dockBox).toBeTruthy()
    expect(inputBox).toBeTruthy()
    // The dock shares the composer card column. On the 1680px snapshot
    // viewport a missing max-width parks the chips near x=24.
    expect(Math.abs((dockBox?.x ?? 0) - (inputBox?.x ?? 0))).toBeLessThan(24)
    const snapshot = await captureStableAria(page, '[data-workspace-reference-dock]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'dock.expected.md'), snapshot, MODE)
    const openPath = vi.spyOn(scaffold.ctx.apiProxy.host, 'openPath')
      .mockImplementation(async (request, _signal) => ({
        rpcId: request.rpcId,
        result: { ok: true, value: { opened: true as const } },
      }))
    try {
      const [response] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/host.openPath'),
        chip.getByRole('button', { name: 'Open' }).click(),
      ])
      expect(response.status()).toBe(200)
      expect(openPath).toHaveBeenCalledTimes(1)
      expect(openPath.mock.calls[0]![0].payload).toEqual({
        path: `${scaffold.workspaceCwd}/workspace/${MARKER}`,
      })
    } finally {
      openPath.mockRestore()
    }
    await chip.getByRole('button', { name: 'Remove' }).click()
    await expect.poll(() => page.locator('[data-workspace-reference-dock]').count()).toBe(0)
  })

  it('ignores a pasted @path while still accepting a typed one', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-reference-paste'))
    const input = page.locator('textarea:enabled').last()
    await input.click()
    await input.fill('')
    await input.evaluate((el, text) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, `@${MARKER}`)
    await expect.poll(() => page.locator('[data-workspace-reference-dock]').count(), { timeout: 5_000 }).toBe(0)
    const snapshot = await captureStableAria(page, 'textarea:enabled', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'paste-ignore.expected.md'), snapshot, MODE)
    await input.fill('')
    await input.pressSequentially(`@${MARKER} `, { delay: 20 })
    await expect.poll(() => page.locator(`[data-workspace-reference-chip="${MARKER}"]`).count(), { timeout: 10_000 }).toBe(1)
  })

  it('ArrowRight on a directory keeps the menu open at @path/', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-reference-folder'))
    const input = page.locator('textarea:enabled').last()
    await input.click()
    await input.fill('')
    await input.pressSequentially('@doc', { delay: 30 })
    const menu = page.getByRole('listbox', { name: 'Trigger suggestions' })
    await expect.poll(
      () => menu.getByRole('option', { name: /docs/ }).count(),
      { timeout: 15_000 },
    ).toBeGreaterThan(0)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => input.inputValue(), { timeout: 10_000 }).toMatch(/@docs\//)
    await expect.poll(() => menu.count(), { timeout: 5_000 }).toBe(1)
    const snapshot = await captureStableAria(page, '[role="listbox"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'folder.expected.md'), snapshot, MODE)
  })

  it('exposes enable, paste ignore, and basename filters without File mentions', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-reference-settings'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Workspace Reference' }).click()
    const section = page.locator('[data-workspace-reference-settings]')
    await section.waitFor({ timeout: 10_000 })
    await expect.poll(() => section.getByText('Enable Workspace References').count()).toBe(1)
    await expect.poll(() => section.getByText('Ignore @ paths on paste').count()).toBe(1)
    await expect.poll(() => section.getByText('Exact filter (basename contains)').count()).toBe(1)
    await expect.poll(() => section.getByText('Regex filter (basename)').count()).toBe(1)
    expect(await dialog.getByText('File mentions').count()).toBe(0)
    const snapshot = await captureStableAria(page, '[data-workspace-reference-settings]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'settings.expected.md'), snapshot, MODE)
    await page.keyboard.press('Escape')
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'menu.expected.md',
      'dock.expected.md',
      'paste-ignore.expected.md',
      'folder.expected.md',
      'settings.expected.md',
    ])
  })
})
