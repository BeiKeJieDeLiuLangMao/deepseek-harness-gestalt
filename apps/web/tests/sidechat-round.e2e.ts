import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'
import {
  SIDE_CHAT_DESCENDANT_SETTLED_RESPONSE,
  SIDE_CHAT_RESPONSE,
  SIDE_CHAT_RESUME_RESPONSE,
  sideChatRoundReplayConfig,
} from './sidechat-round.fixture.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/sidechat-round', import.meta.url))
const EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const RESTORED_EXPECTED = join(SNAPSHOT_DIR, 'restored.expected.md')
const COLD_RESTORED_EXPECTED = join(SNAPSHOT_DIR, 'cold-restored.expected.md')
const PICKER_EXPECTED = join(SNAPSHOT_DIR, 'picker.expected.md')
const FLOAT_EXPECTED = join(SNAPSHOT_DIR, 'float.expected.md')
const DESCENDANT_EXPECTED = join(SNAPSHOT_DIR, 'descendant.expected.md')
const FAILURE_EXPECTED = join(SNAPSHOT_DIR, 'failure.expected.md')
const MODE = webSnapshotMode()
const PROMPT = 'Reply with a one-sentence description of event sourcing, then stop.'
const FAILURE_PROMPT = 'Keep this draft after the Side Chat admission refusal.'
const RESUME_PROMPT = 'Restate that description in one sentence after restoring this Side Chat.'
const DESCENDANT_PROMPT = 'Describe event sourcing in one sentence for a nested Side Chat, then stop.'
const SIDE_BOUNDARY_PREFIX = 'Side conversation boundary'
const SIDE_SKILL = 'side-chat-catalog'
const ALTERNATE_PROVIDER = 'sidechat-keyless-alternate'
const ALTERNATE_MODEL = 'model-b'
const ALTERNATE_MODEL_NAME = 'SideChat Test B'
const ALTERNATE_RESPONSE = 'The first Side Chat request used its selected alternate model.'

function latestPermissionPreset(events: readonly SessionEvent[]): string | undefined {
  return events.findLast(event => event.type === 'permission/preset')?.data.preset
}

async function seedSideChatSkill(workspaceCwd: string): Promise<void> {
  const directory = join(workspaceCwd, 'workspace', '.agents', 'skills', SIDE_SKILL)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), [
    '---',
    `name: ${SIDE_SKILL}`,
    'description: Verify the Side Chat composer catalog route',
    'disable-model-invocation: true',
    '---',
    '',
    'Reply through the ordinary Side Chat prompt route.',
    '',
  ].join('\n'))
}

