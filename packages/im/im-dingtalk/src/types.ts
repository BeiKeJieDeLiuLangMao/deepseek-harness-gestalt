/**
 * Types for DingTalk DWS adapter capability seam.
 *
 * @module @deepseek-ai/dsh-im-dingtalk/types
 */

import type { ImAccountId, ImConversationKind } from '@deepseek-ai/dsh-im-core/types'

/** Configuration for DingTalk DWS adapter instance. */
export interface DingTalkDwsAdapterConfig {
  /** Optional custom path or command name for dws executable. Defaults to 'dws'. */
  readonly dwsPath?: string
  /** Optional DWS organization profile name or corpId. */
  readonly profile?: string
  /** Subprocess spawn grace in milliseconds. Defaults to 5000ms. */
  readonly graceMs?: number
  /** Working directory for dws child process. Defaults to process.cwd(). */
  readonly cwd?: string
  /** Reconnection delay in milliseconds on abnormal consumer stream exit. Defaults to 3000ms. */
  readonly reconnectDelayMs?: number
  /** Max reconnection attempts before failing or pausing. Defaults to 5. */
  readonly maxReconnectAttempts?: number
}

/** Outbound message request to DingTalk via DWS. */
export interface DingTalkSendMessageRequest {
  readonly accountId: ImAccountId
  readonly conversationKind: ImConversationKind
  /**
   * Target identifier:
   * - For group: openConversationId (passed via --group)
   * - For direct: userId (via --user) or openDingTalkId (via --open-dingtalk-id)
   */
  readonly targetId: string
  readonly targetIdType?: 'group' | 'user' | 'open-dingtalk-id'
  readonly text: string
  readonly title?: string
  readonly isAi?: boolean
  readonly replyTo?: {
    readonly conversationId: string
    readonly refMsgId: string
    readonly refSenderOpenDingTalkId: string
  }
  readonly uuid?: string
}

/** Outbound message send result. */
export interface DingTalkSendMessageResult {
  readonly status: 'sent' | 'result_unknown' | 'pre_send_failed'
  readonly openTaskId?: string
  readonly error?: string
  readonly rawOutput?: string
}

/** Query message send status result. */
export interface DingTalkSendStatusResult {
  readonly openTaskId: string
  readonly status: 'sent' | 'failed' | 'pending' | 'unknown'
  readonly rawStatus?: string
  readonly errorCode?: string
  readonly errorMessage?: string
}

/**
 * Raw DWS event structure from `dws event consume` NDJSON.
 */
export interface DwsEventRawPayload {
  readonly event_key?: string
  readonly event_type?: string
  readonly type?: string
  readonly msgId?: string
  readonly message_id?: string
  readonly openConversationId?: string
  readonly conversation_id?: string
  readonly senderId?: string
  readonly sender_id?: string
  readonly senderNick?: string
  readonly sender_nick?: string
  readonly content?: string | { text?: string; [key: string]: unknown }
  readonly text?: string
  readonly isSelf?: boolean
  readonly is_self?: boolean
  readonly aiTag?: boolean
  readonly ai_tag?: boolean
  readonly clientSource?: string
  readonly timestamp?: number | string
  readonly [key: string]: unknown
}

/**
 * Active consumer stream state for an account.
 */
export interface DingTalkConsumerState {
  readonly accountId: ImAccountId
  readonly isRunning: boolean
  readonly reconnectAttempts: number
  readonly lastError?: string
  readonly lastEventAt?: string
}
