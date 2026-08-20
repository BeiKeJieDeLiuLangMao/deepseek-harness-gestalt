// Web e2e: the shipped @ workspace source lists a seeded workspace file.
// No model call. The host marker is pinned by the Loader composition smoke.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
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
    await expect.poll(() => input.inputValue()).toBe(`\uFFFC${MARKER} `)
    await expect.poll(() => page.locator('[data-decoration="chip"]').innerText()).toBe(MARKER)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it('replaces a picked nested path with a basename chip', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-reference-chip'))
    const input = page.locator('textarea:enabled').last()
    await input.click()
    await input.fill('')
    await input.pressSequentially('@guide', { delay: 30 })
    const menu = page.getByRole('listbox', { name: 'Trigger suggestions' })
    await expect.poll(
      () => menu.getByRole('option', { name: /guide\.md/ }).count(),
      { timeout: 15_000 },
    ).toBe(1)
    await menu.getByRole('option', { name: /guide\.md/ }).click()
    await expect.poll(() => input.inputValue()).toBe('\uFFFCguide.md ')
    const chip = page.locator('[data-decoration="chip"]')
    await expect.poll(() => chip.innerText()).toBe('guide.md')
    const snapshot = await captureStableAria(page, '[data-decoration="chip"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'chip.expected.md'), snapshot, MODE)
    await input.press('Backspace')
    await input.press('Backspace')
    await expect.poll(() => page.locator('[data-decoration="chip"]').count()).toBe(0)
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
    await expect.poll(() => page.locator('[data-decoration="chip"]').count(), { timeout: 5_000 }).toBe(0)
    const snapshot = await captureStableAria(page, 'textarea:enabled', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'paste-ignore.expected.md'), snapshot, MODE)
    await input.fill('')
    await input.pressSequentially(`@${MARKER}`, { delay: 20 })
    const typedMenu = page.getByRole('listbox', { name: 'Trigger suggestions' })
    await expect.poll(
      () => typedMenu.getByRole('option', { name: new RegExp(MARKER) }).count(),
      { timeout: 15_000 },
    ).toBe(1)
    await typedMenu.getByRole('option', { name: new RegExp(MARKER) }).click()
    await expect.poll(() => page.locator('[data-decoration="chip"]').count(), { timeout: 10_000 }).toBe(1)
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
      'chip.expected.md',
      'paste-ignore.expected.md',
      'folder.expected.md',
      'settings.expected.md',
    ])
  })
})
