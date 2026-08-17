// Keyless real-Web annotation flow: a replayed assistant Markdown response is
// selected in Chromium, edited through the shared Composer draft, and sent as
// one ordinary model-visible user message.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/text-annotation', import.meta.url))
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

describe('web e2e: text annotation becomes an ordinary model-visible message', () => {
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

  it('selects across Markdown spans, edits the draft, and sends localized prose', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-text-annotation'))
    const composer = page.locator('[data-composer-card] textarea').last()
    await composer.waitFor({ timeout: 10_000 })
    const firstSettled = scaffold.whenTurnSettled()
    await composer.fill(OPENING_PROMPT)
    await composer.press('Enter')
    await firstSettled
    await page.getByText('exact phrase', { exact: true }).waitFor({ timeout: 10_000 })

    const target = page.locator('[data-annotation-source]').last()
    await target.evaluate((element) => {
      const strong = element.querySelector('strong')
      if (strong === null) throw new Error('expected bold Markdown text')
      const before = strong.previousSibling
      const after = strong.nextSibling
      if (before === null || after === null) throw new Error('expected split Markdown text nodes')
      const range = document.createRange()
      range.setStart(before, 0)
      range.setEnd(after, 7)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    const toolbar = page.getByRole('toolbar')
    await expect(toolbar.getByRole('button').allTextContents()).resolves.toEqual(['Add annotation', 'Copy'])
    await toolbar.getByRole('button', { name: 'Add annotation' }).click()
    const editor = page.getByRole('dialog').getByRole('textbox')
    await editor.fill('Make concise')
    await page.getByRole('button', { name: 'Save annotation' }).click()

    const summary = page.getByRole('button', { name: '1 annotations' })
    await summary.focus()
    const details = page.getByRole('region', { name: '1 annotations' })
    await expect(details.isVisible()).resolves.toBe(true)
    await details.getByRole('button', { name: /Annotation 1:/ }).click()
    const reopened = page.getByRole('dialog').getByRole('textbox')
    await expect(reopened.inputValue()).resolves.toBe('Make concise')
    await reopened.fill('Keep the emphasis')
    await reopened.press('Enter')

    const secondSettled = scaffold.whenTurnSettled()
    await composer.fill(QUESTION)
    await composer.press('Enter')
    await secondSettled

    expect(userTexts(events)).toEqual([OPENING_PROMPT, COMPILED])
    await compareOrRefreshGolden(MODEL_EXPECTED, COMPILED, MODE)
    await expect(page.getByText(QUESTION, { exact: false }).count()).resolves.toBeGreaterThanOrEqual(1)
    await expect(page.getByRole('button', { name: '1 annotations' }).count()).resolves.toBe(0)
    expect(await page.evaluate(() => CSS.highlights?.has('annotation-draft-mark') ?? false)).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['model-visible.expected.md', 'replay.override.json'])
  })
})
