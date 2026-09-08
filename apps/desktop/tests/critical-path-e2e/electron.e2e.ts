/** Visible single-installation Electron journey over create, restore, and archive phases. */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionId as SessionIdType } from '@deepseek-ai/dsh-session'
import { browser, expect } from '@wdio/globals'
import type {} from '@wdio/native-types'
import { captureOwnedProcessTree } from '../electron-runner-infrastructure.ts'
import {
  PARENT_MODEL, PARENT_RESPONSE, SIDE_MODEL, SIDE_RESPONSE, type CriticalPathPhase,
} from './keyless-model.ts'
import {
  hasExactCompletedOwnTurn,
  parseArchivedSessionIds,
  parseSessionState,
  parseStoredSessionLog,
  readOptionalFile,
  readProcessEvidence,
  recordProcessEvidence,
  type SessionStateEvidence,
  type StoredSessionLog,
} from './artifact-io.ts'
import { EDIT_PATH_BUTTON_SELECTOR, TASKS_TAB_SELECTOR } from './ui-selectors.ts'
import { replacePathInput } from './keyboard-input.ts'

const PARENT_PROMPT = 'Answer with the parent route marker.'
const SIDE_PROMPT = 'Check route B.'
const RESTORE_PROMPT = 'Check route B after restart.'
const SIDE_PROVIDER = 'side-gateway'

interface UiSessionCounts {
  readonly mainSessionRows: number
  readonly subagentRows: number
}

const phase = criticalPathPhase()

describe(`Desktop critical path: ${phase}`, () => {
  it(`runs the ${phase} phase through the shipped Electron UI`, async () => {
    await boot()
    if (phase === 'create') await createPhase()
    else if (phase === 'restore') await restorePhase()
    else await archivePhase()
  })
})

async function createPhase(): Promise<void> {
  await connectWorkspace()
  const mainComposer = await editableComposer(browser)
  await sendPrompt(mainComposer, PARENT_PROMPT)
  await waitForBodyText(PARENT_RESPONSE)

  let main: StoredSessionLog | undefined
  await browser.waitUntil(async () => {
    const logs = await sessionLogs()
    main = logs.find(log => log.header.parentSession === undefined && mainLogReady(log))
    return main !== undefined
  }, { timeout: 30_000, timeoutMsg: 'the main Session JSONL did not retain its complete model-A turn' })
  if (main === undefined) throw new Error('the main Session JSONL was unavailable')
  assertMainLog(main)

  await expandSidePanel()
  const panel = await visiblePanel()
  const tasksTab = await element(panel, TASKS_TAB_SELECTOR)
  await tasksTab.waitForClickable({ timeout: 10_000 })
  await tasksTab.click()
  const taskTree = await element(panel, '[role="tree"][aria-label="Tasks"]')
  await taskTree.waitForDisplayed({ timeout: 20_000 })
  await browser.waitUntil(async () => await taskTree.getAttribute('aria-busy') !== 'true', {
    timeout: 20_000,
    timeoutMsg: 'the Tasks tree did not settle before the provisional Side Chat check',
  })
  const rowsBeforeDraft = await uiSessionCounts()
  await openSideChatFromTabMenu(panel)
  await editableComposer(panel)
  const draft = await provisionalSideChat()
  expect(draft.parentSessionId).toBe(main.header.id)
  await assertDraftRemainsUnpublished(draft.threadId, rowsBeforeDraft)

  await configureSideProvider()
  await switchToSessionSurface()
  const restoredPanel = await visiblePanel()
  await selectSideModel(restoredPanel)
  await sendPrompt(await editableComposer(restoredPanel), SIDE_PROMPT)
  await waitForBodyText(SIDE_RESPONSE, 60_000)

  let child: StoredSessionLog | undefined
  await browser.waitUntil(async () => {
    const logs = await sessionLogs()
    child = logs.find(log => log.header.id === draft.threadId)
    return child !== undefined
  }, { timeout: 30_000, timeoutMsg: 'the Side Chat JSONL was not published after its first prompt' })
  if (child === undefined) throw new Error('the Side Chat JSONL was unavailable')
  expect(child.header).toMatchObject({
    id: draft.threadId,
    parentSession: main.header.id,
    origin: 'subagent',
  })
  await assertChildLog(child, 1, [SIDE_PROMPT])

  await setReadOnly(restoredPanel)
  await browser.waitUntil(async () => latestPermission(await childLog(draft.threadId)) === 'read-only', {
    timeout: 15_000,
    timeoutMsg: 'the Side Chat JSONL did not retain the Read Only permission',
  })
  const persisted = await childLog(draft.threadId)
  const state: SessionStateEvidence = {
    mainSessionId: main.header.id,
    childId: draft.threadId,
    ownSideRequestCount: ownRequestHeaders(persisted).length,
    permissionPreset: latestPermission(persisted) ?? '',
  }
  await writeSessionEvidence(main, persisted, [])
  await writeSessionState(state)
  await browser.saveScreenshot(join(phaseArtifactRoot(), 'created-side-chat.png'))
}

