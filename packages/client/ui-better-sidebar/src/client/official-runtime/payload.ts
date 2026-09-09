/** Persistent payloads for Better Sidebar runtime tabs in the official workbench. */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'

/** Official page kind for Side Chat occurrences. */
export const OFFICIAL_SIDECHAT_KIND = 'sidechat'

/** Official page kind shared by human and model Terminal occurrences. */
export const OFFICIAL_TERMINAL_KIND = 'terminal'

/** One Side Chat occurrence's durable identity. */
export type OfficialSidechatPayload = {
  /** Direct child whose Agent lifetime belongs to this occurrence. */
  readonly rootThreadId: string
  /** Session currently shown after navigating inside the child lineage. */
  readonly threadId: string
  /** Present only until the first prompt publishes the child Session. */
  readonly provisional?: true
}

/** One human-created Terminal occurrence. */
export type OfficialUiTerminalPayload = {
  readonly owner: 'ui'
  /** Stable Host PTY key suffix, independent of DockKit tab identity. */
  readonly runtimeId: string
}

/** One model-created Terminal occurrence. */
export type OfficialAgentTerminalPayload = {
  readonly owner: 'agent'
  /** Opaque handle issued by the Host Agent terminal registry. */
  readonly runtimeId: string
}

/** Runtime identity for either Terminal owner. */
export type OfficialTerminalPayload = OfficialUiTerminalPayload | OfficialAgentTerminalPayload

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabPayloadMap {
    sidechat: OfficialSidechatPayload
    terminal: OfficialTerminalPayload
  }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Narrow a durable official payload to Side Chat's current format.
 * @param value - JSON restored by the official workbench.
 * @returns the payload, or `undefined` when it belongs to another version or kind.
 */
export function officialSidechatPayloadOf(value: unknown): OfficialSidechatPayload | undefined {
  const record = recordOf(value)
  if (typeof record?.rootThreadId !== 'string' || record.rootThreadId === ''
    || typeof record.threadId !== 'string' || record.threadId === ''
    || (record.provisional !== undefined && record.provisional !== true)) return undefined
  return {
    rootThreadId: record.rootThreadId,
    threadId: record.threadId,
    ...(record.provisional === true ? { provisional: true as const } : {}),
  }
}

/**
 * Narrow a durable official payload to Terminal's current format.
 * @param value - JSON restored by the official workbench.
 * @returns the payload, or `undefined` when it belongs to another version or kind.
 */
export function officialTerminalPayloadOf(value: unknown): OfficialTerminalPayload | undefined {
  const record = recordOf(value)
  if ((record?.owner !== 'ui' && record?.owner !== 'agent')
    || typeof record.runtimeId !== 'string' || record.runtimeId === '') return undefined
  return { owner: record.owner, runtimeId: record.runtimeId }
}

/** Create the first payload for one renderer-only Side Chat identity. */
export function createOfficialSidechatPayload(threadId: SessionId): OfficialSidechatPayload {
  return { rootThreadId: threadId, threadId, provisional: true }
}

/** Create a payload for one durable Side Chat restored from the Session catalog. */
export function restoreOfficialSidechatPayload(threadId: SessionId): OfficialSidechatPayload {
  return { rootThreadId: threadId, threadId }
}

/** Create a payload for one human Terminal runtime. */
export function createOfficialUiTerminalPayload(runtimeId: string): OfficialUiTerminalPayload {
  if (runtimeId === '') throw new Error('official Terminal runtime id must not be empty')
  return { owner: 'ui', runtimeId }
}

/** Create a payload for one model Terminal runtime. */
export function createOfficialAgentTerminalPayload(runtimeId: string): OfficialAgentTerminalPayload {
  if (runtimeId === '') throw new Error('official Agent Terminal runtime id must not be empty')
  return { owner: 'agent', runtimeId }
}
