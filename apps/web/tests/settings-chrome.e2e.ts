// Web e2e scenarios: the settings surface — the fullscreen page (trigger, nav,
// section switching, both close paths), the Appearance preference row (the
// real theme gesture — click 深色 and the whole cascade runs: ThemeRuntime preference -> Host settings
// -> theme/change -> ui-layout's presenter -> body attribute -> alias token +
// browser theme-color metadata)
// the Language row and busy-state Enter preference (both Host-backed), plus
// Permission as the persisted default for subsequently created sessions.
// No agent model calls: ordinary cases use client + persistence state on a
// blank frame, while the Web Search probe reaches a dedicated child-process
// HTTP fixture through the shipped provider.
import { readFile } from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/settings-chrome', import.meta.url))
const DIALOG_EXPECTED = join(SNAPSHOT_DIR, 'dialog.expected.md')
const PLUGINS_EXPECTED = join(SNAPSHOT_DIR, 'plugins.expected.md')
// The English fallback surface: a browser naming no shipped language.
const DIALOG_EN_EXPECTED = join(SNAPSHOT_DIR, 'dialog-en.expected.md')
const PHONE_DEVICES_EXPECTED = join(SNAPSHOT_DIR, 'phone-devices.expected.md')
const PHONE_DEVICES_RUNTIME_READY_EXPECTED = join(SNAPSHOT_DIR, 'phone-devices-runtime-ready.expected.md')
const PLUGIN_ROW_SELECTOR = '[data-plugin-entry$="ui-settings"]'
const MODE = webSnapshotMode()
const SEARCH_PROVIDER_FIXTURE = fileURLToPath(new URL('./fixtures/settings-search-provider.mjs', import.meta.url))
const KIMI_SEARCH_KEY = 'settings-kimi-key'
const ANTHROPIC_SEARCH_KEY = 'settings-anthropic-key'

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

interface CapturedSearchRequest {
  readonly path: string
  readonly authorization: 'absent' | 'kimi' | 'anthropic' | 'unexpected'
  readonly apiKey: 'absent' | 'kimi' | 'anthropic' | 'unexpected'
  readonly body: unknown
}

interface SearchProviderFixture {
  readonly baseURL: string
  requests(): Promise<readonly CapturedSearchRequest[]>
  close(): Promise<void>
}

function waitForProviderReady(child: ChildProcess, stderr: () => string): Promise<string> {
  return new Promise((resolveReady, reject) => {
    let stdout = ''
    const cleanup = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.off('exit', onExit)
    }
    const onData = (chunk: Buffer): void => {
      stdout += chunk.toString()
      const line = stdout.split('\n', 1)[0]
      if (line === undefined || line.length === 0 || !stdout.includes('\n')) return
      cleanup()
      const ready = JSON.parse(line) as { baseURL?: unknown }
      if (typeof ready.baseURL !== 'string') {
        reject(new Error(`settings search provider printed an invalid ready line: ${line}`))
        return
      }
      resolveReady(ready.baseURL)
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup()
      reject(new Error(
        `settings search provider exited before ready (code ${String(code)}, signal ${String(signal)}):\n${stderr()}`,
      ))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`settings search provider did not become ready:\n${stderr()}`))
    }, 10_000)
    child.stdout?.on('data', onData)
    child.once('exit', onExit)
  })
}

async function stopProvider(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    if (child.exitCode !== 0) throw new Error(`settings search provider exited with code ${String(child.exitCode)}`)
    return
  }
  if (child.signalCode !== null) {
    throw new Error(`settings search provider exited from signal ${child.signalCode}`)
  }
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => { resolve({ code, signal }) })
  })
  child.kill('SIGTERM')
  const timeout = setTimeout(() => { child.kill('SIGKILL') }, 10_000)
  const result = await closed
  clearTimeout(timeout)
  if (result.signal === 'SIGKILL') throw new Error('settings search provider did not stop after SIGTERM')
  if (result.code !== 0) {
    throw new Error(`settings search provider exited with code ${String(result.code)} and signal ${String(result.signal)}`)
  }
}