async function restorePhase(): Promise<void> {
  const state = await readSessionState()
  await expandSidePanel()
  const panel = await visiblePanel()
  await element(panel, `[title="${SIDE_PROMPT}"]`)
    .then(tab => tab.waitForDisplayed({ timeout: 30_000 }))
  const tabs = await persistedSideChats()
  expect(tabs.filter(tab => tab.threadId === state.childId)).toHaveLength(1)
  await modelTrigger(panel, SIDE_MODEL)
  await permissionTrigger(panel, 'Read Only')

  const mainRow = await element(browser, `[data-session-row="${state.mainSessionId}"]`)
  await mainRow.waitForClickable({ timeout: 15_000 })
  await mainRow.click()
  await modelTrigger(panel, SIDE_MODEL)

  const before = await childLog(state.childId)
  expect(ownRequestHeaders(before)).toHaveLength(state.ownSideRequestCount)
  const beforeOwnEventCount = ownEvents(before).length
  const visibleResponsesBefore = await visibleTextOccurrences(SIDE_RESPONSE)
  await sendPrompt(await editableComposer(panel), RESTORE_PROMPT)
  let child: StoredSessionLog | undefined
  await browser.waitUntil(async () => {
    const log = (await sessionLogs()).find(candidate => candidate.header.id === state.childId)
    child = log !== undefined
      && hasExactCompletedOwnTurn(log, beforeOwnEventCount, RESTORE_PROMPT, SIDE_RESPONSE)
      ? log
      : undefined
    return child !== undefined
  }, { timeout: 60_000, timeoutMsg: 'the restored Side Chat did not durably complete its second turn' })
  if (child === undefined) throw new Error('the restored Side Chat JSONL was unavailable')
  await browser.waitUntil(async () => await visibleTextOccurrences(SIDE_RESPONSE) === visibleResponsesBefore + 1, {
    timeout: 30_000,
    timeoutMsg: 'the restored Side Chat did not render exactly one new reply',
  })
  expect(await visibleTextOccurrences(SIDE_RESPONSE)).toBe(visibleResponsesBefore + 1)
  await assertChildLog(child, 2, [SIDE_PROMPT, RESTORE_PROMPT])
  expect((await sessionLogs()).filter(log => log.header.origin === 'subagent')).toHaveLength(1)
  await assertHeaderChildVisible()

  const tab = await element(panel, `[title="${SIDE_PROMPT}"]`)
  const close = await element(tab, 'button[aria-label="Close"]')
  await close.waitForClickable({ timeout: 10_000 })
  await close.click()
  await close.waitForExist({ reverse: true, timeout: 15_000 })
  let archivedIds: SessionIdType[] = []
  await browser.waitUntil(async () => {
    archivedIds = await archivedSessionIds()
    return archivedIds.includes(state.childId)
  }, {
    timeout: 15_000,
    timeoutMsg: 'closing the Side Chat did not durably archive its Session id',
  })
  await browser.waitUntil(async () => {
    const trigger = await element(browser, 'button[aria-label^="1 subagent"]')
    return !(await trigger.isExisting())
  }, {
    timeout: 15_000,
    timeoutMsg: 'closing the Side Chat did not remove its child row from the main Session header',
  })
  const main = await mainLog(state.mainSessionId)
  assertMainLog(main)
  await writeSessionEvidence(main, child, archivedIds)
  await writeSessionState({
    ...state,
    ownSideRequestCount: ownRequestHeaders(child).length,
    permissionPreset: latestPermission(child) ?? '',
    closed: true,
  })
  await browser.saveScreenshot(join(phaseArtifactRoot(), 'closed-side-chat.png'))
}

