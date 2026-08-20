// Keyless real-Web annotation-draft persistence: a drafted question plus one
// text annotation survive a full page reload and a Session switch without
// mixing owners, and only clear after the Host admits the compiled message.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold,
  watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/annotation-persistence', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const OVERRIDE = join(SNAPSHOT_DIR, 'replay.override.json')
const MODEL_EXPECTED = join(SNAPSHOT_DIR, 'model-visible.expected.md')
const MODE = webSnapshotMode()
const OPENING_PROMPT = 'Give one short sentence with one bold phrase about editing.'
const QUESTION = 'Please make the passage more direct.'
const COMPILED = `${QUESTION}\n\nAnnotation 1\nQuoted text: “The exact phrase should”\nNote: Keep the emphasis`

function userTexts(events: readonly SessionEvent[]): string[] {
  return events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
    ? [event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')]
    : [])
}

describe('web e2e: annotation drafts persist per session and recover after reload', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const events: SessionEvent[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ replayFixture: FIXTURE, replayOverride: OVERRIDE, paceMs: 5 })
    scaffold.ctx.on('session/event', (_session, event: SessionEvent) => { events.push(event) })
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

  it('restores the exact draft with its mark after reload and keeps sessions isolated', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-annotation-persistence'))
    const composer = page.locator('[data-composer-card] textarea').last()
    await composer.waitFor({ timeout: 10_000 })
    const firstSettled = scaffold.whenTurnSettled()
    await composer.fill(OPENING_PROMPT)
    await composer.press('Enter')
    await firstSettled
    await page.getByText('exact phrase', { exact: true }).waitFor({ timeout: 10_000 })

    const target = page.locator('[data-annotation-source]').last()
    const selectPhrase = async (): Promise<void> => target.evaluate((element) => {
      const strong = element.querySelector('strong')
      if (strong === null) throw new Error('expected bold Markdown text')
      const before = strong.previousSibling?.firstChild
      const after = strong.nextSibling?.firstChild
      if (before === null || before === undefined || after === null || after === undefined) {
        throw new Error('expected registered Markdown text leaves')
      }
      const range = document.createRange()
      range.setStart(before, 0)
      range.setEnd(after, 7)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await selectPhrase()
    const toolbar = page.getByRole('toolbar')
    await toolbar.getByRole('button', { name: 'Add annotation' }).click()
    const editor = page.getByRole('dialog').getByRole('textbox')
    await editor.fill('Keep the emphasis')
    await page.getByRole('button', { name: 'Save annotation' }).click()
    const summary = page.getByRole('button', { name: '1 annotation' })
    await expect(summary.isVisible()).resolves.toBe(true)
    await composer.fill(QUESTION)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(true)

    // Full page reload: the persisted question and annotation draft return
    // together, and the Draft Mark rebuilds from its Text Anchor.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByText('exact phrase', { exact: true }).waitFor({ timeout: 15_000 })
    await expect(composer.inputValue()).resolves.toBe(QUESTION)
    await expect(summary.isVisible()).resolves.toBe(true)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(true)

    // Explicit discard removes the complete draft and every Draft Mark at
    // once; the question text stays, and the draft can be rebuilt afterwards.
    await page.getByRole('button', { name: 'Discard annotation draft' }).click()
    await expect(page.getByRole('button', { name: '1 annotation' }).count()).resolves.toBe(0)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(false)
    await expect(composer.inputValue()).resolves.toBe(QUESTION)
    await selectPhrase()
    await toolbar.getByRole('button', { name: 'Add annotation' }).click()
    await editor.fill('Keep the emphasis')
    await page.getByRole('button', { name: 'Save annotation' }).click()
    await expect(summary.isVisible()).resolves.toBe(true)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(true)

    // A forked sibling session owns an empty composer: no cross-session draft.
    const parentRowText = await page.locator('[role="treeitem"][aria-selected="true"]').textContent()
    if (parentRowText === null) throw new Error('expected the source session row')
    await page.getByRole('button', { name: 'Branch into a new conversation' }).last().click()
    await expect.poll(
      () => page.locator('[role="treeitem"]').count(),
      { timeout: 15_000 },
    ).toBe(3)
    await expect.poll(
      () => page.locator('[role="treeitem"][aria-selected="true"]').count(),
      { timeout: 10_000 },
    ).toBe(1)
    await composer.waitFor({ timeout: 10_000 })
    await expect(composer.inputValue()).resolves.toBe('')
    await expect(page.getByRole('button', { name: '1 annotation' }).count()).resolves.toBe(0)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(false)

    // Switching back to the source session restores its exact draft.
    await page.locator('[role="treeitem"]').filter({ hasText: parentRowText }).first().click()
    await page.getByText('exact phrase', { exact: true }).waitFor({ timeout: 15_000 })
    await expect(composer.inputValue()).resolves.toBe(QUESTION)
    await expect(summary.isVisible()).resolves.toBe(true)

    // Admission clears the persisted draft only after the send is accepted.
    const secondSettled = scaffold.whenTurnSettled()
    await composer.press('Enter')
    await secondSettled
    expect(userTexts(events)).toEqual([OPENING_PROMPT, COMPILED])
    await compareOrRefreshGolden(MODEL_EXPECTED, COMPILED, MODE)
    await expect.poll(
      () => page.getByRole('button', { name: '1 annotation' }).count(),
      { timeout: 10_000 },
    ).toBe(0)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 180_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['model-visible.expected.md', 'replay.override.json'])
  })
})
