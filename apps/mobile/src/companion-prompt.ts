/** Mobile continue/cancel mutations that reuse Desktop acceptance and commit order. */

import { requireCompanionMutation, type CompanionConnectionState } from './companion-mutation.ts'

/** One recorded Companion mutation. */
export interface CompanionMutationRecord {
  /** Idempotency key. */
  operationId: string
  /** Device Principal that issued the mutation. */
  devicePrincipalId: string
  /** Mutation category. */
  category: 'prompt' | 'cancel'
  /** Whether Desktop accepted the request. */
  accepted: boolean
  /** Settled result after Desktop commit. */
  result: 'streaming' | 'completed' | 'failed' | 'cancelled' | 'rejected'
}

/** Live Mobile transcript state. */
export interface CompanionPromptState {
  /** Desktop-accepted user and assistant/tool lines. */
  lines: readonly string[]
  /** Whether execution is currently streaming. */
  streaming: boolean
  /** Committed operation records in Desktop order. */
  records: readonly CompanionMutationRecord[]
}

/**
 * Submit a Mobile prompt through Desktop acceptance.
 * @param state - current transcript.
 * @param committed - previously applied operation ids.
 * @param input - prompt request.
 * @param connection - foreground connection and validated synchronization state.
 * @returns next state; a repeated operation id returns the original result.
 */
export function submitCompanionPrompt(
  state: CompanionPromptState,
  committed: ReadonlyMap<string, CompanionMutationRecord>,
  input: {
    operationId: string
    devicePrincipalId: string
    text: string
    accepted: boolean
  },
  connection: CompanionConnectionState | undefined,
): CompanionPromptState {
  requireCompanionMutation(connection, 'prompt')
  const previous = committed.get(input.operationId)
  if (previous !== undefined) return state
  if (!input.accepted) {
    return {
      ...state,
      records: [...state.records, {
        operationId: input.operationId,
        devicePrincipalId: input.devicePrincipalId,
        category: 'prompt',
        accepted: false,
        result: 'rejected',
      }],
    }
  }
  return {
    lines: [...state.lines, input.text, 'assistant: streaming'],
    streaming: true,
    records: [...state.records, {
      operationId: input.operationId,
      devicePrincipalId: input.devicePrincipalId,
      category: 'prompt',
      accepted: true,
      result: 'streaming',
    }],
  }
}

/**
 * Complete, fail, or cancel the active stream after Desktop commit.
 * @param state - current transcript.
 * @param result - Desktop-committed outcome.
 * @returns next state.
 */
export function settleCompanionPrompt(
  state: CompanionPromptState,
  result: 'completed' | 'failed' | 'cancelled',
): CompanionPromptState {
  if (!state.streaming) return state
  const last = state.records.at(-1)
  const records = last === undefined
    ? state.records
    : [...state.records.slice(0, -1), { ...last, result }]
  return {
    lines: [...state.lines.slice(0, -1), `assistant: ${result}`],
    streaming: false,
    records,
  }
}

/**
 * Cancel through Desktop cancellation authority.
 * @param state - current transcript.
 * @param committed - previously applied operation ids.
 * @param input - cancel request.
 * @param connection - foreground connection and validated synchronization state.
 * @returns next state.
 */
export function cancelCompanionPrompt(
  state: CompanionPromptState,
  committed: ReadonlyMap<string, CompanionMutationRecord>,
  input: { operationId: string; devicePrincipalId: string; accepted: boolean },
  connection: CompanionConnectionState | undefined,
): CompanionPromptState {
  requireCompanionMutation(connection, 'cancel')
  const previous = committed.get(input.operationId)
  if (previous !== undefined) return state
  const record: CompanionMutationRecord = {
    operationId: input.operationId,
    devicePrincipalId: input.devicePrincipalId,
    category: 'cancel',
    accepted: input.accepted,
    result: input.accepted ? 'cancelled' : 'rejected',
  }
  if (!input.accepted || !state.streaming) {
    return { ...state, records: [...state.records, record] }
  }
  const settled = settleCompanionPrompt(state, 'cancelled')
  return { ...settled, records: [...settled.records, record] }
}
