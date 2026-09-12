/** Official occurrence ownership and Host reconciliation for Terminal tabs. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  SidebarRightProjection, SidebarRightTabCloseContext,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarContext } from '../../context-types.ts'
import { api, type SessionScope } from '../api.ts'
import type { TerminalViewLifecycle } from '../TerminalView.tsx'
import {
  createOfficialAgentTerminalPayload, OFFICIAL_TERMINAL_KIND, officialTerminalPayloadOf,
  type OfficialTerminalPayload,
} from './payload.ts'

/** Existing human Terminal quota per Session. */
export const OFFICIAL_UI_TERMINAL_LIMIT = 3

/** Services required by the official Terminal runtime adapter. */
export type OfficialTerminalContext = SidebarContext & Pick<ClientContext, 'sidebarRight'>

type OfficialTabId = SidebarRightTabCloseContext['tab']['id']

function occurrenceKey(sessionId: SessionId, tabId: OfficialTabId): string {
  return `${sessionId}\u0000${tabId}`
}

/** Live terminal sockets reachable by true-close hooks. */
class TerminalSocketRegistry {
  private readonly senders = new Map<string, () => void>()

  register(sessionId: SessionId, tabId: OfficialTabId, sender: () => void): () => void {
    const key = occurrenceKey(sessionId, tabId)
    this.senders.set(key, sender)
    return () => {
      if (this.senders.get(key) === sender) this.senders.delete(key)
    }
  }

  close(sessionId: SessionId, tabId: OfficialTabId): void {
    this.senders.get(occurrenceKey(sessionId, tabId))?.()
  }
}

const terminalSockets = new TerminalSocketRegistry()

/**
 * Count human Terminal occurrences across both official dock surfaces and floats.
 * @param projection - official workbench read model.
 * @param sessionId - owner Session.
 * @returns the number of UI-owned Terminal payloads.
 */
export function officialUiTerminalCount(
  projection: SidebarRightProjection,
  sessionId: SessionId,
): number {
  const session = projection.sessions.find(candidate => candidate.sessionId === sessionId)
  return session?.tabs.filter((tab) => {
    if (tab.record.kind !== OFFICIAL_TERMINAL_KIND) return false
    return officialTerminalPayloadOf(tab.state.payload)?.owner === 'ui'
  }).length ?? 0
}

/** Whether another human Terminal can be created in one Session. */
export function canOpenOfficialUiTerminal(
  projection: SidebarRightProjection,
  sessionId: SessionId,
): boolean {
  return officialUiTerminalCount(projection, sessionId) < OFFICIAL_UI_TERMINAL_LIMIT
}

/**
 * Create the component-lifetime bridge for an occurrence-owned terminal.
 * @param ctx - official workbench projection.
 * @param sessionId - home Session of the occurrence.
 * @param tabId - home DockKit occurrence identity.
 * @returns the Terminal view's park and close-sender face.
 */
export function officialTerminalViewLifecycle(
  ctx: OfficialTerminalContext,
  sessionId: SessionId,
  tabId: OfficialTabId,
): TerminalViewLifecycle {
  return {
    shouldParkOnUnmount: () => ctx.sidebarRight.getSnapshot().mountedSessionId !== sessionId,
    registerCloseSender: sender => terminalSockets.register(sessionId, tabId, sender),
  }
}

/**
 * Release one official Terminal owner before its record disappears.
 * A live socket receives the close control first; the idempotent HTTP route is
 * still awaited so a disconnected view cannot hold quota or a child process.
 * @param close - fixed occurrence facts from the official close coordinator.
 */
export async function closeOfficialTerminal(close: SidebarRightTabCloseContext): Promise<void> {
  const payload = officialTerminalPayloadOf(close.payload)
  if (payload === undefined) return
  terminalSockets.close(close.sessionId, close.tab.id)
  if (payload.owner === 'agent') {
    await api.agentPtyClose(payload.runtimeId)
    return
  }
  const scope: SessionScope = { sessionId: close.sessionId }
  await api.ptyClose(scope, payload.runtimeId)
}

/** One validated model Terminal row pushed by the Host. */
export interface OfficialAgentTerminalRow {
  readonly uuid: string
  readonly title: string
}

/**
 * Narrow one Host push without accepting partial or hostile rows.
 * @param value - decoded WebSocket data.
 * @returns valid model Terminal rows, or `undefined` for a malformed frame.
 */
export function officialAgentTerminalRowsOf(value: unknown): OfficialAgentTerminalRow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows: OfficialAgentTerminalRow[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) return undefined
    const row = candidate as { uuid?: unknown; title?: unknown }
    if (typeof row.uuid !== 'string' || row.uuid === '' || typeof row.title !== 'string') return undefined
    rows.push({ uuid: row.uuid, title: row.title })
  }
  return rows
}