/** Keyless alternate route that records the exact first Side Chat request. */
class AlternateSideChatAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'SideChat Test' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: ALTERNATE_MODEL, name: ALTERNATE_MODEL_NAME }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: ALTERNATE_MODEL_NAME })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: ALTERNATE_RESPONSE } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe.skipIf(MODE === 'record')('web e2e: Side Chat through the shipped workbench', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const requestObservations: {
    sessionId: string
    turn: number
    step: number
    precedingEvent: SessionEvent | undefined
  }[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      replayFixture: sideChatRoundReplayConfig.file,
      replayChildFixtures: sideChatRoundReplayConfig.childFiles ?? [],
      compareReplaySession: false,
      paceMs: 25,
    })
    scaffold.ctx.on('agent/request', ({ agent, turn, step }, next) => {
      requestObservations.push({
        sessionId: agent.id,
        turn,
        step,
        precedingEvent: agent.session.ownEvents().at(-1),
      })
      return next()
    })
    await seedSideChatSkill(scaffold.workspaceCwd)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 800)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('logs inherited context separately, settles the child, and renders its transcript', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidechat-round'))
    const parentSettled = scaffold.whenTurnSettled()
    const composer = page.locator('[data-composer-input][contenteditable="true"]').first()
    await composer.fill(PROMPT)
    await composer.press('Enter')
    const parentId = await parentSettled
    const liveIdsBeforeSideChat = scaffold.ctx.agents.list().map(agent => agent.id)

    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
    const panel = page.locator('[data-dsh-panel]:not([data-dsh-bottom-panel]):visible')
    await panel.getByRole('button', { name: 'Side Chat', exact: true }).waitFor({ timeout: 15_000 })
    await compareOrRefreshGolden(
      PICKER_EXPECTED,
      await captureStableAria(page, '[data-dsh-panel]', scaffold.workspaceCwd),
      MODE,
    )
    await page.getByRole('button', { name: 'New tab', exact: true }).click()
    const menuLabels = await page.getByRole('menuitem').allTextContents()
    expect(menuLabels).toContain('Side Chat')
    const menuItem = page.getByRole('menuitem', { name: 'Side Chat', exact: true })
    expect(await menuItem.locator('svg').count()).toBe(1)
    await page.keyboard.press('Escape')
    await panel.getByRole('button', { name: 'Side Chat', exact: true }).click()
    const sideComposer = panel.locator('[data-composer-input][contenteditable="true"]')
    await sideComposer.waitFor({ timeout: 15_000 })
    expect(await panel.getByRole('button', { name: 'Choose workspace', exact: true }).count()).toBe(0)
    expect(await panel.getByRole('button', { name: 'Standard mode', exact: true }).count()).toBe(0)
    expect(scaffold.ctx.agents.list().map(agent => agent.id)).toEqual(liveIdsBeforeSideChat)

    const sideChatTab = panel.locator('[draggable="true"]').first()
    await sideChatTab.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Move to Free Window', exact: true }).click()
    const float = page.locator('[data-dsh-float-window]')
    await float.waitFor({ timeout: 15_000 })
    await compareOrRefreshGolden(
      FLOAT_EXPECTED,
      await captureStableAria(page, '[data-dsh-float-window]', scaffold.workspaceCwd),
      MODE,
    )
    await float.getByText('New thread', { exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Dock Back to Sidebar', exact: true }).click()
    await expect.poll(() => float.count()).toBe(0)
    await sideComposer.waitFor({ timeout: 15_000 })

    await writeComposerDraft(page, sideComposer, '/')
    const triggerMenu = page.getByRole('listbox', { name: 'Trigger suggestions' })
    await triggerMenu.waitFor({ timeout: 15_000 })
    await expect.poll(
      () => triggerMenu.getByRole('option').allTextContents(),
      { timeout: 15_000 },
    ).toEqual(expect.arrayContaining([expect.stringContaining(SIDE_SKILL)]))
    await triggerMenu.getByRole('option', { name: new RegExp(SIDE_SKILL) }).click()
    await expect.poll(() => sideComposer.textContent()).toBe(`/${SIDE_SKILL} `)
    await writeComposerDraft(page, sideComposer, '')
    expect(scaffold.ctx.agents.list().map(agent => agent.id)).toEqual(liveIdsBeforeSideChat)

    const selectSideModel = async () => {
      const trigger = panel.getByRole('button', { name: /^Select model, current DeepSeek-V4-Flash$/u })
      await trigger.waitFor({ timeout: 15_000 })
      await trigger.click()
      await panel.getByRole('menuitem', { name: /^Model/u }).click()
      const option = page.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash', exact: true })
      await option.waitFor({ timeout: 15_000 })
      await option.click()
      expect(await panel.getByText(/^Model operation failed:/u).count()).toBe(0)
    }
    await selectSideModel()
    expect(scaffold.ctx.agents.list().map(agent => agent.id)).toEqual(liveIdsBeforeSideChat)

    const childSettled = scaffold.whenTurnSettled()
    await sideComposer.fill(PROMPT)
    await sideComposer.press('Enter')
    const childId = await childSettled
    expect(childId).not.toBe(parentId)

    await panel.getByText(SIDE_CHAT_RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })
    await selectSideModel()
    const selected = await page.request.post(`${scaffold.baseUrl}/sidebar/api/sidechat.selectModel`, {
      data: {
        childId,
        selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      },
    })
    expect(selected.ok()).toBe(true)
    const child = scaffold.ctx.agents.get(childId)
    expect(child).toBeDefined()
    const parent = scaffold.ctx.agents.get(parentId)
    expect(parent).toBeDefined()

    await panel.getByRole('button', { name: 'Access mode, current: Workspace Write' }).click()
    const permissionResponse = page.waitForResponse(response => (
      response.url().endsWith('/sidebar/api/sidechat.permission')
    ))
    await page.getByRole('menuitem', { name: 'Read Only', exact: true }).click()
    const permission = await permissionResponse
    const permissionBody = await permission.text()
    if (!permission.ok()) throw new Error(`sidechat.permission ${permission.status()}: ${permissionBody}`)
    await panel.getByRole('button', { name: 'Access mode, current: Read Only' }).waitFor({ timeout: 10_000 })
    await expect.poll(() => [
      latestPermissionPreset(parent?.session.ownEvents() ?? []),
      latestPermissionPreset(child?.session.ownEvents() ?? []),
    ], { timeout: 10_000 }).toEqual(['read-only', 'read-only'])

    const injection = child?.session.ownEvents().find((event: SessionEvent) => {
      if (event.type !== 'user/message') return false
      const first = event.data.content[0]
      return first?.type === 'text' && first.text.startsWith(SIDE_BOUNDARY_PREFIX)
    })
    expect(injection?.type).toBe('user/message')
    if (injection?.type !== 'user/message') throw new Error('Side Chat boundary injection was not logged')
    const boundary = injection.data.content[0]
    expect(boundary?.type).toBe('text')
    if (boundary?.type !== 'text') throw new Error('Side Chat boundary injection was not text')
    expect(boundary.text).toMatch(new RegExp(`^${SIDE_BOUNDARY_PREFIX}`))
    expect(injection.data.source).toEqual(expect.objectContaining({
      kind: 'plugin',
      plugin: 'dsh-better-sidebar',
    }))

    await compareOrRefreshGolden(
      EXPECTED,
      await captureStableAria(page, '[data-dsh-panel]', scaffold.workspaceCwd),
      MODE,
    )

    const disposed = await page.request.post(`${scaffold.baseUrl}/sidebar/api/sidechat.dispose`, {
      data: { childId },
    })
    expect(disposed.ok()).toBe(true)
    await expect.poll(() => scaffold.ctx.agents.get(childId)).toBeUndefined()
    const exclusiveWriter = await scaffold.ctx.sessionPersistence.open(childId, 'write')
    try {
      const childEventsBeforeFailure = await exclusiveWriter.read()
      const failureMessage = `thread resume failed: session "${childId}" is already owned by an active write handle`
      const refusalResponse = page.waitForResponse(response => (
        response.url().endsWith('/sidebar/api/sidechat.prompt')
      ))
      await sideComposer.fill(FAILURE_PROMPT)
      await sideComposer.press('Enter')
      const refusal = await refusalResponse
      expect(refusal.status()).toBe(500)
      expect(await refusal.json()).toEqual({
        ok: false,
        error: { code: 'sidechat-error', message: failureMessage },
      })
      const failureAlert = page.getByRole('alert').filter({
        hasText: `${failureMessage} (gateway/internal)`,
      })
      await failureAlert.waitFor({ timeout: 10_000 })
      await expect.poll(() => sideComposer.textContent()).toBe(FAILURE_PROMPT)
      expect(await exclusiveWriter.read()).toEqual(childEventsBeforeFailure)
      await compareOrRefreshGolden(
        FAILURE_EXPECTED,
        await captureStableAria(page, '[role="alert"]', scaffold.workspaceCwd),
        MODE,
      )
    } finally {
      await exclusiveWriter.close()
    }

    await expect.poll(async () => {
      const listed = await scaffold.ctx.sessionController.list({}, AbortSignal.timeout(5_000))
      return listed.items.find(item => item.sessionId === childId)
    }, { timeout: 15_000 }).toMatchObject({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      blank: false,
    })

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('dsh-sidebar:v1:')) localStorage.removeItem(key)
      }
    })
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    const expandSidebar = page.getByRole('button', { name: 'Expand sidebar', exact: true })
    if (!await panel.isVisible()) {
      await expandSidebar.waitFor({ timeout: 15_000 })
      await expandSidebar.click()
    }
    await panel.getByText(PROMPT, { exact: true }).waitFor({ timeout: 15_000 })
    await compareOrRefreshGolden(
      RESTORED_EXPECTED,
      await captureStableAria(page, '[data-dsh-panel]', scaffold.workspaceCwd),
      MODE,
    )
    await panel.getByRole('button', {
      name: 'Select model, current DeepSeek-V4-Flash',
      exact: true,
    }).waitFor({ timeout: 15_000 })

    const resumedSettled = scaffold.whenTurnSettled()
    const restoredComposer = panel.locator('[data-composer-input][contenteditable="true"]')
    await restoredComposer.fill(RESUME_PROMPT)
    await restoredComposer.press('Enter')
    expect(await resumedSettled).toBe(childId)
    await panel.getByText(SIDE_CHAT_RESUME_RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })

    const childAgent = scaffold.ctx.agents.get(childId)
    if (childAgent === undefined) throw new Error('Side Chat child Agent was not live')
    const eventsBeforeDescendant = childAgent.session.ownEvents()
    expect(requestObservations.filter(request => request.sessionId === childId)).toHaveLength(2)
    const descendantEventCut = eventsBeforeDescendant.length
    const descendantSettled = scaffold.whenTurnSettled()
    const descendant = await scaffold.ctx.subagents.startContinuable({
      provider: 'spawn',
      label: 'Nested Side Chat',
      signal: new AbortController().signal,
      request: {
        prompt: [{ type: 'text', text: DESCENDANT_PROMPT }],
        parent: childAgent,
      },
    })
    expect(await descendantSettled).toBe(descendant.childId)
    await expect.poll(() => requestObservations
      .filter(request => request.sessionId === childId).length, {
      timeout: 15_000,
    }).toBe(3)
    await childAgent.whenIdle()

    const childRequests = requestObservations.filter(request => request.sessionId === childId)
    expect(childRequests).toHaveLength(3)
    const thirdRequest = childRequests[2]
    const wakeSuffix = childAgent.session.ownEvents().slice(descendantEventCut)
    const stepStarts = wakeSuffix.filter(event => event.type === 'step/start')
    const settledMessages = wakeSuffix.filter(event => (
      event.type === 'user/message' && event.data.source.kind === 'subagent-settled'
    ))
    const assistants = wakeSuffix.filter(event => event.type === 'assistant/message')
    const stepEnds = wakeSuffix.filter(event => event.type === 'step/end')
    const turnEnds = wakeSuffix.filter(event => event.type === 'turn/end')
    expect(stepStarts).toHaveLength(1)
    expect(settledMessages).toHaveLength(1)
    expect(assistants).toHaveLength(1)
    expect(stepEnds).toHaveLength(1)
    expect(turnEnds).toHaveLength(1)
    const stepStart = stepStarts[0]
    const settledMessage = settledMessages[0]
    const assistant = assistants[0]
    const stepEnd = stepEnds[0]
    const turnEnd = turnEnds[0]
    if (thirdRequest === undefined || stepStart === undefined || settledMessage === undefined
      || assistant === undefined || stepEnd === undefined || turnEnd === undefined) {
      throw new Error('Nested Side Chat wake did not produce one complete parent turn')
    }
    expect(thirdRequest).toMatchObject({
      turn: stepStart.data.turn,
      step: stepStart.data.step,
      precedingEvent: {
        type: 'user/message',
        seq: settledMessage.seq,
        data: {
          source: {
            kind: 'subagent-settled',
            senderSessionId: descendant.childId,
          },
        },
      },
    })
    expect(assistant.data).toMatchObject({
      turn: stepStart.data.turn,
      step: stepStart.data.step,
    })
    expect(assistant.data.message.content).toContainEqual({
      type: 'text',
      text: SIDE_CHAT_DESCENDANT_SETTLED_RESPONSE,
    })
    expect(stepEnd.data).toEqual({
      turn: stepStart.data.turn,
      step: stepStart.data.step,
    })
    expect(turnEnd.data).toEqual({
      turn: stepStart.data.turn,
      reason: { kind: 'completed' },
    })
    expect(settledMessage.seq).toBeGreaterThan(stepStart.seq)
    expect(assistant.seq).toBeGreaterThan(settledMessage.seq)
    expect(stepEnd.seq).toBeGreaterThan(assistant.seq)
    expect(turnEnd.seq).toBeGreaterThan(stepEnd.seq)
    await panel.getByText(SIDE_CHAT_DESCENDANT_SETTLED_RESPONSE, { exact: true })
      .waitFor({ timeout: 30_000 })
    const descendants = panel.getByRole('button', { name: '1 subagent', exact: true })
    await descendants.waitFor({ timeout: 15_000 })
    await descendants.hover()
    const tree = page.getByRole('tree', { name: 'Subagent sessions' })
    const nested = tree.getByRole('treeitem', { name: /Nested Side Chat/u })
    await nested.waitFor({ timeout: 15_000 })
    await nested.click()
    await panel.getByText(DESCENDANT_PROMPT, { exact: false }).waitFor({ timeout: 30_000 })
    await panel.getByText(SIDE_CHAT_RESPONSE, { exact: true }).waitFor({ timeout: 30_000 })
    await compareOrRefreshGolden(
      DESCENDANT_EXPECTED,
      await captureStableAria(page, '[data-dsh-panel]', scaffold.workspaceCwd),
      MODE,
    )
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await expect.poll(() => scaffold.ctx.agents.get(childId)).toBeUndefined()
    await expect.poll(() => [...scaffold.ctx.workspaceRegistry.archivedSessionIds])
      .toContain(childId)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'descendant.expected.md',
      'failure.expected.md',
      'float.expected.md',
      'picker.expected.md',
      'restored-child.jsonl',
      'restored.expected.md',
      'cold-restored.expected.md',
      'ui.expected.md',
    ])
  })
})

