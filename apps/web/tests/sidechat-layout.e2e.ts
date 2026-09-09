// Keyless assembled-browser coverage for Side Chat sizing and ownership inside
// the official workbench. The child stays blank so its empty layout is observed
// before its first Agent or durable event exists.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
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
const CREATE_PROMPT = 'Create and inspect the child-owned files.'
const FILE_RESPONSE = 'The child-owned files are ready.'
const CHILD_FILE = 'child-owned.md'
const CHILD_TARGET_LINE = 80
const CHILD_TARGET = 'SIDECHAT_TARGET_LINE_080'
const CHILD_CONTENT = `${Array.from({ length: 120 }, (_, index) => {
  if (index === 0) return '# Child file'
  if (index + 1 === CHILD_TARGET_LINE) return CHILD_TARGET
  return `Child filler line ${String(index + 1).padStart(3, '0')}.`
}).join('\n')}\n`
const CHILD_FILES = [CHILD_FILE, ...Array.from({ length: 6 }, (_, index) => `child-extra-${String(index + 1)}.txt`)]
const SHOT_DIR = fileURLToPath(new URL('../../../.artifacts/screenshots/sidechat-layout', import.meta.url))

class SideChatLayoutAdapter extends LlmAdapter {
  private childFileStage = 0

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: MODEL_NAME }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: MODEL, name: MODEL_NAME }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: MODEL_NAME })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (JSON.stringify(options.messages).includes(CREATE_PROMPT) && this.childFileStage === 0) {
      this.childFileStage = 1
      for (const [index, path] of CHILD_FILES.entries()) {
        const id = ToolCallId(`sidechat-write-${String(index)}`)
        const args = JSON.stringify({
          file_path: path,
          content: path === CHILD_FILE ? CHILD_CONTENT : `Extra child file ${String(index)}.\n`,
        })
        yield { type: 'block-start', index, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index, id, name: 'write', argumentsDelta: args }
        yield { type: 'block-end', index, block: { type: 'tool-call', id, name: 'write', arguments: args } }
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (JSON.stringify(options.messages).includes(CREATE_PROMPT) && this.childFileStage === 1) {
      this.childFileStage = 2
      const id = ToolCallId('sidechat-read-child-line')
      const args = JSON.stringify({ file_path: CHILD_FILE, offset: CHILD_TARGET_LINE, limit: 1 })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'read', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'read', arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (JSON.stringify(options.messages).includes(CREATE_PROMPT)) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: FILE_RESPONSE } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
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

  it('fills every workbench mode and keeps file actions on the Side Chat Session', async () => {
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
    const parentId = await parentSettled
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
    const childId = await childSettled
    expect(childId).not.toBe(parentId)
    await sidechat.getByText(RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })
    expectAnchored(await geometry(sidechat))
    expect(await mainComposer.textContent()).toBe(MAIN_DRAFT)
    expect(await sidechat.getByText(/seeded session constructor seed/u).count()).toBe(0)
    await shot(page, '04-nonempty-push')

    const sidechatTabId = await panel.locator('[data-dockkit-tab][aria-selected="true"]')
      .getAttribute('data-dockkit-tab')
    if (sidechatTabId === null) throw new Error('Side Chat tab has no durable tab id')
    const fileSettled = scaffold.whenTurnSettled()
    await sideComposer.fill(CREATE_PROMPT)
    await sideComposer.press('Enter')
    expect(await fileSettled).toBe(childId)
    await sidechat.getByText(FILE_RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })
    expect(readFileSync(join(scaffold.workspaceCwd, 'workspace', CHILD_FILE), 'utf8')).toBe(CHILD_CONTENT)
    const process = sidechat.locator('[data-turn-process]').last()
    if (await process.getAttribute('aria-expanded') !== 'true') await process.click()
    const readRow = sidechat.locator('[data-variant="read"]').last()
    await readRow.waitFor({ timeout: 15_000 })
    await readRow.getByRole('button', { name: CHILD_FILE, exact: true }).click()

    const fileHost = panel.locator('[data-official-file-host]')
    await fileHost.waitFor({ timeout: 15_000 })
    expect(await fileHost.getAttribute('data-official-file-host'))
      .toContain(`/session/${encodeURIComponent(String(childId))}/${CHILD_FILE}`)
    const pathInput = fileHost.locator(`input[title$="/${CHILD_FILE}"]`)
    await pathInput.waitFor({ timeout: 15_000 })
    await expect.poll(() => pathInput.inputValue()).toBe(CHILD_FILE)
    const targetLine = fileHost.locator('.cm-line').filter({ hasText: CHILD_TARGET })
    await targetLine.waitFor({ timeout: 15_000 })
    const scroller = fileHost.locator('.cm-scroller')
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    const [targetBox, scrollerBox] = await Promise.all([targetLine.boundingBox(), scroller.boundingBox()])
    if (targetBox === null || scrollerBox === null) throw new Error('target line landing is not measurable')
    expect(targetBox.y).toBeGreaterThanOrEqual(scrollerBox.y)
    expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(scrollerBox.y + scrollerBox.height)
    await shot(page, '05-child-line-80-landing')
    const editMode = fileHost.getByRole('button', { name: 'Edit', exact: true })
    const previewMode = fileHost.getByRole('button', { name: 'Preview', exact: true })
    expect(await editMode.getAttribute('class')).not.toBe(await previewMode.getAttribute('class'))
    await targetLine.click()
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    await page.keyboard.press('End')
    await page.keyboard.up('Shift')
    const addSelection = page.getByRole('button', { name: 'Add to conversation', exact: true })
    await addSelection.waitFor({ timeout: 15_000 })
    await addSelection.click()

    await panel.locator(`[data-dockkit-tab="${sidechatTabId}"]`).click()
    await sideComposer.waitFor({ timeout: 15_000 })
    await expect.poll(() => sideComposer.textContent()).toContain(`${CHILD_FILE}:${String(CHILD_TARGET_LINE)}`)
    expect(await sideComposer.textContent()).toContain(CHILD_TARGET)
    expect(await mainComposer.textContent()).toBe(MAIN_DRAFT)
    await shot(page, '06-child-selection-routed')

    await sidechat.getByText('Show in folder', { exact: true }).click()
    const revealed = panel.locator('[data-dsh-revealed="true"]')
    await expect.poll(() => revealed.count(), { timeout: 15_000 })
      .toBe(CHILD_FILES.length)
    expect(await revealed.filter({ hasText: CHILD_FILE }).count()).toBe(1)
    expect(await mainComposer.textContent()).toBe(MAIN_DRAFT)
    await shot(page, '07-child-files-revealed')

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
    await shot(page, '08-empty-bottom')

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})
