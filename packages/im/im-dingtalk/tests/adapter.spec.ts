/**
 * Comprehensive tests for DingTalk DWS adapter:
 * - Start/stop consumer stream with mock subprocess
 * - NDJSON parsing and sender evidence classification (external, native, ai echo, unknown)
 * - Message sending (group, user, open-dingtalk-id)
 * - Reply command required fields (--conversation-id, --ref-msg-id, --ref-sender, NEVER --group)
 * - Pre-send validations (missing account, account paused)
 * - Result unknown on timeout/signal kill (no blind retry)
 * - Query send status convergence
 * - Subprocess lifecycle and dispose termination
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId, ImAccountMetadata } from '@deepseek-ai/dsh-im-core/types'
import type { ReceiveInboundOptions, ReceiveInboundResult } from '@deepseek-ai/dsh-im-core/delivery'
import { DingTalkDwsAdapterServiceImpl } from '../src/service.ts'
import { classifySender, parseDwsEventLine } from '../src/parser.ts'
import { Readable, Writable } from 'node:stream'

function createMockSubprocessHandle(spec: SubprocessSpawnSpec, outcomeStatus: 'exited' | 'timeout' | 'signalled' = 'exited', exitCode = 0, stdoutText = '', stderrText = ''): SubprocessHandle {
  const stdoutStream = new Readable({
    read() {
      if (stdoutText) {
        this.push(stdoutText)
        stdoutText = ''
      }
      this.push(null)
    },
  })
  const stdinStream = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })

  return {
    spec,
    stdin: stdinStream,
    stdout: stdoutStream,
    stderr: new Readable({ read() { this.push(null) } }),
    stdoutReader: {
      read: () => ({ text: stdoutText, truncated: false }),
    },
    stderrReader: {
      read: () => ({ text: stderrText, truncated: false }),
    },
    terminate: vi.fn(),
    waitForExit: vi.fn(async () => true),
    done: Promise.resolve({
      status: outcomeStatus,
      exitCode: outcomeStatus === 'exited' ? exitCode : undefined,
    } as unknown as SubprocessOutcome),
  }
}

describe('DingTalk DWS Parser and Sender Classification', () => {
  const accId = brandString<ImAccountId>('acc-dt-1')

  it('classifies external messages accurately without guessing', () => {
    const payload = {
      msgId: 'msg-ext-100',
      openConversationId: 'cid-group-1',
      senderId: 'user-external-99',
      senderNick: 'Partner Alice',
      content: 'Hello agent',
    }
    const { classification, evidence } = classifySender(payload, 'user-self-1')
    expect(classification).toBe('external')
    expect(evidence.rawSenderId).toBe('user-external-99')
    expect(evidence.rawSenderNick).toBe('Partner Alice')
    expect(evidence.isSelfAccount).toBe(false)
  })

  it('classifies AI outbound echo when ai_tag or clientSource is set', () => {
    const payload = {
      msgId: 'msg-ai-101',
      openConversationId: 'cid-group-1',
      senderId: 'user-self-1',
      aiTag: true,
      content: 'I am responding as agent',
    }
    const { classification, evidence } = classifySender(payload, 'user-self-1')
    expect(classification).toBe('ai_outbound')
    expect(evidence.isSelfAccount).toBe(true)
    expect(evidence.clientSource).toBe('ai_agent')
  })

  it('classifies unknown when self account speaks without explicit clientSource evidence (Spec Story 18)', () => {
    const payload = {
      msgId: 'msg-unknown-self',
      openConversationId: 'cid-group-1',
      senderId: 'user-self-1',
      content: 'I spoke without clientSource header',
    }
    const { classification, evidence } = classifySender(payload, 'user-self-1')
    expect(classification).toBe('unknown')
    expect(evidence.isSelfAccount).toBe(true)
    expect(evidence.notes).toContain('clientSource absent or unrecognized')
  })

  it('classifies human native when self account speaks natively with native_app clientSource', () => {
    const payload = {
      msgId: 'msg-human-102',
      openConversationId: 'cid-group-1',
      senderId: 'user-self-1',
      clientSource: 'native_app',
      content: 'I will take over this conversation',
    }
    const { classification, evidence } = classifySender(payload, 'user-self-1')
    expect(classification).toBe('human_native')
    expect(evidence.isSelfAccount).toBe(true)
    expect(evidence.clientSource).toBe('native_app')
  })

  it('classifies human DSH when self account speaks via DSH manual send', () => {
    const payload = {
      msgId: 'msg-dsh-103',
      openConversationId: 'cid-group-1',
      senderId: 'user-self-1',
      clientSource: 'dsh_manual',
      content: 'Sent from DSH sidebar',
    }
    const { classification, evidence } = classifySender(payload, 'user-self-1')
    expect(classification).toBe('human_dsh')
    expect(evidence.clientSource).toBe('dsh_manual')
  })

  it('parses DWS NDJSON line into ReceiveInboundOptions', () => {
    const line = JSON.stringify({
      msgId: 'msg-ndjson-1',
      openConversationId: 'cid-conv-42',
      senderId: 'user-ext-2',
      content: { text: 'How do I return this order?' },
      type: 'group',
      timestamp: 1788200000000,
    })
    const inbound = parseDwsEventLine(line, accId, 'user-self-1')
    expect(inbound).not.toBeNull()
    expect(inbound?.externalMessageId).toBe('msg-ndjson-1')
    expect(inbound?.content.text).toBe('How do I return this order?')
    expect(inbound?.scope).toEqual({
      kind: 'real',
      platform: 'dingtalk',
      accountId: accId,
      conversationId: 'cid-conv-42',
      conversationKind: 'group',
    })
    expect(inbound?.senderClassification).toBe('external')
  })

  it('skips non-json banner lines gracefully', () => {
    expect(parseDwsEventLine('[event] ready', accId)).toBeNull()
    expect(parseDwsEventLine('dws event consume - preview', accId)).toBeNull()
    expect(parseDwsEventLine('', accId)).toBeNull()
  })
})

describe('DingTalk DWS Adapter Service Lifecycle and Outbound Seam', () => {
  const accId = brandString<ImAccountId>('acc-dt-service')

  function setupTestContext(account?: Partial<ImAccountMetadata>) {
    const ctx = new Context()

    const mockInboundCalls: ReceiveInboundOptions[] = []
    const mockSpawnCalls: SubprocessSpawnSpec[] = []

    ctx.imConfig = {
      getAccount: vi.fn(async (id: ImAccountId) => {
        if (id === accId) {
          return {
            id: accId,
            platform: 'dingtalk',
            displayName: 'Test DingTalk Account',
            status: 'connected',
            paused: false,
            platformMetadata: { user_id: 'user-self-123' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...account,
          } as ImAccountMetadata
        }
        return undefined
      }),
    } as unknown as typeof ctx.imConfig

    ctx.imDelivery = {
      receiveInbound: vi.fn(async (options: ReceiveInboundOptions) => {
        mockInboundCalls.push(options)
        return {
          duplicate: false,
          message: {
            messageId: 'msg-1',
            scopeId: 'scope-1',
            externalMessageId: options.externalMessageId,
          },
        } as unknown as ReceiveInboundResult
      }),
    } as unknown as typeof ctx.imDelivery

    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        mockSpawnCalls.push(spec)
        return createMockSubprocessHandle(spec, 'exited', 0, JSON.stringify({ openTaskId: 'task-mock-999' }))
      }),
    } as unknown as typeof ctx.subprocess

    const service = new DingTalkDwsAdapterServiceImpl(ctx, {
      dwsPath: '/custom/bin/dws',
      profile: 'corpTest',
    })

    return { ctx, service, mockInboundCalls, mockSpawnCalls }
  }

  it('starts consumer stream and receives inbound events into imDelivery', async () => {
    const { service, ctx, mockInboundCalls, mockSpawnCalls } = setupTestContext()

    let capturedHandle: SubprocessHandle | undefined
    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      mockSpawnCalls.push(spec)
      const line = JSON.stringify({
        msgId: 'msg-stream-1',
        openConversationId: 'cid-stream-group',
        senderId: 'user-buyer',
        content: 'Check logistics',
      }) + '\n'
      capturedHandle = createMockSubprocessHandle(spec, 'exited', 0, line)
      return capturedHandle
    })

    await service.startConsumer(accId)

    expect(mockSpawnCalls.length).toBe(1)
    expect(mockSpawnCalls[0]?.argv).toEqual([
      '/custom/bin/dws',
      'event',
      'consume',
      '--format',
      'ndjson',
      '--ephemeral',
      '--profile',
      'corpTest',
    ])

    // Wait a tick for stdout data listener to process
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockInboundCalls.length).toBe(1)
    expect(mockInboundCalls[0]?.externalMessageId).toBe('msg-stream-1')
    expect(mockInboundCalls[0]?.content.text).toBe('Check logistics')

    // Verify stopConsumer
    await service.stopConsumer(accId)
    expect(capturedHandle?.terminate).toHaveBeenCalled()
  })

  it('sends group message with --group flag', async () => {
    const { service, mockSpawnCalls } = setupTestContext()

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'Order dispatched',
      isAi: true,
      uuid: 'uuid-12345',
    })

    expect(result.status).toBe('sent')
    expect(result.openTaskId).toBe('task-mock-999')

    expect(mockSpawnCalls.length).toBe(1)
    expect(mockSpawnCalls[0]?.argv).toEqual([
      '/custom/bin/dws',
      'chat',
      'message',
      'send',
      '--text',
      'Order dispatched',
      '-f',
      'json',
      '--group',
      'cid-target-group-99',
      '--ai-tag',
      'true',
      '--uuid',
      'uuid-12345',
      '--profile',
      'corpTest',
    ])
  })

  it('sends reply message with --conversation-id, --ref-msg-id, --ref-sender and NEVER --group', async () => {
    const { service, mockSpawnCalls } = setupTestContext()

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'Got your message, resolving now',
      replyTo: {
        conversationId: 'cid-target-group-99',
        refMsgId: 'msg-ref-111',
        refSenderOpenDingTalkId: 'openId-sender-222',
      },
      isAi: true,
    })

    expect(result.status).toBe('sent')
    expect(mockSpawnCalls.length).toBe(1)
    const argv = mockSpawnCalls[0]?.argv ?? []
    expect(argv).toContain('reply')
    expect(argv).not.toContain('--group')
    expect(argv).toContain('--conversation-id')
    expect(argv).toContain('cid-target-group-99')
    expect(argv).toContain('--ref-msg-id')
    expect(argv).toContain('msg-ref-111')
    expect(argv).toContain('--ref-sender')
    expect(argv).toContain('openId-sender-222')
  })

  it('rejects reply when required fields are missing', async () => {
    const { service } = setupTestContext()

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'incomplete reply',
      replyTo: {
        conversationId: 'cid-target-group-99',
        refMsgId: '',
        refSenderOpenDingTalkId: '',
      },
    })

    expect(result.status).toBe('pre_send_failed')
    expect(result.error).toContain('Reply requires conversationId, refMsgId, and refSenderOpenDingTalkId')
  })

  it('fails pre-send when account is paused for AI outbound', async () => {
    const { service } = setupTestContext({ paused: true })

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'AI should not talk while paused',
      isAi: true,
    })

    expect(result.status).toBe('pre_send_failed')
    expect(result.error).toContain('is paused for automated AI messages')
  })

  it('marks status as result_unknown when process times out or is killed, avoiding blind retry', async () => {
    const { service, ctx } = setupTestContext()

    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      return createMockSubprocessHandle(spec, 'timeout', undefined, '', 'Execution timed out after 5000ms')
    })

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'Timeout message',
    })

    expect(result.status).toBe('result_unknown')
    expect(result.error).toContain('Execution timeout; request may or may not have reached DingTalk')
  })

  it('guards exit0 with completely empty stdout (stdout="") by resolving to result_unknown instead of sent', async () => {
    const { service, ctx } = setupTestContext()

    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      return createMockSubprocessHandle(spec, 'exited', 0, '')
    })

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'Message with empty stdout',
    })

    expect(result.status).toBe('result_unknown')
    expect(result.status).not.toBe('sent')
    expect(result.error).toContain('no openTaskId receipt')
    expect(result.rawOutput).toBe('')
  })

  it('guards exit0 without openTaskId receipt by resolving to result_unknown instead of sent', async () => {
    const { service, ctx } = setupTestContext()

    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      return createMockSubprocessHandle(spec, 'exited', 0, JSON.stringify({ success: true, text: 'No receipt openTaskId' }))
    })

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'Message that has no receipt',
    })

    expect(result.status).toBe('result_unknown')
    expect(result.status).not.toBe('sent')
    expect(result.error).toContain('no openTaskId receipt')
  })

  it('marks local subprocess spawn failure before transmission as pre_send_failed (safe to retry)', async () => {
    const { service, ctx } = setupTestContext()

    ctx.subprocess.spawn = vi.fn(() => {
      const err = new Error('spawn ENOENT')
      Reflect.set(err, 'code', 'ENOENT')
      throw err
    })

    const result = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-target-group-99',
      text: 'Message where spawn fails locally',
    })

    expect(result.status).toBe('pre_send_failed')
    expect(result.status).not.toBe('result_unknown')
    expect(result.error).toContain('Local process spawn failed before transmission')
  })

  it('queries send status and maps response accurately', async () => {
    const { service, ctx } = setupTestContext()

    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      return createMockSubprocessHandle(spec, 'exited', 0, JSON.stringify({ status: 'success' }))
    })

    const statusResult = await service.querySendStatus('task-mock-999')
    expect(statusResult.status).toBe('sent')
    expect(statusResult.openTaskId).toBe('task-mock-999')
  })
})
