/** Chat-owned selection state shared by the transcript and details panel. */
import type { DetailsDocumentFocus } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Tool call identity as carried by Chat nodes. */
export type ToolCallId = string

/** Selection target for the Chat details linkage channel. */
export interface SelectionTarget {
  turnSeq: number
  stepSeq?: number
  callId?: ToolCallId
  toolName?: string
}

/** One manually expanded Turn answer generation. */
export interface TurnProcessViewEntry {
  readonly turn: number
  readonly answerStep: number
}

/** Per-Session state shared only by the Chat view and details surface. */
export interface ChatStoreState {
  selection: SelectionTarget | null
  turnProcesses: TurnProcessViewEntry[]
  /**
   * Focused document rendered in place of the tool body. Read with `?? null`
   * so snapshots persisted before this field rehydrate without it.
   */
  documentFocus: DetailsDocumentFocus | null
}