async function archivePhase(): Promise<void> {
  const state = await readSessionState()
  await expandSidePanel()
  const panel = await visiblePanel()
  const closedTab = await element(panel, `[title="${SIDE_PROMPT}"]`)
  expect(await closedTab.isExisting()).toBe(false)
  const mainRow = await element(browser, `[data-session-row="${state.mainSessionId}"]`)
  await mainRow.waitForExist({ timeout: 15_000 })
  const archivedIds = await archivedSessionIds()
  expect(archivedIds).toContain(state.childId)

  const child = await childLog(state.childId)
  await assertChildLog(child, 2, [SIDE_PROMPT, RESTORE_PROMPT])
  expect(latestPermission(child)).toBe('read-only')
  const main = await mainLog(state.mainSessionId)
  assertMainLog(main)
  await writeSessionEvidence(main, child, archivedIds)
  await writeSessionState({
    ...state,
    ownSideRequestCount: ownRequestHeaders(child).length,
    permissionPreset: latestPermission(child) ?? '',
    closed: true,
    archived: true,
  })
  await browser.saveScreenshot(join(phaseArtifactRoot(), 'archived-state.png'))
}

async function boot(): Promise<void> {
  const smokeFile = required('DSH_CRITICAL_PATH_SMOKE_FILE')
  const artifactRoot = required('DSH_CRITICAL_PATH_ARTIFACT_DIR')
  let recordedHost = false
  let smoke = ''
  await browser.waitUntil(async () => {
    smoke = await readOptionalFile(smokeFile) ?? ''
    const host = smoke.match(/^host (http:\/\/127\.0\.0\.1:\d+) pid (\d+)$/mu)
    if (!recordedHost && host?.[1] !== undefined && host[2] !== undefined) {
      const pid = Number(host[2])
      const roots = [pid, (await readProcessEvidence(artifactRoot))[phase]?.electron?.pid]
        .filter((root): root is number => root !== undefined)
      const ownedProcesses = captureOwnedProcessTree(roots)
      const identity = ownedProcesses.find(candidate => candidate.pid === pid)
      if (identity === undefined) throw new Error('Desktop Host identity was absent from its owned tree')
      await recordProcessEvidence(artifactRoot, phase, {
        host: identity,
        hostOrigin: host[1],
        ownedProcesses,
      })
      recordedHost = true
    }
    if (/^error /mu.test(smoke)) throw new Error(`Desktop smoke failure:\n${smoke}`)
    return smoke.includes('boot screen shown')
      && smoke.includes('shell ready')
      && recordedHost
  }, { timeout: 180_000, timeoutMsg: 'Desktop did not announce its ready Web Host' })
  await switchToSessionSurface()
  await browser.waitUntil(async () => await browser.execute(() => {
    const scope = window as typeof window & { __DSH_BOOT__?: unknown; __DSH_MODULES__?: unknown }
    return typeof scope.__DSH_BOOT__ === 'object' && scope.__DSH_MODULES__ === undefined
  }), { timeout: 180_000, timeoutMsg: 'Desktop renderer did not expose the production boot boundary' })
  await recordProcessEvidence(artifactRoot, phase, {
    rendererUrl: await browser.getUrl(),
  })
  await browser.saveScreenshot(join(phaseArtifactRoot(), 'ready.png'))
}

