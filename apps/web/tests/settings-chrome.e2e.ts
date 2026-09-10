// Web e2e scenarios: the settings surface — the fullscreen page shell
// (trigger, nav, section switching, close paths), the Appearance preference
// row (the real theme gesture — click 深色 and the whole cascade runs:
// ThemeRuntime preference -> Host settings -> theme/change -> ui-layout's
// presenter -> body attribute -> alias token + browser theme-color metadata)
// the Language row and busy-state Enter preference (both Host-backed), plus
// Permission as the persisted default for subsequently created sessions.
// Zero model calls: everything is pure client + persistence state on a blank
// frame, so there is no fixture and a stray stream would fail loud on the
// open llm seam.
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/settings-chrome', import.meta.url))
const DIALOG_EXPECTED = join(SNAPSHOT_DIR, 'dialog.expected.md')
const PLUGINS_EXPECTED = join(SNAPSHOT_DIR, 'plugins.expected.md')
// The English fallback surface: a browser naming no shipped language.
const DIALOG_EN_EXPECTED = join(SNAPSHOT_DIR, 'dialog-en.expected.md')
// The Desktop composition's overlay-document surface: the same page the Host
// overlay view paints above official pages.
const DESKTOP_SETTINGS_EXPECTED = join(SNAPSHOT_DIR, 'desktop-settings.expected.md')
const DESKTOP_ACCOUNT_WAITING_EXPECTED = join(SNAPSHOT_DIR, 'desktop-account-waiting.expected.md')
const PHONE_DEVICES_EXPECTED = join(SNAPSHOT_DIR, 'phone-devices.expected.md')
const PHONE_DEVICES_RUNTIME_READY_EXPECTED = join(SNAPSHOT_DIR, 'phone-devices-runtime-ready.expected.md')
const PLUGIN_ROW_SELECTOR = '[data-plugin-entry$="ui-settings"]'
const DESKTOP_BRIDGE_FIXTURE = fileURLToPath(
  new URL('../../../packages/client/ui-desktop/tests/desktop-bridge-fixture.client.ts', import.meta.url),
)
const MODE = webSnapshotMode()

function phoneEnvironmentSnapshot(ready: boolean): unknown {
  return {
    revision: ready ? 2 : 1,
    enabled: false,
    runtime: ready
      ? { kind: 'ready', version: '1.0.5', source: 'managed' }
      : { kind: 'missing', targetVersion: '1.0.5', assetBytes: 5_458_848 },
    platforms: {
      android: { kind: 'deferred' },
      ios: { kind: 'unsupported', reason: 'iOS simulators require macOS and Xcode.' },
    },
  }
}

