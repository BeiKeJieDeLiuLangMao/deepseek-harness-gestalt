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

  /**
   * Start event consumer stream for an account.
   * @param accountId - Connected DingTalk account.
   * @param config - Optional DWS spawn override for this consumer.
   */
  abstract startConsumer(accountId: ImAccountId, config?: DingTalkDwsAdapterConfig): Promise<void>

  /**
   * Stop event consumer stream for an account.
   * @param accountId - Connected DingTalk account.
   */
  abstract stopConsumer(accountId: ImAccountId): Promise<void>

  /**
   * Send a message through DWS CLI.
   * @param request - Outbound send request.
   * @returns Settled send result, including `result_unknown`.
   */
  abstract sendMessage(request: DingTalkSendMessageRequest): Promise<DingTalkSendMessageResult>

  /**
   * Query send status for an openTaskId.
   * @param openTaskId - DWS outbound task id.
   * @param accountId - Optional account that owns the task.
   * @returns Current send-status snapshot.
   */
  abstract querySendStatus(openTaskId: string, accountId?: ImAccountId): Promise<DingTalkSendStatusResult>

  /**
   * Snapshot of one account's consumer stream.
   * @param accountId - Connected DingTalk account.
   * @returns Current consumer running state.
   */
  abstract getConsumerState(accountId: ImAccountId): DingTalkConsumerState
}