async function connectWorkspace(): Promise<void> {
  const trigger = await element(browser, '[data-composer-input][aria-label="Choose workspace"]')
  await trigger.waitForClickable({ timeout: 30_000 })
  await trigger.click()
  const dialog = await element(browser, '[role="dialog"][aria-label="Select Workspace Directory"]')
  await dialog.waitForDisplayed({ timeout: 10_000 })
  const editPath = await element(dialog, EDIT_PATH_BUTTON_SELECTOR)
  await editPath.waitForClickable({ timeout: 10_000 })
  await editPath.click()
  const path = await element(dialog, 'input[aria-label="Edit path"]')
  await replacePathInput(browser, path, required('DSH_CRITICAL_PATH_WORKSPACE'))
  await browser.keys(['Enter'])
  await clickExact(dialog, 'Open')
  await editableComposer(browser)
}

async function openSideChatFromTabMenu(panel: WebdriverIO.Element): Promise<void> {
  const add = await element(panel, 'button[aria-label="New tab"]')
  await add.waitForClickable({ timeout: 10_000 })
  await add.click()
  await switchToOverlaySurface()
  const sideChat = await element(browser, '//*[@role="menuitem" and normalize-space(.)="Side Chat"]')
  await sideChat.waitForClickable({ timeout: 10_000 })
  await sideChat.click()
  await switchToSessionSurface()
}

async function configureSideProvider(): Promise<void> {
  await switchToSessionSurface()
  await clickExact(browser, 'Settings')
  await switchToOverlaySurface()
  await clickExact(browser, 'Models')
  const declare = await exactButton(browser, 'Add a custom provider')
  await declare.waitForClickable({ timeout: 20_000 })
  await declare.click()
  await (await element(browser, 'input[aria-label="Provider ID"]')).setValue(SIDE_PROVIDER)
  await (await element(browser, 'input[aria-label="Display name"]')).setValue('Side Provider B')
  await (await element(browser, 'input[aria-label="Base URL"]')).setValue(`${required('DEEPSEEK_BASE_URL')}/v1`)
  await (await element(browser, 'select[aria-label="API protocol"]'))
    .selectByAttribute('value', 'openai-completions')
  await clickExact(browser, 'Add model')
  await (await element(browser, 'input[aria-label="Model ID 1"]')).setValue(SIDE_MODEL)
  await clickExact(browser, 'Create provider')
  await waitForBodyText('Side Provider B', 20_000)
  await clickExact(browser, 'Close')
}

async function selectSideModel(panel: WebdriverIO.Element): Promise<void> {
  const trigger = await element(panel, 'button[aria-label^="Select model, current"]')
  await trigger.waitForClickable({ timeout: 20_000 })
  await trigger.click()
  const modelPane = await element(panel, './/button[@role="menuitem" and .//*[normalize-space(.)="Model"]]')
  await modelPane.waitForClickable({ timeout: 10_000 })
  await modelPane.click()
  const option = await element(panel, `[role="menuitemradio"][data-provider-id="${SIDE_PROVIDER}"][data-model-id="${SIDE_MODEL}"]`)
  await option.waitForClickable({ timeout: 20_000 })
  await option.click()
  await modelTrigger(panel, SIDE_MODEL)

  const refreshed = await element(panel, `button[aria-label="Select model, current ${SIDE_MODEL}"]`)
  await refreshed.click()
  await (await element(panel, './/button[@role="menuitem" and .//*[normalize-space(.)="Model"]]')).click()
  const retained = await element(panel, `[role="menuitemradio"][data-provider-id="${SIDE_PROVIDER}"][data-model-id="${SIDE_MODEL}"]`)
  await retained.waitForExist({ timeout: 20_000 })
  expect(await retained.getAttribute('aria-checked')).toBe('true')
  await retained.click()
  await modelTrigger(panel, SIDE_MODEL)
}