describe.skipIf(MODE === 'record')('web e2e: Side Chat provisional model authority', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let harnessHome: string
  let scaffoldClosed = false
  const adapter = new AlternateSideChatAdapter()
  const starts: Record<string, unknown>[] = []

  beforeAll(async () => {
    harnessHome = await mkdtemp(join(tmpdir(), 'dsh-sidechat-cold-web-'))
    scaffold = await launchWebScaffold({
      harnessHome,
      replayFixture: sideChatRoundReplayConfig.file,
      compareReplaySession: false,
    })
    scaffold.ctx.effect(
      () => scaffold.ctx.llm.registerAdapter([ALTERNATE_PROVIDER], adapter),
      'web e2e: Side Chat alternate model',
    )
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 800)
    tripwire = watchConsole(page)
    page.on('request', (request) => {
      if (!request.url().endsWith('/sidebar/api/sidechat.start')) return
      starts.push(request.postDataJSON() as Record<string, unknown>)
    })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, harnessHome)
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    try { await browser?.close() } catch (error) { failures.push(error) }
    try {
      if (!scaffoldClosed) await scaffold?.close()
    } catch (error) { failures.push(error) }
    try {
      if (harnessHome !== undefined) await rm(harnessHome, { recursive: true, force: true })
    } catch (error) { failures.push(error) }
    if (failures.length > 0) throw new AggregateError(failures, 'cold Side Chat test cleanup failed')
  })

  it('keeps model B through post-selection inspection and uses it for the first prompt', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidechat-model-authority'))
    const parentSettled = scaffold.whenTurnSettled()
    const parentComposer = page.locator('[data-composer-input][contenteditable="true"]').first()
    await parentComposer.fill(PROMPT)
    await parentComposer.press('Enter')
    const parentId = await parentSettled

    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
    const panel = page.locator('[data-dsh-panel]:not([data-dsh-bottom-panel]):visible')
    await panel.getByRole('button', { name: 'Side Chat', exact: true }).click()
    const sideComposer = panel.locator('[data-composer-input][contenteditable="true"]')
    await sideComposer.waitFor({ timeout: 15_000 })

    const initialModel = panel.getByRole('button', {
      name: 'Select model, current DeepSeek-V4-Flash',
      exact: true,
    })
    await initialModel.click({ timeout: 15_000 })
    await panel.getByRole('menuitem', { name: /^Model/u }).click()
    await page.getByRole('menuitemradio', { name: ALTERNATE_MODEL_NAME, exact: true }).click()
    await panel.getByRole('button', {
      name: `Select model, current ${ALTERNATE_MODEL_NAME}`,
      exact: true,
    }).waitFor({ timeout: 15_000 })

    const childSettled = scaffold.whenTurnSettled()
    await sideComposer.fill('Use the selected alternate route for this first Side Chat prompt.')
    await sideComposer.press('Enter')
    const childId = await childSettled
    expect(childId).not.toBe(parentId)
    await panel.getByText(ALTERNATE_RESPONSE, { exact: true }).waitFor({ timeout: 15_000 })
    expect(starts).toEqual([{
      sessionId: parentId,
      childId,
      text: 'Use the selected alternate route for this first Side Chat prompt.',
      selection: { provider: ALTERNATE_PROVIDER, model: ALTERNATE_MODEL },
      requestId: expect.any(String) as unknown,
    }])
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]).toMatchObject({
      provider: ALTERNATE_PROVIDER,
      model: ALTERNATE_MODEL,
    })
    const child = scaffold.ctx.agents.get(childId)
    expect(child?.session.ownEvents().find(event => (
      event.type === 'user/message' && event.data.source.kind === 'user'
    ))).toMatchObject({
      data: { source: { kind: 'user', rpcId: starts[0]?.requestId } },
    })
    expect(child?.session.ownEvents().findLast(event => event.type === 'request/header')).toMatchObject({
      data: { header: { config: { provider: ALTERNATE_PROVIDER, model: ALTERNATE_MODEL } } },
    })
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])

    await panel.getByRole('button', { name: 'Access mode, current: Workspace Write', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Read Only', exact: true }).click()
    await panel.getByRole('button', { name: 'Access mode, current: Read Only', exact: true }).waitFor()
    await expect.poll(() => latestPermissionPreset(child?.session.ownEvents() ?? [])).toBe('read-only')
    const childTab = panel.locator('[draggable="true"][title]')
      .filter({ has: page.getByRole('button', { name: 'Close', exact: true }) })
    expect(await childTab.count()).toBe(1)
    const childTabTitle = await childTab.getAttribute('title')
    if (childTabTitle === null) throw new Error('the published Side Chat tab has no title')
    const persistenceRoot = join(harnessHome, 'session-backup')
    const storageRoot = join(harnessHome, 'storage-backup')
    await browser.close()
    await scaffold.closeWithStateBackup({ persistenceRoot, storageRoot })
    scaffoldClosed = true
    scaffold = await launchWebScaffold({ harnessHome, persistenceSeed: persistenceRoot, storageSeed: storageRoot })
    scaffoldClosed = false
    scaffold.ctx.effect(
      () => scaffold.ctx.llm.registerAdapter([ALTERNATE_PROVIDER], adapter),
      'web e2e: cold Side Chat alternate model',
    )
    expect(scaffold.ctx.agents.get(parentId)?.id, 'parent Agent remains cold').toBeUndefined()
    expect(scaffold.ctx.agents.get(childId)?.id, 'child Agent starts cold').toBeUndefined()
    expect((await scaffold.ctx.subagents.remoteExportList(parentId, new AbortController().signal)).parentAvailable)
      .toBe(false)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 800)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const parentRow = page.locator(`[data-session-row="${parentId}"]`)
    const workspaceRow = page.getByRole('treeitem').first()
    await workspaceRow.waitFor({ timeout: 15_000 })
    if (await workspaceRow.getAttribute('aria-expanded') === 'false') await workspaceRow.click()
    await parentRow.click({ timeout: 15_000 })
    const restoredPanel = page.locator('[data-dsh-panel]:not([data-dsh-bottom-panel]):visible')
    if (!await restoredPanel.isVisible()) {
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
    }
    const restoredTab = restoredPanel.getByTitle(childTabTitle, { exact: true })
      .filter({ has: page.getByRole('button', { name: 'Close', exact: true }) })
    await restoredTab.click({ timeout: 15_000 })
    await restoredPanel.getByRole('button', { name: `Select model, current ${ALTERNATE_MODEL_NAME}`, exact: true })
      .waitFor({ timeout: 15_000 })
    await restoredPanel.getByRole('button', { name: 'Access mode, current: Read Only', exact: true }).waitFor()
    await compareOrRefreshGolden(
      COLD_RESTORED_EXPECTED,
      await captureStableAria(page, '[data-dsh-panel]', scaffold.workspaceCwd),
      MODE,
    )
    const resumed = scaffold.whenTurnSettled()
    const restoredComposer = restoredPanel.locator('[data-composer-input][contenteditable="true"]:visible')
    await restoredComposer.fill('Continue the same child after cold restoration.')
    await restoredComposer.press('Enter')
    expect(await resumed).toBe(childId)
    await expect.poll(() => adapter.requests.length).toBe(2)
    expect(adapter.requests[1]).toMatchObject({ provider: ALTERNATE_PROVIDER, model: ALTERNATE_MODEL })
    const resumedChild = scaffold.ctx.agents.get(childId)
    expect(resumedChild?.session.ownEvents().filter(event => event.type === 'turn/end')).toHaveLength(2)
    expect(latestPermissionPreset(resumedChild?.session.ownEvents() ?? [])).toBe('read-only')
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})