async function startSearchProviderFixture(): Promise<SearchProviderFixture> {
  const child = spawn(process.execPath, [SEARCH_PROVIDER_FIXTURE], {
    env: {
      DSH_TEST_KIMI_SEARCH_KEY: KIMI_SEARCH_KEY,
      DSH_TEST_ANTHROPIC_SEARCH_KEY: ANTHROPIC_SEARCH_KEY,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  try {
    const baseURL = await waitForProviderReady(child, () => stderr)
    return {
      baseURL,
      requests: async () => {
        const response = await fetch(`${baseURL}/requests`)
        if (!response.ok) throw new Error(`settings search provider inventory returned HTTP ${String(response.status)}`)
        return await response.json() as CapturedSearchRequest[]
      },
      close: () => stopProvider(child),
    }
  } catch (error) {
    await stopProvider(child).catch(() => {})
    throw error
  }
}

describe('web e2e: settings modal and General preferences', () => {
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
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the settings dialog, switches sections, and closes by every path', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-shell'))
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    expect(await trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(await trigger.getAttribute('aria-expanded')).toBe('false')
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    expect(await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return [rect.x, rect.y, rect.width, rect.height, window.innerWidth, window.innerHeight]
    })).toEqual([0, 0, 1680, 1000, 1680, 1000])
    expect(await trigger.getAttribute('aria-expanded')).toBe('true')
    // General is active by default; Permission, Language and Appearance are functional.
    expect(await dialog.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBe('true')
    await dialog.getByRole('button', { name: '工作区内修改' }).waitFor({ timeout: 10_000 })
    await expect.poll(() => dialog.getByText('语言', { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    await expect.poll(() => dialog.getByText('外观', { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    const openDocument = dialog.getByRole('button', { name: '打开配置文件' })
    await openDocument.waitFor({ timeout: 10_000 })
    let openRequests = 0
    await page.route('**/api/settings/openSettingsDocument', async (route) => {
      const envelope = route.request().postDataJSON() as {
        rpcId: string
        payload: { args: Record<string, never> }
      }
      expect(envelope.payload).toEqual({ args: {} })
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
    await page.unroute('**/api/settings/openSettingsDocument')
    // Golden of the freshly opened dialog (default zh, General active).
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
    // The preset group opens first with its display-only switcher; the global
    // plane starts collapsed and expands on demand.
    const presetSwitcher = dialog.getByRole('button', { name: '选择要查看的 Agent 预设' })
    await presetSwitcher.waitFor({ timeout: 10_000 })
    // The shipped default's zh display name comes from the zh dictionaries.
    expect(await presetSwitcher.textContent()).toBe('标准模式（默认）')
    await dialog.getByRole('button', { name: /^全局/ }).click()
    const pluginRow = dialog.locator(PLUGIN_ROW_SELECTOR)
    await pluginRow.waitFor({ timeout: 10_000 })
    const expectedPluginCount = [...scaffold.ctx.loader.entries()]
      .filter(entry => !entry.options.group)
      .length
    expect(await dialog.getByRole('searchbox', { name: '搜索插件' }).count()).toBe(1)
    // Every Loader entry appears exactly once in the global group — rows the
    // presets took over included, preset compositions excluded.
    expect(await dialog.locator('[data-plugin-scope="global"] [data-plugin-entry]').count())
      .toBe(expectedPluginCount)
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

  it('routes Kimi and Anthropic settings through the generated Host probe', async () => {
    let provider: SearchProviderFixture | undefined
    let isolated: WebScaffold | undefined
    let isolatedBrowser: Browser | undefined
    let isolatedPage: Page | undefined
    const failures: unknown[] = []
    try {
      provider = await startSearchProviderFixture()
      isolated = await launchWebScaffold({})
      isolatedBrowser = await chromium.launch()
      const providerPage = await newEnglishPage(isolatedBrowser)
      isolatedPage = providerPage
      const isolatedTripwire = watchConsole(providerPage)
      onTestFailed(() => saveFailureShot(providerPage, 'web-e2e-settings-search-provider'))
      await providerPage.goto(isolated.authenticatedUrl, { waitUntil: 'load' })
      await providerPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await providerPage.getByRole('button', { name: 'Settings', exact: true }).click()
      const dialog = providerPage.getByRole('dialog', { name: 'Settings' })
      await dialog.getByRole('button', { name: 'Plugins', exact: true }).click()
      await dialog.getByRole('tab', { name: 'Plugin configuration', exact: true }).waitFor({ timeout: 10_000 })
      const card = dialog.getByText('Web Search', { exact: true }).locator('xpath=ancestor::li[1]')
      const openCard = async (): Promise<void> => {
        await card.getByRole('button', { name: 'Show settings: Web Search', exact: true }).click()
        await card.getByRole('tab', { name: 'DeepSeek', exact: true }).waitFor({ timeout: 10_000 })
      }
      const configureAndProbe = async (
        providerName: 'Kimi' | 'Anthropic',
        endpoint: string,
        apiKey: string,
        expectedTitle: string,
      ): Promise<void> => {
        const tab = card.getByRole('tab', { name: providerName, exact: true })
        await tab.click()
        await expect.poll(() => tab.getAttribute('aria-selected'), { timeout: 10_000 }).toBe('true')
        await card.getByLabel('Endpoint', { exact: true }).fill(endpoint)
        await card.getByLabel('API key', { exact: true }).fill(apiKey)
        await card.getByRole('button', { name: 'Save', exact: true }).click()
        await card.getByRole('button', { name: 'Show settings: Web Search', exact: true })
          .waitFor({ timeout: 10_000 })
        await openCard()
        await card.getByRole('button', { name: 'Test search', exact: true }).click()
        await expect.poll(
          () => card.getByRole('status').textContent(),
          { timeout: 15_000 },
        ).toBe(`Search succeeded · 1 · ${expectedTitle}`)
      }

      await openCard()
      await configureAndProbe(
        'Kimi',
        `${provider.baseURL}/kimi/search`,
        KIMI_SEARCH_KEY,
        'Kimi assembled result',
      )
      await expect.poll(async () => (await provider!.requests()).length, { timeout: 10_000 }).toBe(1)

      await configureAndProbe(
        'Anthropic',
        `${provider.baseURL}/anthropic`,
        ANTHROPIC_SEARCH_KEY,
        'Anthropic assembled result',
      )
      await expect.poll(async () => (await provider!.requests()).length, { timeout: 10_000 }).toBe(2)

      expect(await provider.requests()).toEqual([
        {
          path: '/kimi/search',
          authorization: 'kimi',
          apiKey: 'absent',
          body: { text_query: 'deepseek harness' },
        },
        {
          path: '/anthropic/messages',
          authorization: 'anthropic',
          apiKey: 'anthropic',
          body: {
            model: 'deepseek-v4-flash',
            max_tokens: 4096,
            messages: [{
              role: 'user',
              content: [{ type: 'text', text: 'Perform a web search for the query: deepseek harness' }],
            }],
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
          },
        },
      ])
      expect(isolatedTripwire.pageErrors).toEqual([])
      expect(isolatedTripwire.warnings).toEqual([])
    } catch (error) {
      failures.push(error)
    } finally {
      await isolatedPage?.close().catch((error: unknown) => { failures.push(error) })
      await isolatedBrowser?.close().catch((error: unknown) => { failures.push(error) })
      await isolated?.close().catch((error: unknown) => { failures.push(error) })
      await provider?.close().catch((error: unknown) => { failures.push(error) })
    }
    if (failures.length > 0) throw new AggregateError(failures, 'assembled Web Search settings probe failed')
  }, 120_000)

  it('stores Permission as the default for future sessions without changing an existing session', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-permission'))
    const existing = scaffold.ctx.sessions.create(SessionId('settings-permission-before'))
    expect(existing.snapshotEvents().find(event => event.type === 'permission/preset')?.data)
      .toEqual({ preset: 'workspace-write' })

    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    const selector = dialog.getByRole('button', { name: '工作区内修改' })
    await selector.waitFor({ timeout: 10_000 })
    await expect.poll(() => selector.isEnabled(), { timeout: 5_000 }).toBe(true)
    await selector.click()
    await page.getByRole('menuitem', { name: '仅可查看' }).click()
    await dialog.getByRole('button', { name: '仅可查看' }).waitFor({ timeout: 10_000 })

    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('permission:')
    expect(document).toContain('defaultPreset: read-only')
    expect(existing.snapshotEvents().find(event => event.type === 'permission/preset')?.data)
      .toEqual({ preset: 'workspace-write' })

    const created = scaffold.ctx.sessions.create(SessionId('settings-permission-after'))
    expect(created.snapshotEvents().map(event => [event.type, event.data])).toEqual([
      ['permission/preset', { preset: 'read-only' }],
      ['sandbox/mode', { mode: 'read-only' }],
      ['approval/policy', { policy: 'ask' }],
    ])

    await dialog.getByRole('button', { name: '仅可查看' }).click()
    await page.getByRole('menuitem', { name: '完全权限' }).click()
    const confirmation = page.getByRole('dialog', { name: '确认启用完全权限？' })
    const enable = confirmation.getByRole('button', { name: '启用完全权限' })
    expect(await enable.isDisabled()).toBe(true)
    await confirmation.getByRole('checkbox').click()
    await enable.click()
    await dialog.getByRole('button', { name: '完全权限' }).waitFor({ timeout: 10_000 })
    const confirmedDocument = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(confirmedDocument).toContain('defaultPreset: danger-full-access')
    const confirmed = scaffold.ctx.sessions.create(SessionId('settings-permission-confirmed'))
    expect(confirmed.snapshotEvents().map(event => [event.type, event.data])).toEqual([
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

    // Hold the real application batch so the shell-owned loading page remains observable.
    const pluginPattern = /\/plugins\/\?\?.+\/client\.js,.+\/client\.js&rev=[a-f\d]{12}$/
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
      await secondPage.goto(second.authenticatedUrl, { waitUntil: 'load' })
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

  it('steps the content font size, applies it to body, and persists across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-font-size'))
    const readFontSize = async (target: Page = page): Promise<string> => await target.evaluate(
      () => document.body.style.getPropertyValue('--dsh-content-font-size'),
    )
    // The secondary tier resolved by the real engine: a probe element's
    // font-size forces min/max/calc evaluation, which the CSS-text specs
    // cannot exercise. Setting −1 at ≤14, setting −2 above.
    const readSecondaryFontSize = async (): Promise<string> => await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.fontSize = 'var(--dsh-content-font-size-secondary, 13px)'
      document.body.appendChild(probe)
      const size = getComputedStyle(probe).fontSize
      probe.remove()
      return size
    })
    expect(await readFontSize()).toBe('14px')
    expect(await readSecondaryFontSize()).toBe('13px')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    // The stepper reveals its arrows on hover; the up arrow steps 14 → 15 → 16.
    await dialog.getByText('14', { exact: true }).hover()
    const increase = dialog.getByRole('button', { name: '增大字号' })
    await increase.click()
    await dialog.getByText('15', { exact: true }).waitFor({ timeout: 5_000 })
    // 15 is the piecewise boundary: the secondary tier holds at 13px (−2)
    // where the ≤14 branch would have given 14px (−1).
    await expect.poll(readSecondaryFontSize, { timeout: 5_000 }).toBe('13px')
    await increase.click()
    await dialog.getByText('16', { exact: true }).waitFor({ timeout: 5_000 })
    await expect.poll(readFontSize, { timeout: 5_000 }).toBe('16px')
    await expect.poll(readSecondaryFontSize, { timeout: 5_000 }).toBe('14px')
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-theme:\n(?:\s+\w+: .*\n)*?\s+fontSize: 16/)
    await page.keyboard.press('Escape')

    // Reload: the boot script embeds the durable size and ThemeRuntime seeds
    // its initial snapshot from the boot-written body variable, so activation
    // never flashes the default while the settings read is in flight.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await expect.poll(readFontSize, { timeout: 5_000 }).toBe('16px')
    expect(await readSecondaryFontSize()).toBe('14px')

    // Restore the default for the specs that follow (and the dialog golden).
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const restored = page.getByRole('dialog', { name: '设置' })
    await restored.waitFor({ timeout: 10_000 })
    await restored.getByText('16', { exact: true }).hover()
    const decrease = restored.getByRole('button', { name: '减小字号' })
    await decrease.click()
    await restored.getByText('15', { exact: true }).waitFor({ timeout: 5_000 })
    await decrease.click()
    await restored.getByText('14', { exact: true }).waitFor({ timeout: 5_000 })
    await expect.poll(readFontSize, { timeout: 5_000 }).toBe('14px')
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('persists the completed-Turn transcript mode across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-transcript-view'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByText('对话显示', { exact: true }).waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Compact', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Normal', exact: true }).click()
    await dialog.getByRole('button', { name: 'Normal', exact: true }).waitFor({ timeout: 10_000 })
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-chat:\n\s+transcriptView: normal/)
    await page.keyboard.press('Escape')

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const reloaded = page.getByRole('dialog', { name: '设置' })
    await reloaded.getByRole('button', { name: 'Normal', exact: true }).waitFor({ timeout: 10_000 })

    await reloaded.getByRole('button', { name: 'Normal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Compact', exact: true }).click()
    await reloaded.getByRole('button', { name: 'Compact', exact: true }).waitFor({ timeout: 10_000 })
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-chat:\n\s+transcriptView: compact/)
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
      await secondPage.goto(second.authenticatedUrl, { waitUntil: 'load' })
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
      await secondPage.goto(second.authenticatedUrl, { waitUntil: 'load' })
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
      await enPage.goto(fresh.authenticatedUrl, { waitUntil: 'load' })
      await enPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      expect(await enPage.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
      await enPage.getByRole('button', { name: 'Settings', exact: true }).click()
      const dialog = enPage.getByRole('dialog', { name: 'Settings' })
      await dialog.waitFor({ timeout: 10_000 })
      await dialog.getByRole('button', { name: 'English' }).waitFor({ timeout: 10_000 })
      // The plugin list resolves shipped preset names through the en
      // dictionaries instead of echoing the preset files' Chinese metadata.
      await dialog.getByRole('button', { name: 'Plugins', exact: true }).click()
      await dialog.getByRole('tab', { name: 'Plugin list', exact: true }).click()
      const presetSwitcher = dialog.getByRole('button', { name: 'Choose the agent preset to inspect' })
      await presetSwitcher.waitFor({ timeout: 10_000 })
      expect(await presetSwitcher.textContent()).toBe('Standard mode (default)')
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
      await frPage.goto(fresh.authenticatedUrl, { waitUntil: 'load' })
      await frPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      expect(await frPage.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
      await frPage.getByRole('button', { name: 'Settings', exact: true }).click()
      const dialog = frPage.getByRole('dialog', { name: 'Settings' })
      await dialog.waitFor({ timeout: 10_000 })
      await dialog.getByRole('button', { name: 'English' }).waitFor({ timeout: 10_000 })
      // A locale-owned nav label proves the dictionaries resolved to en.
      await dialog.getByRole('button', { name: 'Agent presets' }).waitFor({ timeout: 10_000 })
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

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'desktop-settings.expected.md',
      'dialog-en.expected.md',
      'dialog.expected.md',
      'phone-devices-runtime-ready.expected.md',
      'phone-devices.expected.md',
      'plugins.expected.md',
    ])
  })
})