function terminalTabs(
  projection: SidebarRightProjection,
  sessionId: SessionId,
): Array<{
  readonly tabId: OfficialTabId
  readonly payload: OfficialTerminalPayload
  readonly pinned: boolean
}> {
  const session = projection.sessions.find(candidate => candidate.sessionId === sessionId)
  return (session?.tabs ?? []).flatMap((tab) => {
    if (tab.record.kind !== OFFICIAL_TERMINAL_KIND) return []
    const payload = officialTerminalPayloadOf(tab.state.payload)
    return payload === undefined ? [] : [{
      tabId: tab.record.id,
      payload,
      pinned: tab.state.pin !== undefined,
    }]
  })
}

/**
 * Reconcile one Host model-Terminal list into official occurrences.
 * @param ctx - Session-targeted official workbench.
 * @param sessionId - owner Session represented by the Host frame.
 * @param rows - complete current Host list for that Session.
 * @returns after all required opens and closes settle.
 */
export async function reconcileOfficialAgentTerminals(
  ctx: OfficialTerminalContext,
  sessionId: SessionId,
  rows: readonly OfficialAgentTerminalRow[],
): Promise<void> {
  const existing = terminalTabs(ctx.sidebarRight.getSnapshot(), sessionId)
    .filter(tab => tab.payload.owner === 'agent')
  const existingByRuntime = new Map(existing.map(tab => [tab.payload.runtimeId, tab]))
  const live = new Set(rows.map(row => row.uuid))
  const navigator = ctx.sidebarRight.forSession(sessionId)

  for (const row of rows) {
    if (existingByRuntime.has(row.uuid)) continue
    await navigator.openTab(OFFICIAL_TERMINAL_KIND, {
      instanceId: `agent:${row.uuid}`,
      title: row.title,
      payload: createOfficialAgentTerminalPayload(row.uuid),
    })
  }
  for (const tab of existing) {
    if (live.has(tab.payload.runtimeId) || tab.pinned) continue
    await navigator.close(tab.tabId)
  }
}

/** Reconnect ceiling for the Host model-Terminal list. */
const AGENT_TERMINAL_FAILURE_LIMIT = 3

/**
 * Follow the current Session's complete model-Terminal list outside React.
 * @param ctx - Session projection and official occurrence controller.
 * @returns disposer for Session and WebSocket subscriptions.
 */
export function subscribeOfficialAgentTerminals(ctx: OfficialTerminalContext): () => void {
  let socket: WebSocket | undefined
  let retry: number | undefined
  let current: SessionId | undefined
  let generation = 0
  let failures = 0
  let disposed = false
  let reconcileTail = Promise.resolve()

  const disconnect = (): void => {
    generation += 1
    window.clearTimeout(retry)
    retry = undefined
    const previous = socket
    socket = undefined
    previous?.close()
  }

  const connect = (sessionId: SessionId): void => {
    if (disposed || current !== sessionId) return
    const ownGeneration = generation
    const url = new URL('/sidebar/ws/agent-terminals', location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.search = new URLSearchParams({ sessionId }).toString()
    const next = new WebSocket(url.toString())
    socket = next
    next.onopen = () => {
      if (ownGeneration === generation && current === sessionId) failures = 0
    }
    next.onmessage = (event) => {
      if (typeof event.data !== 'string' || ownGeneration !== generation) return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      const rows = officialAgentTerminalRowsOf(parsed)
      if (rows === undefined) return
      reconcileTail = reconcileTail
        .then(() => {
          if (disposed || ownGeneration !== generation || current !== sessionId) return
          return reconcileOfficialAgentTerminals(ctx, sessionId, rows)
        })
        .catch((error: unknown) => {
          console.error('[dsh-better-sidebar] Agent Terminal reconciliation failed:', error)
        })
    }
    next.onerror = () => { next.close() }
    next.onclose = () => {
      if (disposed || ownGeneration !== generation || current !== sessionId) return
      failures += 1
      if (failures >= AGENT_TERMINAL_FAILURE_LIMIT) {
        console.error('[dsh-better-sidebar] agent-terminals connection failed; stopping reconnect loop', sessionId)
        return
      }
      retry = window.setTimeout(() => { connect(sessionId) }, 2000)
    }
  }

  const selectSession = (): void => {
    const sessionId = ctx.sessions.list.getSnapshot().current
    if (sessionId === current) return
    disconnect()
    current = sessionId
    failures = 0
    if (sessionId !== undefined) connect(sessionId)
  }
  const unsubscribe = ctx.sessions.list.subscribe(selectSession)
  selectSession()
  return () => {
    disposed = true
    unsubscribe()
    disconnect()
  }
}