describe('web e2e: the settings page and General preferences', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let phoneRuntimeReady = false

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // Chinese browser: the shared page asserts the localized settings surface
    // the client derives from it (the English default has its own spec below).
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.route('**/phone/environment', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(phoneEnvironmentSnapshot(phoneRuntimeReady)),
      })
    })
    await page.route('**/phone/environment/prepare', async (route) => {
      phoneRuntimeReady = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(phoneEnvironmentSnapshot(true)),
      })
    })
    await page.route('**/phone/devices', async (route) => {
      if (!phoneRuntimeReady) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'PHONE_UNRESOLVED', message: 'mobilecli is unavailable' } }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          android: [],
          ios: {
            simulators: [{
              id: 'DFB02630-3444-4FB0-B746-0A3C4509CB72',
              name: 'iPhone 17 Pro',
              kind: 'simulator',
              state: 'online',
              online: true,
            }],
            reals: [],
          },
        }),
      })
    })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the settings page, switches sections, and closes by every path', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-shell'))
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    expect(await trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(await trigger.getAttribute('aria-expanded')).toBe('false')
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    expect(await trigger.getAttribute('aria-expanded')).toBe('true')
    // General is active by default; Permission, Language and Appearance are functional.
    expect(await dialog.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBe('true')
    await dialog.getByRole('button', { name: 'Workspace Write' }).waitFor({ timeout: 10_000 })
    await expect.poll(() => dialog.getByText('语言', { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    await expect.poll(() => dialog.getByText('外观', { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    const openDocument = dialog.getByRole('button', { name: '打开配置文件' })
    await openDocument.waitFor({ timeout: 10_000 })
    let openRequests = 0
    await page.route('**/api/settings.openDocument', async (route) => {
      const envelope = route.request().postDataJSON() as {
        rpcId: string
        payload: Record<string, never>
      }
      expect(envelope.payload).toEqual({})
      openRequests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: true, value: { opened: true } },
        }),
      })
    })
    await openDocument.click()
    await expect.poll(() => openRequests, { timeout: 5_000 }).toBe(1)
    await expect.poll(() => openDocument.isEnabled(), { timeout: 5_000 }).toBe(true)
    await page.unroute('**/api/settings.openDocument')
    // Golden of the freshly opened page (default zh, General active). The
    // page fills the viewport — the fullscreen shell this change delivers.
    const surface = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    expect(surface.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
    expect(surface.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1)
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DIALOG_EXPECTED, snapshot, MODE)
    // Section switch: aria-current moves (the Models page itself has its own scenario file).
    await dialog.getByRole('button', { name: '模型' }).click()
    await expect.poll(() => dialog.getByRole('button', { name: '模型' }).getAttribute('aria-current'), { timeout: 5_000 }).toBe('true')
    expect(await dialog.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBeNull()
    // Plugins is a read-only projection of the same assembled Loader tree.
    // Capture one stable shipped row rather than the whole inventory so adding
    // an unrelated plugin does not rewrite this surface's golden.
    await dialog.getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('heading', { name: '插件', exact: true }).waitFor({ timeout: 10_000 })
    await dialog.getByRole('tab', { name: '插件列表', exact: true }).click()
    const pluginRow = dialog.locator(PLUGIN_ROW_SELECTOR)
    await pluginRow.waitFor({ timeout: 10_000 })
    const expectedPluginCount = [...scaffold.ctx.loader.entries()]
      .filter(entry => !entry.options.group)
      .length
    expect(await dialog.getByRole('searchbox', { name: '搜索插件' }).count()).toBe(1)
    expect(await dialog.locator('[data-plugin-entry]').count()).toBe(expectedPluginCount)
    expect(await dialog.locator('[data-plugin-count]').getAttribute('data-plugin-count'))
      .toBe(String(expectedPluginCount))
    expect(await dialog.getByRole('button', { name: '插件', exact: true }).getAttribute('aria-current')).toBe('true')
    expect(await dialog.getByRole('tab', { name: '插件列表', exact: true }).getAttribute('aria-selected')).toBe('true')
    expect(await dialog.getByRole('button', { name: '模型' }).getAttribute('aria-current')).toBeNull()
    const pluginsSnapshot = await captureStableAria(
      page,
      PLUGIN_ROW_SELECTOR,
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(PLUGINS_EXPECTED, pluginsSnapshot, MODE)
    await dialog.getByRole('button', { name: '手机设备', exact: true }).click()
    const phoneSettings = dialog.locator('[data-phone-settings]')
    await phoneSettings.getByText('设备运行时 · mobilecli', { exact: true }).waitFor({ timeout: 10_000 })
    const phoneSnapshot = await captureStableAria(page, '[data-phone-settings]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(PHONE_DEVICES_EXPECTED, phoneSnapshot, MODE)
    const phoneSwitch = phoneSettings.getByRole('switch', { name: '启用手机设备' })
    const phoneSwitchLabel = phoneSwitch.locator('xpath=..')
    await phoneSwitchLabel.click()
    await phoneSettings.getByText('未找到 mobilecli').waitFor({ timeout: 10_000 })
    await phoneSettings.getByRole('button', { name: '准备 mobilecli' }).first().click()
    await phoneSettings.getByText('iPhone 17 Pro', { exact: true }).waitFor({ timeout: 10_000 })
    expect(await phoneSettings.getByText('未找到 mobilecli').count()).toBe(0)
    const readyPhoneSnapshot = await captureStableAria(page, '[data-phone-settings]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(PHONE_DEVICES_RUNTIME_READY_EXPECTED, readyPhoneSnapshot, MODE)
    await phoneSwitchLabel.click()
    // Close path 1: Escape.
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    expect(await trigger.getAttribute('aria-expanded')).toBe('false')
    // Close path 2: the header close button (focus lands there on open).
    await trigger.click()
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('stores Permission as the default for future sessions without changing an existing session', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-permission'))
    const existing = scaffold.ctx.sessions.create(SessionId('settings-permission-before'))
    expect(existing.events.find(event => event.type === 'permission/preset')?.data)
      .toEqual({ preset: 'workspace-write' })

    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    const selector = dialog.getByRole('button', { name: 'Workspace Write' })
    await selector.waitFor({ timeout: 10_000 })
    await expect.poll(() => selector.isEnabled(), { timeout: 5_000 }).toBe(true)
    await selector.click()
    await page.getByRole('menuitem', { name: 'Read Only' }).click()
    await dialog.getByRole('button', { name: 'Read Only' }).waitFor({ timeout: 10_000 })

    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('permission:')
    expect(document).toContain('defaultPreset: read-only')
    expect(existing.events.find(event => event.type === 'permission/preset')?.data)
      .toEqual({ preset: 'workspace-write' })

    const created = scaffold.ctx.sessions.create(SessionId('settings-permission-after'))
    expect(created.events.map(event => [event.type, event.data])).toEqual([
      ['permission/preset', { preset: 'read-only' }],
      ['sandbox/mode', { mode: 'read-only' }],
      ['approval/policy', { policy: 'ask' }],
    ])

    await dialog.getByRole('button', { name: 'Read Only' }).click()
    await page.getByRole('menuitem', { name: 'Full access' }).click()
    const confirmation = page.getByRole('dialog', { name: '确认启用 Full access？' })
    const enable = confirmation.getByRole('button', { name: '启用 Full access' })
    expect(await enable.isDisabled()).toBe(true)
    await confirmation.getByRole('checkbox').click()
    await enable.click()
    await dialog.getByRole('button', { name: 'Full access' }).waitFor({ timeout: 10_000 })
    const confirmedDocument = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(confirmedDocument).toContain('defaultPreset: danger-full-access')
    const confirmed = scaffold.ctx.sessions.create(SessionId('settings-permission-confirmed'))
    expect(confirmed.events.map(event => [event.type, event.data])).toEqual([
      ['permission/preset', { preset: 'danger-full-access' }],
      ['sandbox/mode', { mode: 'danger-full-access' }],
      ['approval/policy', { policy: 'never' }],
    ])
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('uses the persisted dark preference while plugins are still loading', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-boot-theme'))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const initialDialog = page.getByRole('dialog', { name: '设置' })
    const darkCube = initialDialog.getByRole('button', { name: '深色' })
    await darkCube.click()
    await expect.poll(() => darkCube.getAttribute('aria-pressed'), { timeout: 5_000 }).toBe('true')
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-theme:\n\s+preference: dark/)
    await page.keyboard.press('Escape')

    // Hold real plugin bundles so the shell-owned loading page remains observable.
    const pluginPattern = /\/plugins\/@deepseek-ai\/dsh-client-ui-theme\/client\.js(?:\?.*)?$/
    let releaseBundles = (): void => {}
    const bundlesReleased = new Promise<void>((resolve) => { releaseBundles = resolve })
    await page.route(pluginPattern, async (route) => {
      await bundlesReleased
      await route.continue()
    })

    const warningStart = tripwire.warnings.length
    let reload: ReturnType<Page['reload']> | undefined
    try {
      reload = page.reload({ waitUntil: 'domcontentloaded' })
      const loading = page.getByText('Loading plugins…', { exact: true })
      await loading.waitFor({ timeout: 10_000 })
      const state = await loading.evaluate((element) => {
        const boot = element.parentElement?.parentElement
        if (boot === undefined || boot === null) throw new Error('loading hint is detached from the boot page')
        return {
          attr: document.body.hasAttribute('data-ds-dark-theme'),
          background: getComputedStyle(boot).backgroundColor,
          colorScheme: document.documentElement.style.colorScheme,
        }
      })
      expect(state).toEqual({
        attr: true,
        background: 'rgb(21, 21, 23)',
        colorScheme: 'dark',
      })
    } finally {
      releaseBundles()
      await reload
      await page.unroute(pluginPattern)
    }

    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const restoredDialog = page.getByRole('dialog', { name: '设置' })
    const systemCube = restoredDialog.getByRole('button', { name: '跟随系统' })
    await systemCube.click()
    await expect.poll(() => systemCube.getAttribute('aria-pressed'), { timeout: 5_000 }).toBe('true')
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 5_000,
    }).toBe(false)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('flips the theme through the Appearance cubes and persists across reload and a distinct port', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-appearance'))
    interface ThemeState {
      attr: boolean
      background: string
      /** Pre-migration localStorage key; the Host-backed world never writes it. */
      legacy: string | null
      themeColor: string | null
      themeColorCount: number
      token: string
    }
    const readState = async (target: Page = page): Promise<ThemeState> => await target.evaluate(() => {
      const metas = document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      const computed = getComputedStyle(document.body)
      return {
        attr: document.body.hasAttribute('data-ds-dark-theme'),
        background: computed.backgroundColor,
        legacy: localStorage.getItem('dsh.theme'),
        themeColor: metas[0]?.content ?? null,
        themeColorCount: metas.length,
        token: computed.getPropertyValue('--dsw-alias-bg-base').trim(),
      }
    })
    const expectThemeColorSynchronized = (state: ThemeState): void => {
      expect(state.themeColorCount).toBe(1)
      expect(state.background).not.toBe('rgba(0, 0, 0, 0)')
      expect(state.themeColor).toBe(state.background)
    }
    // Pin the OS scheme to light so the default `system` preference resolves
    // light and the dark flip below is unambiguously the gesture's doing.
    await page.emulateMedia({ colorScheme: 'light' })
    const light = await readState()
    expect(light.attr).toBe(false)
    expectThemeColorSynchronized(light)

    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    const darkCube = dialog.getByRole('button', { name: '深色' })
    expect(await darkCube.getAttribute('aria-pressed')).toBe('false')
    await darkCube.click()
    // The full cascade: pressed state, Host-backed preference, body attribute,
    // alias token flip — all from one real user gesture.
    await expect.poll(() => darkCube.getAttribute('aria-pressed'), { timeout: 5_000 }).toBe('true')
    const dark = await readState()
    expect(dark.attr).toBe(true)
    expect(dark.legacy).toBeNull()
    expect(dark.token).not.toBe(light.token)
    expectThemeColorSynchronized(dark)
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-theme:\n\s+preference: dark/)
    await page.keyboard.press('Escape')

    // Reload: the preference survives the background Host read + presenter update.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(true)
    const reloaded = await readState()
    expect(reloaded.legacy).toBeNull()
    expectThemeColorSynchronized(reloaded)

    // A second live Host binds another ephemeral port but shares the same
    // user-settings home. Its fresh origin has no theme localStorage and still
    // converges to dark before the settings dialog opens.
    const second = await launchWebScaffold({ harnessHome: scaffold.harnessHome })
    const secondPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const secondTripwire = watchConsole(secondPage)
    try {
      expect(second.baseUrl).not.toBe(scaffold.baseUrl)
      await secondPage.emulateMedia({ colorScheme: 'light' })
      await secondPage.goto(second.baseUrl, { waitUntil: 'load' })
      await secondPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await expect.poll(async () => (await readState(secondPage)).attr, { timeout: 5_000 }).toBe(true)
      const secondState = await readState(secondPage)
      expect(secondState.legacy).toBeNull()
      expectThemeColorSynchronized(secondState)
      expect(secondTripwire.pageErrors).toEqual([])
      expect(secondTripwire.warnings).toEqual([])
    } finally {
      await secondPage.close()
      await second.close()
    }

    // `system` follows the emulated OS scheme (dark stays dark, light clears).
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const systemCube = page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '跟随系统' })
    await systemCube.click()
    await expect.poll(() => systemCube.getAttribute('aria-pressed'), { timeout: 5_000 }).toBe('true')
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(false)
    expectThemeColorSynchronized(await readState())
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(true)
    expectThemeColorSynchronized(await readState())
    // Restore for the specs that follow: light preference beats the emulated
    // dark OS scheme, leaving the shared page in the light default.
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '浅色' }).click()
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(false)
    expectThemeColorSynchronized(await readState())
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('persists the busy-state Enter behavior across reload and a distinct port', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-enter-behavior'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '排队发送' }).click()
    await page.getByRole('menuitem', { name: '插话发送' }).click()
    await dialog.getByRole('button', { name: '插话发送' }).waitFor({ timeout: 10_000 })
    expect(await page.evaluate(() => localStorage.getItem('dsh.conversation.busyEnter'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-conversation:\n\s+busyEnter: steer/)
    await page.keyboard.press('Escape')

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const reloaded = page.getByRole('dialog', { name: '设置' })
    await reloaded.getByRole('button', { name: '插话发送' }).waitFor({ timeout: 10_000 })

    const second = await launchWebScaffold({ harnessHome: scaffold.harnessHome })
    const secondPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const secondTripwire = watchConsole(secondPage)
    try {
      expect(second.baseUrl).not.toBe(scaffold.baseUrl)
      await secondPage.goto(second.baseUrl, { waitUntil: 'load' })
      await secondPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await secondPage.getByRole('button', { name: '设置', exact: true }).click()
      await secondPage.getByRole('dialog', { name: '设置' })
        .getByRole('button', { name: '插话发送' }).waitFor({ timeout: 10_000 })
      expect(await secondPage.evaluate(() => localStorage.getItem('dsh.conversation.busyEnter'))).toBeNull()
      expect(secondTripwire.pageErrors).toEqual([])
      expect(secondTripwire.warnings).toEqual([])
    } finally {
      await secondPage.close()
      await second.close()
    }

    await reloaded.getByRole('button', { name: '插话发送' }).click()
    await page.getByRole('menuitem', { name: '排队发送' }).click()
    await reloaded.getByRole('button', { name: '排队发送' }).waitFor({ timeout: 10_000 })
    expect(await page.evaluate(() => localStorage.getItem('dsh.conversation.busyEnter'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-conversation:\n\s+busyEnter: queue/)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('persists the settings language across reload and a distinct port', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-language'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const zhDialog = page.getByRole('dialog', { name: '设置' })
    await zhDialog.waitFor({ timeout: 10_000 })
    // The document language follows the active locale in the assembled app, not
    // only on a directly-mounted plugin. This is a zh browser, so the served
    // markup's `en` must already have been replaced — asserting it here (rather
    // than only in an English scenario) is what makes the check discriminating.
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('zh-CN')
    // The Language selector pill shows the active locale's own name.
    const selector = zhDialog.getByRole('button', { name: '中文' })
    expect(await selector.getAttribute('aria-haspopup')).toBe('menu')
    await selector.click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    // The settings-owned copy re-registers localized: dialog title, nav,
    // Appearance labels. (Only the settings namespaces are localized —
    // the rest of the app's copy is intentionally out of this row's scope.)
    const enDialog = page.getByRole('dialog', { name: 'Settings' })
    await enDialog.waitFor({ timeout: 10_000 })
    // ...and the attribute follows that switch, in the assembled app.
    await expect.poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 5_000 }).toBe('en')
    expect(await enDialog.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBe('true')
    await expect.poll(() => enDialog.getByText('Appearance', { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    expect(await page.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/locale:\n\s+preference: en/)
    // Reload keeps English; then restore zh so shared page state (and the
    // other specs' 设置-anchored selectors + goldens) see the default again.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    const enTrigger = page.getByRole('button', { name: 'Settings' })
    await enTrigger.waitFor({ timeout: 10_000 })

    // A Chinese browser on another port still receives the explicit English
    // preference from the shared Host settings document.
    const second = await launchWebScaffold({ harnessHome: scaffold.harnessHome })
    const secondPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const secondTripwire = watchConsole(secondPage)
    try {
      expect(second.baseUrl).not.toBe(scaffold.baseUrl)
      await secondPage.goto(second.baseUrl, { waitUntil: 'load' })
      await secondPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await secondPage.getByRole('button', { name: 'Settings', exact: true }).click()
      await secondPage.getByRole('dialog', { name: 'Settings' })
        .getByRole('button', { name: 'English' }).waitFor({ timeout: 10_000 })
      expect(await secondPage.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
      expect(secondTripwire.pageErrors).toEqual([])
      expect(secondTripwire.warnings).toEqual([])
    } finally {
      await secondPage.close()
      await second.close()
    }

    await enTrigger.click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'English' }).click()
    await page.getByRole('menuitem', { name: '中文' }).click()
    await page.getByRole('dialog', { name: '设置' }).waitFor({ timeout: 10_000 })
    expect(await page.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/locale:\n\s+preference: zh/)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('opens an English browser in English without any stored preference', async () => {
    // A fresh Host home has no locale preference, so its surface follows the
    // browser. English is also FALLBACK_LOCALE, so this scenario alone cannot
    // distinguish detection from the default — the zh scenarios above supply
    // the discriminating half (a Chinese browser must NOT land on the default).
    const fresh = await launchWebScaffold({})
    const enPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'en-US' })
    const enTripwire = watchConsole(enPage)
    onTestFailed(() => saveFailureShot(enPage, 'web-e2e-settings-browser-language'))
    try {
      await enPage.goto(fresh.baseUrl, { waitUntil: 'load' })
      await enPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      expect(await enPage.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
      await enPage.getByRole('button', { name: 'Settings', exact: true }).click()
      const dialog = enPage.getByRole('dialog', { name: 'Settings' })
      await dialog.waitFor({ timeout: 10_000 })
      await dialog.getByRole('button', { name: 'English' }).waitFor({ timeout: 10_000 })
      // This page has no closing inventory spec to sweep its console, so the
      // scenario clears both tripwire channels itself.
      expect(enTripwire.pageErrors).toEqual([])
      expect(enTripwire.warnings).toEqual([])
    } finally {
      await enPage.close()
      await fresh.close()
    }
  }, 90_000)

  it('opens a browser asking for no shipped language in English', async () => {
    // The product default for "no usable signal": a French browser ships
    // neither zh nor en, so resolution falls to FALLBACK_LOCALE (en) rather
    // than to Chinese.
    const fresh = await launchWebScaffold({})
    const frPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'fr-FR' })
    const frTripwire = watchConsole(frPage)
    onTestFailed(() => saveFailureShot(frPage, 'web-e2e-settings-unshipped-language'))
    try {
      await frPage.goto(fresh.baseUrl, { waitUntil: 'load' })
      await frPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      expect(await frPage.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
      await frPage.getByRole('button', { name: 'Settings', exact: true }).click()
      const dialog = frPage.getByRole('dialog', { name: 'Settings' })
      await dialog.waitFor({ timeout: 10_000 })
      await dialog.getByRole('button', { name: 'English' }).waitFor({ timeout: 10_000 })
      await expect.poll(
        () => dialog.getByRole('button', { name: 'Standard mode' }).isEnabled(),
        { timeout: 10_000 },
      ).toBe(true)
      // The markup already ships `en`, so this alone cannot prove the sync ran
      // — the zh scenario above is the discriminating half. Asserted here too
      // so a future change that resolves en but writes the wrong tag is caught.
      expect(await frPage.evaluate(() => document.documentElement.lang)).toBe('en')
      // Golden of the English fallback dialog — the visible output this change
      // produces. The zh golden above covers the detected-locale surface, so
      // the pair pins both directions of the resolution.
      const snapshot = await captureStableAria(frPage, '[role="dialog"]', fresh.workspaceCwd)
      await compareOrRefreshGolden(DIALOG_EN_EXPECTED, snapshot, MODE)
      expect(frTripwire.pageErrors).toEqual([])
      expect(frTripwire.warnings).toEqual([])
    } finally {
      await frPage.close()
      await fresh.close()
    }
  }, 90_000)

  it('keeps the web surface console clean across its scenarios', async () => {
    expect(tripwire.warnings).toEqual([])
  }, 60_000)
})

describe('web e2e: the Desktop composition settings overlay document', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    // The Desktop composition: the web profile plus the Host's patch overlay
    // (ui-desktop and friends). The Host overlay view loads this same origin
    // stamped as the overlay document, and the preload delivers the chrome
    // state; the fixture bridge stands in for both.
    scaffold = await launchWebScaffold({
      extraOverlayPath: fileURLToPath(new URL('../../desktop/cordis.patch.yml', import.meta.url)),
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    const { installDesktopBridgeFixture } = await import(pathToFileURL(DESKTOP_BRIDGE_FIXTURE).href) as {
      installDesktopBridgeFixture: (platform: 'darwin' | 'win32') => void
    }
    const platform: 'darwin' | 'win32' = 'darwin'
    await page.addInitScript(installDesktopBridgeFixture, platform)
    // Point the overlay verbs at a live settings request and record the page's
    // replies, the way the real preload round-trips them with the Host. The
    // page keeps painting until the Host answers a close by pushing the null
    // state (it hides the view), so the scenario drives that half too.
    await page.addInitScript(() => {
      const bridge = (globalThis as { dshDesktop?: Record<string, unknown> }).dshDesktop
      if (bridge === undefined) throw new Error('bridge fixture must install first')
      const state = { kind: 'settings', requestId: 'overlay-e2e', sectionId: 'general' }
      const results: unknown[] = []
      const stateListeners = new Set<(value: unknown) => void>()
      // The shared fixture stays unavailable; this overlay paints the waiting panel.
      const authorizing = { status: 'authorizing', privacyAccepted: true }
      bridge.accountGetSnapshot = async () => authorizing
      bridge.onAccountSnapshot = (listener: (value: unknown) => void) => {
        listener(authorizing)
        return () => {}
      }
      bridge.chromeOverlayGetState = async () => state
      bridge.chromeOverlayResult = (result: unknown) => { results.push(result) }
      bridge.onChromeOverlayState = (listener: (value: unknown) => void) => {
        stateListeners.add(listener)
        return () => { stateListeners.delete(listener) }
      }
      bridge.onChromeOverlayResult = () => () => {}
      Object.defineProperty(globalThis, '__overlayResults', { configurable: true, value: results })
      // The real preload broadcasts state to every subscriber (the settings
      // seat and the chrome menu); the hide helper replays that broadcast.
      Object.defineProperty(globalThis, '__overlayHide', {
        configurable: true,
        value: () => {
          for (const listener of [...stateListeners]) listener(null)
        },
      })
    })
    await page.goto(`${scaffold.baseUrl}?dsh-desktop-overlay=1`, { waitUntil: 'load' })
    await page.waitForSelector('[role="dialog"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('paints the fullscreen page with the Desktop-only sections and reports close', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-desktop-overlay'))
    const dialog = page.getByRole('dialog', { name: '设置' })
    // Fullscreen: the page fills the overlay view (the Host window), the same
    // geometry the browser page renders.
    const surface = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    expect(surface.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
    expect(surface.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1)
    // The 手机配对 and 账号池 nav rows exist only in the Desktop composition:
    // their presence pins that the patch overlay's section registrations reach
    // this page.
    expect(await dialog.getByRole('button', { name: '手机配对' }).count()).toBe(1)
    expect(await dialog.getByRole('button', { name: '账号池' }).count()).toBe(1)
    expect(await dialog.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBe('true')
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DESKTOP_SETTINGS_EXPECTED, snapshot, MODE)
    await dialog.getByRole('button', { name: '手机配对' }).click()
    const waiting = dialog.locator('[data-desktop-account-control="authorizing"]')
    await expect.poll(() => waiting.count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(() => waiting.getByRole('button', { name: '取消登录' }).count()).toBe(1)
    await compareOrRefreshGolden(
      DESKTOP_ACCOUNT_WAITING_EXPECTED,
      await captureStableAria(page, '[data-desktop-account-control="authorizing"]', scaffold.workspaceCwd),
      MODE,
    )
    await dialog.getByRole('button', { name: '账号池' }).click()
    const pool = dialog.locator('[data-desktop-account-pool-state]')
    await expect.poll(() => pool.count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(() => pool.getByText('内置账号池').count()).toBe(1)
    const add = pool.getByRole('button', { name: '+ 添加账号 ▾' })
    await expect.poll(() => add.count()).toBe(1)
    await add.click()
    for (const kind of ['KIMI', 'XAI', 'CODEX', 'ANTHROPIC', 'ANTIGRAVITY', 'GLM'] as const) {
      await expect.poll(() => pool.getByRole('button', { name: kind, exact: true }).count()).toBe(1)
    }
    // Closing reports through the overlay result channel with the Host's
    // request id — the page has no local close state in this mode. The Host
    // then hides the view and pushes the null state; the page unmounts.
    await dialog.getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => page.evaluate(() =>
      (globalThis as { __overlayResults?: unknown[] }).__overlayResults ?? [],
    ), { timeout: 5_000 }).toContainEqual({ type: 'close', requestId: 'overlay-e2e' })
    await page.evaluate(() => { (globalThis as { __overlayHide?: () => void }).__overlayHide?.() })
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'desktop-account-waiting.expected.md',
      'desktop-settings.expected.md', 'dialog-en.expected.md', 'dialog.expected.md',
      'phone-devices-runtime-ready.expected.md', 'phone-devices.expected.md',
      'plugins.expected.md',
    ])
  }, 60_000)
})

describe('web e2e: Desktop account-pool experience route', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: fileURLToPath(new URL('../../desktop/cordis.patch.yml', import.meta.url)),
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    const { installDesktopBridgeFixture } = await import(pathToFileURL(DESKTOP_BRIDGE_FIXTURE).href) as {
      installDesktopBridgeFixture: (platform: 'darwin' | 'win32') => void
    }
    const platform: 'darwin' | 'win32' = 'darwin'
    await page.addInitScript(installDesktopBridgeFixture, platform)
    await page.addInitScript(() => {
      const bridge = (globalThis as { dshDesktop?: Record<string, unknown> }).dshDesktop
      if (bridge === undefined) throw new Error('bridge fixture must install first')
      const overlay = { kind: 'settings', requestId: 'overlay-account-pool', sectionId: 'sub2api' }
      let pool: Record<string, unknown> = { state: 'ready', accounts: [] }
      const listeners = new Set<(value: Record<string, unknown>) => void>()
      const setPool = (next: Record<string, unknown>): void => {
        pool = next
        for (const listener of [...listeners]) listener(pool)
      }
      const withoutLogin = (current: Record<string, unknown>): Record<string, unknown> => {
        const { login: _login, ...rest } = current
        return rest
      }
      bridge.chromeOverlayGetState = async () => overlay
      bridge.chromeOverlayResult = () => {}
      bridge.onChromeOverlayState = (listener: (value: unknown) => void) => {
        listener(overlay)
        return () => {}
      }
      bridge.onChromeOverlayResult = () => () => {}
      bridge.accountPoolGetSnapshot = async () => pool
      bridge.onAccountPoolSnapshot = (listener: (value: Record<string, unknown>) => void) => {
        listeners.add(listener)
        listener(pool)
        return () => { listeners.delete(listener) }
      }
      bridge.accountPoolStartLogin = async (kind: string) => {
        const login = kind === 'glm'
          ? { kind, flow: 'glm-key' }
          : kind === 'kimi' || kind === 'xai'
            ? {
              kind,
              flow: 'device',
              state: 'device-1',
              url: `https://auth.${kind}.example.test/device/verify?user_code=${kind.toUpperCase()}-1234`,
              userCode: `${kind.toUpperCase()}-1234`,
            }
            : { kind, flow: 'pkce', state: 'pkce-1' }
        setPool({ ...pool, login })
        return login
      }
      bridge.accountPoolCancelLogin = async () => {
        setPool(withoutLogin(pool))
        return pool
      }
      bridge.accountPoolSubmitGlmKey = async (input: { apiKey: string }) => {
        if (typeof input.apiKey !== 'string' || input.apiKey.length === 0) return pool
        const accounts = Array.isArray(pool.accounts) ? pool.accounts as Array<Record<string, unknown>> : []
        setPool({
          ...withoutLogin(pool),
          accounts: [...accounts, {
            authIndex: 'glm-0',
            name: 'glm-coding-plan.json',
            provider: 'glm',
            label: 'GLM Coding Plan',
            email: 'glm-user@example.test',
            status: 'active',
            enabled: true,
            successCount: 0,
            failCount: 0,
            quota: [],
          }],
        })
        return pool
      }
      bridge.accountPoolSetEnabled = async (name: string, enabled: boolean) => {
        const accounts = Array.isArray(pool.accounts) ? pool.accounts as Array<Record<string, unknown>> : []
        setPool({
          ...pool,
          accounts: accounts.map(account => account.name === name ? { ...account, enabled } : account),
        })
        return pool
      }
      bridge.accountPoolDelete = async (name: string) => {
        const accounts = Array.isArray(pool.accounts) ? pool.accounts as Array<Record<string, unknown>> : []
        setPool({ ...pool, accounts: accounts.filter(account => account.name !== name) })
        return pool
      }
      bridge.accountPoolRefreshQuota = async (authIndex: string) => {
        const accounts = Array.isArray(pool.accounts) ? pool.accounts as Array<Record<string, unknown>> : []
        setPool({
          ...pool,
          accounts: accounts.map(account => account.authIndex === authIndex
            ? {
              ...account,
              quota: [{
                key: '5h',
                label: '5h',
                remainingPercent: 40,
                timeRemainingPercent: 70,
                status: 'known',
              }],
            }
            : account),
        })
        return pool
      }
      Object.defineProperty(globalThis, '__setAccountPool', { configurable: true, value: setPool })
    })
    await page.goto(`${scaffold.baseUrl}?dsh-desktop-overlay=1`, { waitUntil: 'load' })
    await page.waitForSelector('[role="dialog"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('walks empty pool, logins, dual-face cards, unknown quota, and core error', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-account-pool-route'))
    const gifDir = process.env.DSH_RECORD_ACCOUNT_POOL_GIF === '1'
      ? fileURLToPath(new URL('../../../.playwright-mcp/gif-frames-account-pool-full', import.meta.url))
      : undefined
    if (gifDir !== undefined) await mkdir(gifDir, { recursive: true })
    const shot = async (name: string): Promise<void> => {
      if (gifDir === undefined) return
      await page.screenshot({ path: join(gifDir, `${name}.png`) })
    }
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '账号池' }).click()
    const pool = dialog.locator('[data-desktop-account-pool-state]')
    await expect.poll(() => pool.count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(() => pool.getByTestId('account-pool-title').innerText()).toBe('内置账号池')
    expect(await pool.innerText()).not.toMatch(/127\.0\.0\.1:8317|Composite|PROTOTYPE DRAFT/)
    await expect.poll(() => pool.getByText('共 0 个凭证').count()).toBe(1)
    await shot('00-empty-ready')
    await pool.getByRole('button', { name: '+ 添加账号 ▾' }).click()
    for (const kind of ['KIMI', 'XAI', 'CODEX', 'ANTHROPIC', 'ANTIGRAVITY', 'GLM'] as const) {
      await expect.poll(() => pool.getByRole('button', { name: kind, exact: true }).count()).toBe(1)
    }
    await shot('01-add-menu')
    await pool.getByRole('button', { name: 'GLM', exact: true }).click()
    const key = page.locator('input[type="password"]')
    await expect.poll(() => key.count()).toBe(1)
    expect(await key.getAttribute('type')).toBe('password')
    await key.fill('glm-coding-plan-fixture')
    await shot('02-glm-masked')
    await page.getByRole('button', { name: '取消' }).click()
    await expect.poll(() => page.locator('input[type="password"]').count()).toBe(0)
    await pool.getByRole('button', { name: '+ 添加账号 ▾' }).click()
    await pool.getByRole('button', { name: 'KIMI', exact: true }).click()
    await expect.poll(() => page.getByText('KIMI-1234', { exact: true }).count()).toBe(1)
    await expect.poll(() => page.getByText('https://auth.kimi.example.test/device/verify?user_code=KIMI-1234').count()).toBe(1)
    await shot('03-kimi-device')
    await page.getByRole('button', { name: '取消' }).click()
    await pool.getByRole('button', { name: '+ 添加账号 ▾' }).click()
    await pool.getByRole('button', { name: 'CODEX', exact: true }).click()
    await expect.poll(() => page.getByText('正在等待 CODEX 浏览器授权…').count()).toBe(1)
    await page.getByRole('button', { name: '取消' }).click()
    await page.evaluate(() => {
      const setPool = (globalThis as { __setAccountPool?: (value: unknown) => void }).__setAccountPool
      setPool?.({
        state: 'ready',
        accounts: [
          {
            authIndex: 'codex-1',
            name: 'codex-pool-engine.json',
            provider: 'codex',
            label: 'Pro 20x',
            email: 'pool-engine@example.test',
            status: 'active',
            enabled: true,
            successCount: 12,
            failCount: 1,
            quota: [{
              key: '5h',
              label: '5h',
              remainingPercent: 40,
              timeRemainingPercent: 70,
              status: 'known',
            }],
          },
          {
            authIndex: 'antigravity-1',
            name: 'antigravity-dev-alpha.json',
            provider: 'antigravity',
            label: 'Pro',
            email: 'dev-alpha@example.test',
            status: 'error',
            statusMessage: '额度获取失败: auth token refresh failed',
            enabled: false,
            successCount: 0,
            failCount: 3,
            quota: [],
          },
          {
            authIndex: 'kimi-1',
            name: 'kimi-research-seat.json',
            provider: 'kimi',
            label: 'Standard',
            email: 'research-seat@example.test',
            status: 'active',
            enabled: true,
            successCount: 4,
            failCount: 0,
            quota: [{ key: 'unknown', label: 'unknown', status: 'failure' }],
          },
        ],
      })
    })
    await expect.poll(() => pool.getByTestId('account-card-codex-1').count()).toBe(1)
    expect(await pool.getByTestId('account-card-codex-1').getAttribute('data-current-face')).toBe('A')
    await expect.poll(() => pool.getByText('额度获取失败: auth token refresh failed').count()).toBe(1)
    await shot('04-management-cards')
    await pool.getByTestId('global-face-btn-b').click()
    expect(await pool.getByTestId('account-card-codex-1').getAttribute('data-current-face')).toBe('B')
    await expect.poll(() => pool.getByText('额度剩余 40%').count()).toBe(1)
    await expect.poll(() => pool.getByText('时间窗口剩余 70%').count()).toBe(1)
    await expect.poll(() => pool.getByText('暂未获取到该账号配额数据，或该提供商不提供主动额度查询。').count()).toBe(1)
    await expect.poll(() => pool.getByText('未知').count()).toBeGreaterThan(0)
    await shot('05-global-quota')
    await pool.getByTestId('card-flip-btn-codex-1').click()
    expect(await pool.getByTestId('account-card-codex-1').getAttribute('data-current-face')).toBe('A')
    expect(await pool.getByTestId('account-card-kimi-1').getAttribute('data-current-face')).toBe('B')
    await shot('06-one-card-flipped')
    await shot('07-unknown-quota')
    await pool.getByTestId('global-face-btn-a').click()
    expect(await pool.getByTestId('account-card-codex-1').getAttribute('data-current-face')).toBe('A')
    await pool.getByRole('button', { name: 'codex (1)', exact: true }).click()
    await expect.poll(() => pool.getByTestId('account-card-kimi-1').count()).toBe(0)
    await pool.getByRole('button', { name: /全部/ }).click()
    await expect.poll(() => pool.getByTestId('account-card-kimi-1').count()).toBe(1)
    await pool.getByTestId('account-card-codex-1').locator('label').click()
    await expect.poll(() => page.evaluate(() =>
      ((globalThis as { dshDesktop?: { accountPoolGetSnapshot: () => Promise<{ accounts: Array<{ enabled: boolean }> }> } })
        .dshDesktop?.accountPoolGetSnapshot() ?? Promise.resolve({ accounts: [] }))
        .then(snapshot => snapshot.accounts[0]?.enabled),
    )).toBe(false)
    const snapshot = await page.evaluate(() =>
      (globalThis as { dshDesktop?: { accountPoolGetSnapshot: () => Promise<unknown> } }).dshDesktop?.accountPoolGetSnapshot())
    expect(JSON.stringify(snapshot)).not.toMatch(/api-key|secret|Bearer|glm-coding-plan-fixture/i)
    await page.evaluate(() => {
      const setPool = (globalThis as { __setAccountPool?: (value: unknown) => void }).__setAccountPool
      setPool?.({ state: 'error', accounts: [], error: 'kernel failed' })
    })
    await expect.poll(() => pool.getByText('kernel failed').count()).toBe(1)
    expect(await pool.getAttribute('data-desktop-account-pool-state')).toBe('error')
    await shot('08-core-error')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)
})
