/**
 * Comprehensive behavioral tests for DingTalk DWS message targets, send status inquiry,
 * error handling, and parser specifications.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import { DingTalkDwsAdapterServiceImpl } from '../src/service.ts'
import { classifySender, extractTextContent, parseDwsEventLine } from '../src/parser.ts'
import { Readable, Writable } from 'node:stream'

describe('DingTalk DWS Message Targets and Send Status Inquiry', () => {
  const accId = brandString<ImAccountId>('acc-dt-targets')

  function createMockHandle(spec: SubprocessSpawnSpec, stdoutText: string, exitCode = 0, status: 'exited' | 'timeout' | 'signalled' = 'exited'): SubprocessHandle {
    return {
      spec,
      stdin: new Writable({ write(_c, _e, cb) { cb() } }),
      stdout: new Readable({ read() { this.push(null) } }),
      stderr: new Readable({ read() { this.push(null) } }),
      stdoutReader: { read: () => ({ text: stdoutText, truncated: false }) },
      stderrReader: { read: () => ({ text: exitCode === 0 ? '' : stdoutText, truncated: false }) },
      terminate: vi.fn(),
      waitForExit: vi.fn(async () => true),
      done: Promise.resolve({
        status,
        exitCode: status === 'exited' ? exitCode : undefined,
      } as unknown as SubprocessOutcome),
    }
  }

  it('sends direct message targeting user ID and openDingTalkId', async () => {
    const ctx = new Context()
    let lastSpec: SubprocessSpawnSpec | undefined
    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        lastSpec = spec
        return createMockHandle(spec, JSON.stringify({ openTaskId: 'task-dm-1' }))
      }),
    } as unknown as typeof ctx.subprocess
    ctx.imConfig = { getAccount: vi.fn(async () => ({ id: accId, paused: false })) } as unknown as typeof ctx.imConfig

    const service = new DingTalkDwsAdapterServiceImpl(ctx)

    // Direct message by userId
    const resUser = await service.sendMessage({
      accountId: accId,
      conversationKind: 'direct',
      targetId: 'user_123',
      targetIdType: 'user',
      text: 'Direct message by userId',
    })
    expect(resUser.status).toBe('sent')
    expect(lastSpec?.argv).toContain('--user')
    expect(lastSpec?.argv).toContain('user_123')

    // Direct message by openDingTalkId
    const resOpenId = await service.sendMessage({
      accountId: accId,
      conversationKind: 'direct',
      targetId: 'open_456',
      targetIdType: 'open-dingtalk-id',
      text: 'Direct message by openDingTalkId',
    })
    expect(resOpenId.status).toBe('sent')
    expect(lastSpec?.argv).toContain('--open-dingtalk-id')
    expect(lastSpec?.argv).toContain('open_456')

    // Repeat startConsumer on already running consumer
    await service.startConsumer(accId)

    // Stop non-existent account
    await service.stopConsumer(brandString<ImAccountId>('acc-non-existent'))

    // Output JSON with open_task_id format
    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      return createMockHandle(spec, JSON.stringify({ open_task_id: 'task-snake-case' }))
    })
    const resSnake = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-snake',
      text: 'snake case task id',
      uuid: 'uuid-snake',
    })
    expect(resSnake.status).toBe('sent')
    expect(resSnake.openTaskId).toBe('task-snake-case')

    // Output plain text with openTaskId regex match
    ctx.subprocess.spawn = vi.fn((spec: SubprocessSpawnSpec) => {
      return createMockHandle(spec, 'openTaskId: task-regex-matched-1')
    })
    const resRegex = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-regex',
      text: 'regex matched task id',
    })
    expect(resRegex.status).toBe('sent')
    expect(resRegex.openTaskId).toBe('task-regex-matched-1')
  })

  it('handles message send error conditions and result_unknown', async () => {
    const ctx = new Context()

    // 1. Account not found
    ctx.imConfig = { getAccount: vi.fn(async () => undefined) } as unknown as typeof ctx.imConfig
    const service = new DingTalkDwsAdapterServiceImpl(ctx)
    const resMissing = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-1',
      text: 'test',
    })
    expect(resMissing.status).toBe('pre_send_failed')
    expect(resMissing.error).toContain('not found in imConfig')

    // 2. Command exit non-zero with empty stderr
    ctx.imConfig = { getAccount: vi.fn(async () => ({ id: accId, paused: false })) } as unknown as typeof ctx.imConfig
    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        return {
          spec,
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          stdoutReader: { read: () => ({ text: '', truncated: false }) },
          stderrReader: { read: () => ({ text: '', truncated: false }) },
          terminate: vi.fn(),
          waitForExit: vi.fn(async () => true),
          done: Promise.resolve({ status: 'exited', exitCode: 127 } as unknown as SubprocessOutcome),
        } as unknown as SubprocessHandle
      }),
    } as unknown as typeof ctx.subprocess
    const resExitErr = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-1',
      text: 'fail',
    })
    expect(resExitErr.status).toBe('pre_send_failed')
    expect(resExitErr.error).toBe('dws failed with exit code 127')

    // 3. Process signalled (killed before settlement)
    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => createMockHandle(spec, '', undefined, 'signalled')),
    } as unknown as typeof ctx.subprocess
    const resSignalled = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-1',
      text: 'killed',
    })
    expect(resSignalled.status).toBe('result_unknown')
    expect(resSignalled.error).toContain('Execution signalled')

    // 4. Unexpected spawn error thrown (never transmitted -> pre_send_failed)
    ctx.subprocess = {
      spawn: vi.fn(() => { throw new Error('Cannot allocate process') }),
    } as unknown as typeof ctx.subprocess
    const resSpawnErr = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-1',
      text: 'err',
    })
    expect(resSpawnErr.status).toBe('pre_send_failed')
    expect(resSpawnErr.error).toContain('Cannot allocate process')

    // 5. Exit 0 JSON without openTaskId must settle as result_unknown
    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        return createMockHandle(spec, JSON.stringify({ success: true, message: 'no-task-id-here' }), 0)
      }),
    } as unknown as typeof ctx.subprocess
    const resNoReceipt = await service.sendMessage({
      accountId: accId,
      conversationKind: 'group',
      targetId: 'cid-1',
      text: 'msg-without-receipt',
    })
    expect(resNoReceipt.status).toBe('result_unknown')
    expect(resNoReceipt.status).not.toBe('sent')
    expect(resNoReceipt.error).toContain('no openTaskId receipt')
  })

  it('queries send status and maps failed, pending, and unknown outcomes', async () => {
    const ctx = new Context()
    let queryStdout = ''
    let queryExit = 0

    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => createMockHandle(spec, queryStdout, queryExit)),
    } as unknown as typeof ctx.subprocess

    const service = new DingTalkDwsAdapterServiceImpl(ctx)

    // Failed outcome with errorMessage
    queryStdout = JSON.stringify({ status: 'failed', errorMessage: 'Message recalled or rejected' })
    const failedRes = await service.querySendStatus('task-fail-1')
    expect(failedRes.status).toBe('failed')
    expect(failedRes.errorMessage).toBe('Message recalled or rejected')

    // Failed outcome with message property
    queryStdout = JSON.stringify({ status: 'failed', message: 'Rejected by group policy' })
    const failedMsgRes = await service.querySendStatus('task-fail-2')
    expect(failedMsgRes.status).toBe('failed')
    expect(failedMsgRes.errorMessage).toBe('Rejected by group policy')

    // Pending outcome
    queryStdout = JSON.stringify({ status: 'pending' })
    const pendingRes = await service.querySendStatus('task-wait-1')
    expect(pendingRes.status).toBe('pending')

    // Unknown outcome from non-json text
    queryStdout = 'Non-JSON text response'
    const unknownRes = await service.querySendStatus('task-unknown-1')
    expect(unknownRes.status).toBe('unknown')

    // Exit code non-zero with stderr
    queryStdout = 'Exit error stderr'
    queryExit = 1
    const exitErrRes = await service.querySendStatus('task-err-1')
    expect(exitErrRes.status).toBe('unknown')
    expect(exitErrRes.errorMessage).toBe('Exit error stderr')

    // Exit code non-zero with empty stderr
    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        return {
          spec,
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          stdoutReader: { read: () => ({ text: '', truncated: false }) },
          stderrReader: { read: () => ({ text: '', truncated: false }) },
          terminate: vi.fn(),
          waitForExit: vi.fn(async () => true),
          done: Promise.resolve({ status: 'exited', exitCode: 2 } as unknown as SubprocessOutcome),
        } as unknown as SubprocessHandle
      }),
    } as unknown as typeof ctx.subprocess
    const exitEmptyErrRes = await service.querySendStatus('task-err-2')
    expect(exitEmptyErrRes.status).toBe('unknown')
    expect(exitEmptyErrRes.errorMessage).toBe('Query failed with exit code 2')

    // Unexpected exception during querySendStatus
    ctx.subprocess = {
      spawn: vi.fn(() => { throw new Error('Query network failure') }),
    } as unknown as typeof ctx.subprocess
    const queryExceptRes = await service.querySendStatus('task-err-3')
    expect(queryExceptRes.status).toBe('unknown')
    expect(queryExceptRes.errorMessage).toContain('Query network failure')
  })

  it('handles parser edge cases: non-JSON lines, malformed events, and content types', () => {
    expect(parseDwsEventLine('', accId)).toBeNull()
    expect(parseDwsEventLine('   \n', accId)).toBeNull()
    expect(parseDwsEventLine('not json string', accId)).toBeNull()
    expect(parseDwsEventLine(JSON.stringify({ someField: 'noMsgId' }), accId)).toBeNull()
    expect(parseDwsEventLine(JSON.stringify({ msgId: 'm-1' }), accId)).toBeNull()

    // Non-JSON line and primitive JSON
    expect(parseDwsEventLine('123', accId)).toBeNull()
    expect(parseDwsEventLine('"plain_string"', accId)).toBeNull()
    expect(parseDwsEventLine('null', accId)).toBeNull()

    // Explicit single conversation kind parsing
    const singleEventLine = JSON.stringify({
      msgId: 'msg-single-2',
      openConversationId: 'cid-single-2',
      event_type: 'chat.single',
      text: 'single chat text',
      timestamp: '2026-09-10T12:00:00Z',
    })
    const singleParsed = parseDwsEventLine(singleEventLine, accId)
    expect(singleParsed?.scope.conversationKind).toBe('direct')
    expect(singleParsed?.receivedAt).toBe('2026-09-10T12:00:00Z')

    // Object content extraction
    expect(extractTextContent({ text: 'text-in-object' })).toBe('text-in-object')
    expect(extractTextContent({ content: 'content-in-object' })).toBe('content-in-object')
    expect(extractTextContent({ neitherTextNorContent: 123 })).toBe('{"neitherTextNorContent":123}')
    expect(extractTextContent('')).toBe('')
    expect(extractTextContent(null)).toBe('')
    expect(extractTextContent(undefined)).toBe('')

    // Unknown sender classification
    const unknownRes = classifySender({
      isSelf: true,
      clientSource: 'unrecognized_client' as unknown as 'native_app',
      aiTag: false,
    })
    expect(unknownRes.classification).toBe('unknown')
  })
})