async function setReadOnly(panel: WebdriverIO.Element): Promise<void> {
  const current = await permissionTrigger(panel, 'Workspace Write')
  await current.click()
  const choice = await element(browser, '//*[@role="menuitem" and normalize-space(.)="Read Only"]')
  await choice.waitForClickable({ timeout: 10_000 })
  await choice.click()
  await permissionTrigger(panel, 'Read Only')
}

async function modelTrigger(panel: WebdriverIO.Element, model: string): Promise<WebdriverIO.Element> {
  const trigger = await element(panel, `button[aria-label="Select model, current ${model}"]`)
  await trigger.waitForExist({ timeout: 20_000 })
  return trigger
}

async function permissionTrigger(panel: WebdriverIO.Element, mode: string): Promise<WebdriverIO.Element> {
  const trigger = await element(panel, `button[aria-label="Access mode, current: ${mode}"]`)
  await trigger.waitForExist({ timeout: 20_000 })
  return trigger
}

async function sendPrompt(composer: WebdriverIO.Element, text: string): Promise<void> {
  await composer.waitForClickable({ timeout: 20_000 })
  await composer.click()
  await browser.keys(text)
  await browser.keys(['Enter'])
}

async function editableComposer(root: WebdriverIO.Browser | WebdriverIO.Element): Promise<WebdriverIO.Element> {
  const composer = await element(root, '[data-composer-input][contenteditable="true"]')
  await composer.waitForDisplayed({ timeout: 30_000 })
  return composer
}

async function expandSidePanel(): Promise<void> {
  await switchToSessionSurface()
  const expand = await element(browser, 'button[aria-label="Expand sidebar"]')
  if (await expand.isExisting()) {
    await expand.waitForClickable({ timeout: 10_000 })
    await expand.click()
  }
}

async function visiblePanel(): Promise<WebdriverIO.Element> {
  const panels = await elements(browser, '[data-dsh-panel]')
  for (const panel of panels) {
    if (await panel.isDisplayed()) return panel
  }
  throw new Error('Desktop exposed no visible Side panel')
}

async function provisionalSideChat(): Promise<{ parentSessionId: SessionIdType; threadId: SessionIdType }> {
  const tabs = await persistedSideChats()
  const draft = tabs.find(tab => tab.provisional)
  if (draft === undefined) throw new Error(`no provisional Side Chat was persisted: ${JSON.stringify(tabs)}`)
  return { parentSessionId: draft.parentSessionId, threadId: draft.threadId }
}

async function uiSessionCounts(): Promise<UiSessionCounts> {
  return await browser.execute(() => ({
    mainSessionRows: document.querySelectorAll(
      '[role="tree"][aria-label="Sessions"] [data-session-row]',
    ).length,
    subagentRows: document.querySelectorAll(
      '[role="tree"][aria-label="Tasks"] [role="treeitem"]',
    ).length,
  }))
}

async function assertDraftRemainsUnpublished(
  threadId: SessionIdType,
  expectedRows: UiSessionCounts,
): Promise<void> {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    const published = (await sessionLogs()).some(log => log.header.id === threadId)
    if (published) throw new Error('the provisional Side Chat published before its first prompt')
    expect(await uiSessionCounts()).toEqual(expectedRows)
    await browser.pause(50)
  }
}

async function assertHeaderChildVisible(): Promise<void> {
  const trigger = await element(browser, 'button[aria-label^="1 subagent"]')
  await trigger.waitForDisplayed({ timeout: 15_000 })
  await trigger.click()
  await browser.keys(['ArrowDown'])
  const tree = await element(browser, '[role="tree"][aria-label="Subagent sessions"]')
  await tree.waitForDisplayed({ timeout: 10_000 })
  const child = await element(tree, `[role="treeitem"][aria-label*="Side: ${SIDE_PROMPT}"]`)
  await child.waitForDisplayed({ timeout: 10_000 })
  await browser.keys(['Escape'])
  await tree.waitForExist({ reverse: true, timeout: 10_000 })
}

