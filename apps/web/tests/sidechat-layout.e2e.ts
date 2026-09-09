// Keyless assembled-browser coverage for Side Chat sizing and ownership inside
// the official workbench. The child stays blank so its empty layout is observed
// before its first Agent or durable event exists.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const PROVIDER = 'sidechat-layout'
const MODEL = 'layout-model'
const MODEL_NAME = 'Side Chat Layout Test'
const RESPONSE = 'The Side Chat remains anchored after its first response.'
const MAIN_DRAFT = 'Keep this main draft unchanged.'
const SHOT_DIR = fileURLToPath(new URL('../../../.artifacts/screenshots/sidechat-layout', import.meta.url))

class SideChatLayoutAdapter extends LlmAdapter {
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: MODEL_NAME }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: MODEL, name: MODEL_NAME }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: MODEL_NAME })
  }

  override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: RESPONSE } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

interface Rect {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
  readonly width: number
  readonly height: number
}

interface SideChatGeometry {
  readonly phase: string | null
  readonly host: Rect
  readonly sidechat: Rect
  readonly root: Rect
  readonly scroll: Rect
  readonly seat: Rect
  readonly nestedChrome: number
}

async function geometry(sidechat: Locator): Promise<SideChatGeometry> {
  return await sidechat.evaluate((sidechat) => {
    const root = sidechat.querySelector<HTMLElement>('[data-phase]')
    const scroll = root?.querySelector<HTMLElement>('[data-conversation-scroll]')
    const seat = root?.querySelector<HTMLElement>('[data-composer-seat]')
    const host = sidechat.parentElement?.parentElement
    if (
      root === null || scroll === undefined || scroll === null
      || seat === undefined || seat === null || host === undefined || host === null
    ) {
      throw new Error('Side Chat geometry chain is incomplete')
    }
    const rect = (node: Element): Rect => {
      const value = node.getBoundingClientRect()
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      }
    }
    return {
      phase: root.getAttribute('data-phase'),
      host: rect(host),
      sidechat: rect(sidechat),
      root: rect(root),
      scroll: rect(scroll),
      seat: rect(seat),
      nestedChrome: sidechat.querySelectorAll([
        '[data-sidebar-right-panel]',
        '[data-sidebar-bottom-panel]',
        '[data-sidebar-right-expand]',
        '[data-sidebar-bottom-toggle]',
        '[data-dsh-panel-host]',
        '[data-dsh-panel]',
      ].join(',')).length,
    }
  })
}

function expectAnchored(value: SideChatGeometry, minimumScrollHeight = 300): void {
  expect(value.phase).toBe('active')
  expect(value.nestedChrome).toBe(0)
  expect(Math.abs(value.host.height - value.sidechat.height)).toBeLessThan(2)
  expect(Math.abs(value.sidechat.height - value.root.height)).toBeLessThan(2)
  expect(value.scroll.height).toBeGreaterThan(minimumScrollHeight)
  expect(Math.abs(value.scroll.bottom - value.seat.bottom)).toBeLessThan(2)
  expect(value.seat.top).toBeGreaterThan(value.scroll.top + Math.min(100, minimumScrollHeight / 2))
}

/** Resize the right surface through the shipped frame grip. */
async function setRightWidth(page: Page, panel: Locator, target: number): Promise<void> {
  const handle = page.locator('[data-side="rightbar"]').first()
  const box = await panel.boundingBox()
  if (box === null) throw new Error('right panel is not rendered')
  const grip = await handle.boundingBox()
  if (grip === null) throw new Error('right panel grip is not rendered')
  const x = grip.x + grip.width / 2
  const y = grip.y + grip.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - (target - box.width), y, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await panel.boundingBox())?.width).toBeCloseTo(target, 0)
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true })
}

