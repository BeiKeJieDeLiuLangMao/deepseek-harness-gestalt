/**
 * Service Implementation for DingTalk DWS adapter.
 *
 * @module @deepseek-ai/dsh-im-dingtalk/service
 */

import { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import { DingTalkDwsAdapterService } from './spec.ts'
import { parseDwsEventLine } from './parser.ts'
import type {
  DingTalkConsumerState,
  DingTalkDwsAdapterConfig,
  DingTalkSendMessageRequest,
  DingTalkSendMessageResult,
  DingTalkSendStatusResult,
} from './types.ts'

interface ActiveConsumer {
  readonly accountId: ImAccountId
  readonly handle: SubprocessHandle
  readonly abortController: AbortController
  stopped: boolean
  reconnectCount: number
  reconnectTimer?: ReturnType<typeof setTimeout> | undefined
  lastError?: string | undefined
}

/**
 * DingTalk DWS adapter implementing event stream consumption, message sending,
 * send status querying, and reliable outbound callback registration.
 */
export class DingTalkDwsAdapterServiceImpl extends DingTalkDwsAdapterService {
  static inject = ['subprocess', 'imConfig', 'imDelivery']

  private readonly consumers = new Map<ImAccountId, ActiveConsumer>()
  private readonly defaultDwsPath: string
  private readonly defaultGraceMs: number
  private readonly defaultReconnectDelayMs: number
  private readonly defaultMaxReconnectAttempts: number
  private isDisposed = false

  private readonly consumerStates = new Map<ImAccountId, DingTalkConsumerState>()

  constructor(ctx: Context, readonly config: DingTalkDwsAdapterConfig = {}) {
    super(ctx, 'imDingtalk')
    this.defaultDwsPath = config.dwsPath || 'dws'
    this.defaultGraceMs = config.graceMs ?? 5000
    this.defaultReconnectDelayMs = config.reconnectDelayMs ?? 1000
    this.defaultMaxReconnectAttempts = config.maxReconnectAttempts ?? 5

    // Defensive lifecycle: async dispose shuts down all running child processes and awaits quiescence
    this.ctx.effect(() => () => this.disposeAll(), 'imDingtalk.disposeAll')
  }

  getConsumerState(accountId: ImAccountId): DingTalkConsumerState {
    const active = this.consumers.get(accountId)
    if (active) {
      return {
        accountId,
        isRunning: !active.stopped,
        reconnectAttempts: active.reconnectCount,
        lastError: active.lastError,
      }
    }
    const historical = this.consumerStates.get(accountId)
    if (historical) {
      return historical
    }
    return {
      accountId,
      isRunning: false,
      reconnectAttempts: 0,
    }
  }

  /**
   * Starts event consume stream for the given account via `dws event consume --format ndjson --ephemeral`.
   */
  async startConsumer(accountId: ImAccountId, configOverride?: DingTalkDwsAdapterConfig): Promise<void> {
    if (this.isDisposed) {
      throw new Error(`Cannot start consumer for account ${accountId}: DingTalk DWS adapter service is disposed`)
    }

    const existing = this.consumers.get(accountId)
    if (existing && !existing.stopped) {
      return
    }

    const dwsPath = configOverride?.dwsPath || this.config.dwsPath || this.defaultDwsPath
    const profile = configOverride?.profile || this.config.profile
    const graceMs = configOverride?.graceMs ?? this.config.graceMs ?? this.defaultGraceMs
    const cwd = configOverride?.cwd || this.config.cwd || process.cwd()

    // Query account identity from imConfig to extract managed userId if present
    const account = await this.ctx.imConfig.getAccount(accountId)
    const managedUserId = account?.platformMetadata?.['user_id'] || account?.platformMetadata?.['userId']

    const args: string[] = ['event', 'consume', '--format', 'ndjson', '--ephemeral']
    if (profile) {
      args.push('--profile', profile)
    }

    const abortController = new AbortController()
    const handle = this.ctx.subprocess.spawn({
      argv: [dwsPath, ...args],
      cwd,
      graceMs,
      signal: abortController.signal,
      stdio: {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: { maxBytes: 65536 },
      },
    })

    const consumer: ActiveConsumer = {
      accountId,
      handle,
      abortController,
      stopped: false,
      reconnectCount: (existing?.reconnectCount ?? 0),
    }
    this.consumers.set(accountId, consumer)

    // Stream NDJSON lines from child stdout
    if (handle.stdout) {
      let buffer = ''
      handle.stdout.setEncoding('utf8')
      handle.stdout.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        const last = lines.pop()
        buffer = last !== undefined ? last : ''
        for (const line of lines) {
          const inboundOptions = parseDwsEventLine(line, accountId, managedUserId)
          if (inboundOptions) {
            this.ctx.imDelivery.receiveInbound(inboundOptions).catch((err) => {
              const errMsg = String(err)
              consumer.lastError = errMsg
              consumer.stopped = true
              this.ctx.logger('imDingtalk').warn(`receiveInbound failed, terminating consumer: ${errMsg}`)
              this.stopConsumer(accountId).catch(() => {})
            })
          }
        }
      })
    }

    // Monitor process exit for unexpected terminations and auto-reconnect
    handle.done.then((outcome) => {
      if (consumer.stopped || this.isDisposed) {
        return
      }
      if (outcome.status === 'exited' && outcome.exitCode === 0) {
        // Clean exit
        consumer.stopped = true
        return
      }
      // Abnormal exit: attempt reconnect if below limit and service is not disposed
      const stderr = handle.stderrReader !== undefined ? handle.stderrReader.read().text : ''
      if (stderr !== '') {
        consumer.lastError = stderr
        this.consumerStates.set(accountId, {
          accountId,
          isRunning: false,
          reconnectAttempts: consumer.reconnectCount,
          lastError: stderr,
        })
      }

      if (consumer.reconnectCount < this.defaultMaxReconnectAttempts && !this.isDisposed) {
        consumer.reconnectCount++
        consumer.stopped = true
        consumer.reconnectTimer = setTimeout(() => {
          if (!this.isDisposed) {
            this.startConsumer(accountId, configOverride).catch(() => {})
          }
        }, this.defaultReconnectDelayMs)
      } else {
        consumer.stopped = true
      }
    }).catch(() => {
      consumer.stopped = true
    })
  }

  /**
   * Stops event consumer stream gracefully via closing stdin / terminate.
   */
  async stopConsumer(accountId: ImAccountId): Promise<void> {
    const consumer = this.consumers.get(accountId)
    if (!consumer) {
      return
    }

    consumer.stopped = true
    if (consumer.reconnectTimer !== undefined) {
      clearTimeout(consumer.reconnectTimer)
      consumer.reconnectTimer = undefined
    }
    consumer.handle.stdin?.end()
    consumer.handle.terminate()
    const exited = await consumer.handle.waitForExit(consumer.handle.spec.graceMs)
    this.consumerStates.set(accountId, {
      accountId,
      isRunning: false,
      reconnectAttempts: consumer.reconnectCount,
      lastError: consumer.lastError,
    })
    this.consumers.delete(accountId)
    if (!exited) {
      throw new Error(`Consumer child process for account ${accountId} failed to terminate within grace period`)
    }
  }

  /**
   * Sends a message via DWS CLI (`dws chat message send` or `reply`).
   */
  async sendMessage(request: DingTalkSendMessageRequest): Promise<DingTalkSendMessageResult> {
    // Check pre-send conditions
    const account = await this.ctx.imConfig.getAccount(request.accountId)
    if (!account) {
      return {
        status: 'pre_send_failed',
        error: `Account ${request.accountId} not found in imConfig`,
      }
    }
    if (account.paused && request.isAi) {
      return {
        status: 'pre_send_failed',
        error: `Account ${request.accountId} is paused for automated AI messages`,
      }
    }

    const dwsPath = this.config.dwsPath || this.defaultDwsPath
    const profile = this.config.profile
    const cwd = this.config.cwd || process.cwd()
    const graceMs = this.config.graceMs ?? this.defaultGraceMs

    let argv: string[] = []

    if (request.replyTo) {
      // Reply command requires --conversation-id, --ref-msg-id, --ref-sender, --text. NEVER pass --group.
      if (!request.replyTo.conversationId || !request.replyTo.refMsgId || !request.replyTo.refSenderOpenDingTalkId) {
        return {
          status: 'pre_send_failed',
          error: 'Reply requires conversationId, refMsgId, and refSenderOpenDingTalkId',
        }
      }
      argv = [
        dwsPath,
        'chat',
        'message',
        'reply',
        '--conversation-id',
        request.replyTo.conversationId,
        '--ref-msg-id',
        request.replyTo.refMsgId,
        '--ref-sender',
        request.replyTo.refSenderOpenDingTalkId,
        '--text',
        request.text,
        '-f',
        'json',
      ]
    } else {
      // Send command
      argv = [dwsPath, 'chat', 'message', 'send', '--text', request.text, '-f', 'json']
      if (request.targetIdType === 'open-dingtalk-id') {
        argv.push('--open-dingtalk-id', request.targetId)
      } else if (request.conversationKind === 'group') {
        argv.push('--group', request.targetId)
      } else {
        argv.push('--user', request.targetId)
      }

      if (request.title) {
        argv.push('--title', request.title)
      }
    }

    if (request.isAi) {
      argv.push('--ai-tag', 'true')
    } else {
      argv.push('--ai-tag', 'false')
    }
    if (request.uuid) {
      argv.push('--uuid', request.uuid)
    }
    if (profile) {
      argv.push('--profile', profile)
    }

    let handle: SubprocessHandle
    try {
      handle = this.ctx.subprocess.spawn({
        argv,
        cwd,
        graceMs,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 65536 },
          stderr: { maxBytes: 65536 },
        },
      })
    } catch (spawnErr) {
      // Local spawn failure (e.g. binary not found, invalid argv, permissions) means the request never left the host
      return {
        status: 'pre_send_failed',
        error: `Local process spawn failed before transmission: ${String(spawnErr)}`,
      }
    }

    try {
      const outcome = await handle.done
      const stdout = handle.stdoutReader !== undefined ? handle.stdoutReader.read().text : ''
      const stderr = handle.stderrReader !== undefined ? handle.stderrReader.read().text : ''

      if (outcome.status === 'exited' && outcome.exitCode === 0) {
        let openTaskId: string | undefined
        try {
          const parsed = JSON.parse(stdout)
          openTaskId = parsed.openTaskId ?? parsed.open_task_id
        } catch {
          // Output was not JSON, parse openTaskId regex
          const match = stdout.match(/openTaskId[:\s]+([a-zA-Z0-9_-]+)/)
          if (match) {
            openTaskId = match[1]
          }
        }

        // Defensive guard: exit 0 without a valid receipt (openTaskId) is ambiguous/receiptless
        if (!openTaskId) {
          return {
            status: 'result_unknown',
            error: 'DWS command exited 0 but produced no openTaskId receipt; status undetermined',
            rawOutput: stdout,
          }
        }

        return {
          status: 'sent',
          openTaskId,
          rawOutput: stdout,
        }
      }

      // Check if command failed pre-send (e.g. argument error, invalid syntax) vs unknown
      // If the process timed out or signal-killed after spawn, status is unknown to avoid double-send
      if (outcome.status === 'timeout' || outcome.status === 'signalled') {
        return {
          status: 'result_unknown',
          error: `Execution ${outcome.status}; request may or may not have reached DingTalk`,
          rawOutput: stderr !== '' ? stderr : stdout,
        }
      }

      // If exit code is non-zero, check stderr
      const errDetail = stderr !== '' ? stderr : `dws failed with exit code ${String(outcome.exitCode)}`
      return {
        status: 'pre_send_failed',
        error: errDetail,
        rawOutput: stderr,
      }
    } catch (err) {
      // If error occurred after spawn was created (e.g. timeout reading pipe or stream crash),
      // status is unknown to avoid double-send
      return {
        status: 'result_unknown',
        error: `In-flight execution failed: ${String(err)}`,
      }
    }
  }

  /**
   * Queries message send status by openTaskId.
   */
  async querySendStatus(openTaskId: string): Promise<DingTalkSendStatusResult> {
    const dwsPath = this.config.dwsPath || this.defaultDwsPath
    const profile = this.config.profile
    const cwd = this.config.cwd || process.cwd()
    const graceMs = this.config.graceMs ?? this.defaultGraceMs

    const argv = [
      dwsPath,
      'chat',
      'message',
      'query-send-status',
      '--open-task-id',
      openTaskId,
      '-f',
      'json',
    ]
    if (profile) {
      argv.push('--profile', profile)
    }

    let handle: SubprocessHandle
    try {
      handle = this.ctx.subprocess.spawn({
        argv,
        cwd,
        graceMs,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 65536 },
          stderr: { maxBytes: 65536 },
        },
      })
    } catch (spawnErr) {
      return {
        openTaskId,
        status: 'unknown',
        errorMessage: `Local process spawn failed: ${String(spawnErr)}`,
      }
    }

    try {
      const outcome = await handle.done
      const stdout = handle.stdoutReader !== undefined ? handle.stdoutReader.read().text : ''
      const stderr = handle.stderrReader !== undefined ? handle.stderrReader.read().text : ''

      if (outcome.status === 'exited' && outcome.exitCode === 0) {
        try {
          const parsed = JSON.parse(stdout)
          const rawStatus = String(parsed.status ?? parsed.sendStatus).toLowerCase()
          if (rawStatus.includes('success') || rawStatus === 'sent') {
            return { openTaskId, status: 'sent', rawStatus }
          }
          if (rawStatus.includes('fail')) {
            return {
              openTaskId,
              status: 'failed',
              rawStatus,
              errorMessage: parsed.errorMessage ?? parsed.message,
            }
          }
          if (rawStatus.includes('wait') || rawStatus === 'pending') {
            return { openTaskId, status: 'pending', rawStatus }
          }
          return { openTaskId, status: 'sent', rawStatus }
        } catch {
          return { openTaskId, status: 'unknown', rawStatus: stdout }
        }
      }

      const queryErrMsg = stderr !== '' ? stderr : `Query failed with exit code ${String(outcome.exitCode)}`
      return {
        openTaskId,
        status: 'unknown',
        errorMessage: queryErrMsg,
      }
    } catch (err) {
      return {
        openTaskId,
        status: 'unknown',
        errorMessage: String(err),
      }
    }
  }

  /**
   * Defensive async teardown of all active subprocess consumers, reaching quiescence.
   */
  private async disposeAll(): Promise<void> {
    this.isDisposed = true
    const waits: Promise<boolean>[] = []
    for (const consumer of this.consumers.values()) {
      consumer.stopped = true
      if (consumer.reconnectTimer !== undefined) {
        clearTimeout(consumer.reconnectTimer)
        consumer.reconnectTimer = undefined
      }
      try {
        consumer.handle.stdin?.end()
        consumer.handle.terminate()
        waits.push(consumer.handle.waitForExit(consumer.handle.spec.graceMs))
      } catch {
        // Quiescence best-effort
      }
    }
    await Promise.allSettled(waits)
    this.consumers.clear()
  }
}