async function persistedSideChats(): Promise<Array<{
  parentSessionId: SessionIdType
  threadId: SessionIdType
  provisional: boolean
}>> {
  const entries = await browser.execute(() => {
    const results: Array<{ parentSessionId: string; threadId: string; provisional: boolean }> = []
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('dsh-sidebar:v1:') || key === 'dsh-sidebar:v1:width') continue
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      let value: unknown
      try { value = JSON.parse(raw) } catch { continue }
      const seen = new Set<object>()
      const visit = (candidate: unknown): void => {
        if (typeof candidate !== 'object' || candidate === null || seen.has(candidate)) return
        seen.add(candidate)
        const record = candidate as Record<string, unknown>
        const meta = record['meta'] as Record<string, unknown> | undefined
        if (record['type'] === 'sidechat' && typeof meta?.['threadId'] === 'string') {
          results.push({
            parentSessionId: key.slice('dsh-sidebar:v1:'.length),
            threadId: meta['threadId'],
            provisional: meta['provisional'] === true,
          })
        }
        for (const child of Object.values(record)) visit(child)
      }
      visit(value)
    }
    return results.filter((entry, index) => results.findIndex(candidate => (
      candidate.parentSessionId === entry.parentSessionId && candidate.threadId === entry.threadId
    )) === index)
  })
  return entries.map(entry => ({
    parentSessionId: SessionId(entry.parentSessionId),
    threadId: SessionId(entry.threadId),
    provisional: entry.provisional,
  }))
}

async function sessionLogs(): Promise<StoredSessionLog[]> {
  const paths = await findNamedFiles(join(required('DSH_CRITICAL_PATH_DSH_HOME'), 'sessions'), 'session.jsonl')
  const logs: StoredSessionLog[] = []
  for (const path of paths) {
    logs.push(parseStoredSessionLog(path, await readFile(path)))
  }
  return logs
}

async function findNamedFiles(root: string, name: string): Promise<string[]> {
  const paths: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name === name) paths.push(path)
    }
  }
  await visit(root)
  return paths
}

async function childLog(childId: SessionIdType): Promise<StoredSessionLog> {
  const log = (await sessionLogs()).find(candidate => candidate.header.id === childId)
  if (log === undefined) throw new Error(`no JSONL log exists for Side Chat ${childId}`)
  return log
}

async function mainLog(mainSessionId: SessionIdType): Promise<StoredSessionLog> {
  const log = (await sessionLogs()).find(candidate => candidate.header.id === mainSessionId)
  if (log === undefined) throw new Error(`no JSONL log exists for main Session ${mainSessionId}`)
  return log
}

function ownEvents(log: StoredSessionLog): readonly StoredSessionLog['events'][number][] {
  return log.events.slice(log.inheritedEventCount)
}

function ownRequestHeaders(log: StoredSessionLog): StoredSessionLog['events'] {
  return ownEvents(log).filter(event => event.type === 'request/header')
}

function latestPermission(log: StoredSessionLog): string | undefined {
  const event = ownEvents(log).findLast(candidate => candidate.type === 'permission/preset')
  const data = event?.data as { preset?: unknown } | undefined
  return typeof data?.preset === 'string' ? data.preset : undefined
}

function routeOf(event: StoredSessionLog['events'][number]): { provider?: unknown; model?: unknown } | undefined {
  if (event.type === 'request/header') {
    return (event.data as { header?: { config?: { provider?: unknown; model?: unknown } } } | undefined)
      ?.header?.config
  }
  if (event.type === 'assistant/message') {
    return (event.data as { message?: { source?: { provider?: unknown; model?: unknown } } } | undefined)
      ?.message?.source
  }
  return undefined
}