describe('web e2e: Side Chat fills the official workbench', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold()
    scaffold.ctx.effect(
      () => scaffold.ctx.llm.registerAdapter([PROVIDER], new SideChatLayoutAdapter()),
      'web e2e: Side Chat layout model',
    )
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('keeps empty and nonempty Side Chat content full-height in push and fullscreen modes', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidechat-layout'))
    const mainComposer = page.locator('[data-composer-input][contenteditable="true"]').first()
    const mainModel = page.getByRole('button', { name: /^Select model, current /u }).first()
    await mainModel.click()
    await page.getByRole('menuitem', { name: /^Model\b/u }).click()
    await page.getByRole('menuitemradio', { name: MODEL_NAME, exact: true }).click()
    await expect.poll(() => mainModel.getAttribute('aria-label')).toContain(MODEL_NAME)
    const parentSettled = scaffold.whenTurnSettled()
    await mainComposer.fill('Establish the parent session.')
    await mainComposer.press('Enter')
    await parentSettled
    await page.getByText(RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })
    await mainComposer.fill(MAIN_DRAFT)

    await page.locator('[data-sidebar-right-expand]').click()
    const panel = page.locator('[data-sidebar-right-panel]:visible')
    await panel.waitFor({ timeout: 15_000 })
    await panel.getByText('Side Chat', { exact: true }).click()
    const sidechat = panel.locator('[data-sidechat-content]:visible')
    await sidechat.waitFor({ timeout: 15_000 })
    const sideComposer = sidechat.locator('[data-composer-input][contenteditable="true"]')
    await sideComposer.waitFor({ timeout: 15_000 })

    expect(await page.locator('[data-composer-input][contenteditable="true"]').count()).toBe(2)
    expect(await mainComposer.textContent()).toBe(MAIN_DRAFT)
    expect(await sidechat.getByText('Into the Unknown Preview', { exact: true }).count()).toBe(0)
    expectAnchored(await geometry(sidechat))
    await shot(page, '01-empty-push')

    await setRightWidth(page, panel, 360)
    const narrow = await geometry(sidechat)
    expectAnchored(narrow)
    expect(narrow.sidechat.width).toBeGreaterThanOrEqual(358)
    expect(narrow.sidechat.width).toBeLessThanOrEqual(362)
    await shot(page, '02-empty-narrow')

    await panel.locator('[data-sidebar-right-mode="fullscreen"]').click()
    await expect.poll(() => panel.getAttribute('data-sidebar-right-panel')).toBe('fullscreen')
    expectAnchored(await geometry(sidechat))
    await shot(page, '03-empty-fullscreen')

    await panel.locator('[data-sidebar-right-mode="push"]').click()
    await expect.poll(() => panel.getAttribute('data-sidebar-right-panel')).toBe('push')
    const model = sidechat.getByRole('button', { name: /^Select model, current /u })
    await model.click()
    await page.getByRole('menuitem', { name: /^Model/u }).click()
    await page.getByRole('menuitemradio', { name: MODEL_NAME, exact: true }).click()
    await sidechat.getByRole('button', { name: `Select model, current ${MODEL_NAME}`, exact: true })
      .waitFor({ timeout: 15_000 })

    const childSettled = scaffold.whenTurnSettled()
    await sideComposer.fill('Confirm this Side Chat layout.')
    await sideComposer.press('Enter')
    await childSettled
    await sidechat.getByText(RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })
    expectAnchored(await geometry(sidechat))
    expect(await mainComposer.textContent()).toBe(MAIN_DRAFT)
    expect(await sidechat.getByText(/seeded session constructor seed/u).count()).toBe(0)
    await shot(page, '04-nonempty-push')

    await page.locator('[data-sidebar-bottom-toggle]').first().click()
    const bottom = page.locator('[data-sidebar-bottom-panel][data-sidebar-bottom-open]')
    await bottom.waitFor({ timeout: 15_000 })
    await bottom.getByText('Start', { exact: true }).click()
    await bottom.getByText('Side Chat', { exact: true }).click()
    const bottomSidechat = bottom.locator('[data-sidechat-content]:visible')
    await bottomSidechat.waitFor({ timeout: 15_000 })
    const bottomGeometry = await geometry(bottomSidechat)
    expectAnchored(bottomGeometry, 120)
    expect(bottomGeometry.host.height).toBeGreaterThan(150)
    expect(bottomGeometry.host.height).toBeLessThan(500)
    await shot(page, '05-empty-bottom')

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})
