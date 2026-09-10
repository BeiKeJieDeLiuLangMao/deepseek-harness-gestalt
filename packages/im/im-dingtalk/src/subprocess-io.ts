/**
 * Subprocess handle helpers for DingTalk DWS adapter I/O.
 *
 * @module @deepseek-ai/dsh-im-dingtalk/subprocess-io
 */

import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type { DingTalkConsumerState } from './types.ts'

/**
 * Reads collected stdout or stderr from a handle, or an empty string when the
 * stream was not spawned in collect mode.
 *
 * @param handle - Live subprocess handle.
 * @param stream - Collected stream to read.
 * @returns Whole-stream text from offset 0.
 */
export function collectedStreamText(
  handle: SubprocessHandle,
  stream: 'stdout' | 'stderr',
): string {
  return handle.collected?.[stream]?.readFrom(0).text ?? ''
}

/**
 * Builds a consumer snapshot without assigning `undefined` to optional fields.
 *
 * @param accountId - IM account whose consumer is described.
 * @param isRunning - Whether the consumer is currently running.
 * @param reconnectAttempts - Reconnect attempts already used.
 * @param lastError - Optional last error text.
 * @returns Consumer state object.
 */
export function snapshotConsumerState(
  accountId: ImAccountId,
  isRunning: boolean,
  reconnectAttempts: number,
  lastError?: string,
): DingTalkConsumerState {
  return {
    accountId,
    isRunning,
    reconnectAttempts,
    ...(lastError !== undefined ? { lastError } : {}),
  }
}

/**
 * True when the spawned command exited 0 without a terminating signal.
 *
 * @param outcome - Spawned-command exit facts.
 * @returns Whether the command completed cleanly.
 */
export function exitedCleanly(outcome: SubprocessOutcome): boolean {
  return outcome.exitCode === 0 && outcome.signal === null
}