function mainTurnIndices(log: StoredSessionLog): readonly [number, number, number, number] | undefined {
  const own = ownEvents(log)
  const user = own.findIndex(event => event.type === 'user/message'
    && JSON.stringify(event.data).includes(PARENT_PROMPT))
  const request = own.findIndex((event, index) => {
    const route = routeOf(event)
    return index > user && event.type === 'request/header'
      && route?.provider === 'deepseek-official' && route.model === PARENT_MODEL
  })
  const assistant = own.findIndex((event, index) => {
    const route = routeOf(event)
    return index > request && event.type === 'assistant/message'
      && route?.provider === 'deepseek-official' && route.model === PARENT_MODEL
      && JSON.stringify(event.data).includes(PARENT_RESPONSE)
  })
  const ended = own.findIndex((event, index) => index > assistant && event.type === 'turn/end')
  return user >= 0 && request > user && assistant > request && ended > assistant
    ? [user, request, assistant, ended]
    : undefined
}

function mainLogReady(log: StoredSessionLog): boolean {
  return mainTurnIndices(log) !== undefined
}

function assertMainLog(log: StoredSessionLog): void {
  expect(log.header.parentSession).toBeUndefined()
  expect(mainTurnIndices(log)).toBeDefined()
  expect(ownRequestHeaders(log).filter((event) => {
    const route = routeOf(event)
    return route?.provider === 'deepseek-official' && route.model === PARENT_MODEL
  })).toHaveLength(1)
}

async function assertChildLog(
  log: StoredSessionLog,
  requestCount: number,
  prompts: readonly string[],
): Promise<void> {
  const own = ownEvents(log)
  const headers = ownRequestHeaders(log)
  expect(headers).toHaveLength(requestCount)
  for (const event of headers) {
    expect(event.data).toMatchObject({
      header: { config: { provider: SIDE_PROVIDER, model: SIDE_MODEL } },
    })
  }
  const serialized = JSON.stringify(own)
  for (const prompt of prompts) expect(serialized).toContain(prompt)
  expect(serialized).toContain(SIDE_RESPONSE)
  expect(own.some(event => event.type === 'assistant/message')).toBe(true)
  expect(own.some(event => event.type === 'turn/end')).toBe(true)
}

async function writeSessionEvidence(
  main: StoredSessionLog,
  child: StoredSessionLog,
  archivedIds: readonly SessionIdType[],
): Promise<void> {
  await Promise.all([
    writeFile(mainEvidencePath(), sanitizedSessionJsonl(main, 'main')),
    writeFile(childEvidencePath(), sanitizedSessionJsonl(child, 'side-chat', archivedIds)),
  ])
}

function sanitizedSessionJsonl(
  log: StoredSessionLog,
  role: 'main' | 'side-chat',
  archivedIds?: readonly SessionIdType[],
): string {
  const own = ownEvents(log)
  const lines: unknown[] = [{
    kind: 'session',
    role,
    id: log.header.id,
    ...log.header.parentSession === undefined ? {} : { parentSession: log.header.parentSession },
    ...log.header.origin === undefined ? {} : { origin: log.header.origin },
    inheritedEventCount: log.inheritedEventCount,
    ownEventCount: own.length,
  }]
  for (const [ownIndex, event] of own.entries()) {
    const route = routeOf(event)
    const data = event.data as { preset?: unknown } | undefined
    lines.push({
      kind: 'event',
      ownIndex,
      ...typeof event.seq === 'number' ? { seq: event.seq } : {},
      type: event.type ?? 'unknown',
      ...typeof route?.provider === 'string' && typeof route.model === 'string'
        ? { route: { provider: route.provider, model: route.model } }
        : {},
      ...event.type === 'permission/preset' && typeof data?.preset === 'string'
        ? { preset: data.preset }
        : {},
    })
  }
  if (archivedIds !== undefined) lines.push({ kind: 'archive', archivedSessionIds: [...archivedIds] })
  return lines.map(line => JSON.stringify(line)).join('\n') + '\n'
}

