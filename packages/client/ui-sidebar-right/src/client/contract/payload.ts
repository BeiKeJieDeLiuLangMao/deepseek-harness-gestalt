/**
 * Persistent tab payloads and pins carried by the official workbench.
 *
 * A tab kind owns the meaning of its payload. The workbench only snapshots
 * lossless JSON at the typed caller boundary and validates it again when it
 * crosses durable storage. Declaration merging keeps each kind precise for
 * callers without closing the extension set.
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Tab kind to its persistent payload. Merge-extensible. */
export interface SidebarRightTabPayloadMap {}

type JsonPayload<T> = T extends JsonValue ? T : never

/** The payload accepted for one tab kind. */
export type SidebarRightTabPayloadFor<K extends string> =
  K extends keyof SidebarRightTabPayloadMap ? JsonPayload<SidebarRightTabPayloadMap[K]> : JsonValue

/** A durable tab payload after validation at the storage boundary. */
export type SidebarRightTabPayload = JsonValue

/** One occurrence surfaced in other Sessions without copying its owner. */
export interface SidebarRightTabPin {
  readonly scope: 'workspace' | 'global'
  /** Session whose record and runtime resource remain authoritative. */
  readonly homeSessionId: SessionId
  /** Workspace root captured when a workspace pin was created. */
  readonly homeCwd?: string
}

/** Persistent facts owned beside a DockKit tab record. */
export interface SidebarRightTabState {
  readonly payload?: SidebarRightTabPayload
  readonly pin?: SidebarRightTabPin
}
