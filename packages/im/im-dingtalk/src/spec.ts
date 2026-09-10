/**
 * Service Definition for DingTalk DWS adapter.
 *
 * @module @deepseek-ai/dsh-im-dingtalk/spec
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type {
  DingTalkConsumerState,
  DingTalkDwsAdapterConfig,
  DingTalkSendMessageRequest,
  DingTalkSendMessageResult,
  DingTalkSendStatusResult,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imDingtalk: DingTalkDwsAdapterService
  }
}

/**
 * Service Definition for DingTalk DWS adapter.
 */
export abstract class DingTalkDwsAdapterService extends Service {
  constructor(ctx: Context, name = 'imDingtalk') {
    super(ctx, name)
  }

  /** Start event consumer stream for an account. */
  abstract startConsumer(accountId: ImAccountId, config?: DingTalkDwsAdapterConfig): Promise<void>

  /** Stop event consumer stream for an account. */
  abstract stopConsumer(accountId: ImAccountId): Promise<void>

  /** Send a message through DWS CLI. */
  abstract sendMessage(request: DingTalkSendMessageRequest): Promise<DingTalkSendMessageResult>

  /** Query send status for an openTaskId. */
  abstract querySendStatus(openTaskId: string, accountId?: ImAccountId): Promise<DingTalkSendStatusResult>

  /** Snapshot of one account's consumer stream. */
  abstract getConsumerState(accountId: ImAccountId): DingTalkConsumerState
}