async function archivedSessionIds(): Promise<SessionIdType[]> {
  const path = join(required('DSH_CRITICAL_PATH_DSH_HOME'), 'storages', 'workspace.json')
  return parseArchivedSessionIds(await readFile(path, 'utf8'))
}

async function readSessionState(): Promise<SessionStateEvidence> {
  return parseSessionState(await readFile(sessionStatePath(), 'utf8'))
}

async function writeSessionState(state: SessionStateEvidence): Promise<void> {
  await writeFile(sessionStatePath(), JSON.stringify(state, undefined, 2) + '\n')
}

async function switchToOverlaySurface(): Promise<void> {
  await browser.waitUntil(async () => {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle)
      if (await browser.execute(() => document.documentElement.hasAttribute('data-dsh-desktop-overlay'))) return true
    }
    return false
  }, { timeout: 10_000, timeoutMsg: 'Desktop Settings overlay did not open' })
}

async function switchToSessionSurface(): Promise<void> {
  for (const handle of await browser.getWindowHandles()) {
    await browser.switchToWindow(handle)
    const overlay = await browser.execute(() => document.documentElement.hasAttribute('data-dsh-desktop-overlay'))
    if (!overlay) return
  }
  throw new Error('Desktop exposed no Session Surface window')
}

async function waitForBodyText(text: string, timeout = 30_000): Promise<void> {
  await browser.waitUntil(async () => {
    const body = await element(browser, 'body')
    return (await body.getText()).includes(text)
  }, { timeout, timeoutMsg: `visible text did not contain ${JSON.stringify(text)}` })
}

async function visibleTextOccurrences(text: string): Promise<number> {
  const value = await (await element(browser, 'body')).getText()
  let count = 0
  let from = 0
  while (true) {
    const index = value.indexOf(text, from)
    if (index < 0) return count
    count += 1
    from = index + text.length
  }
}

async function clickExact(root: WebdriverIO.Browser | WebdriverIO.Element, label: string): Promise<void> {
  const target = await exactButton(root, label)
  await target.waitForClickable({ timeout: 10_000 })
  await target.click()
}

function exactButton(
  root: WebdriverIO.Browser | WebdriverIO.Element,
  label: string,
): Promise<WebdriverIO.Element> {
  return element(root, `.//button[normalize-space(.)="${label}"]`)
}

function element(
  root: WebdriverIO.Browser | WebdriverIO.Element,
  selector: string,
): Promise<WebdriverIO.Element> {
  return Promise.resolve(root.$(selector) as unknown as WebdriverIO.Element)
}

function elements(
  root: WebdriverIO.Browser | WebdriverIO.Element,
  selector: string,
): Promise<WebdriverIO.ElementArray> {
  return Promise.resolve(root.$$(selector) as unknown as WebdriverIO.ElementArray)
}

function sessionStatePath(): string {
  return join(required('DSH_CRITICAL_PATH_ARTIFACT_DIR'), 'session-state.json')
}

function mainEvidencePath(): string {
  return join(required('DSH_CRITICAL_PATH_ARTIFACT_DIR'), 'main-session-evidence.jsonl')
}

function childEvidencePath(): string {
  return join(required('DSH_CRITICAL_PATH_ARTIFACT_DIR'), 'child-session-evidence.jsonl')
}

function phaseArtifactRoot(): string {
  return join(required('DSH_CRITICAL_PATH_ARTIFACT_DIR'), phase)
}

function criticalPathPhase(): CriticalPathPhase {
  const value = required('DSH_CRITICAL_PATH_PHASE')
  if (value === 'create' || value === 'restore' || value === 'archive') return value
  throw new TypeError(`DSH_CRITICAL_PATH_PHASE is invalid: ${value}`)
}

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new TypeError(`${name} is required`)
  return value
}
