/**
 * Strict counter-example tests requested by review:
 * 1. consumer异常退出后进入reconnectDelay倒计时 → 立即dispose → 定时器被取消，绝不再spawn
 * 2. stdin/terminate失败不吞为false quiescence：当child.waitForExit返回false时，stopConsumer向调用者显式报错，而非盲目假装静默成功
 * 3. receiveInbound发生严重拒绝(reject)时：错误被logger警告记录，consumer状态记录lastError并终止运行
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type { ReceiveInboundResult } from '@deepseek-ai/dsh-im-core/delivery'
import { DingTalkDwsAdapterServiceImpl } from '../src/service.ts'
import { Readable, Writable } from 'node:stream'

describe('DingTalk DWS Adapter Counter-Example Defenses', () => {
  const accId = brandString<ImAccountId>('acc-dt-counter')

  it('counter-example 1: consumer abnormal exit -> scheduled reconnect -> immediate dispose -> no new spawn', async () => {
    const ctx = new Context()
    let spawnCount = 0
    let exitPromiseResolve: (outcome: SubprocessOutcome) => void

    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        spawnCount++
        return {
          spec,
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          terminate: vi.fn(),
          waitForExit: vi.fn(async () => true),
          done: new Promise<SubprocessOutcome>((resolve) => {
            exitPromiseResolve = resolve
          }),
        } as unknown as SubprocessHandle
      }),
    } as unknown as typeof ctx.subprocess

    ctx.imConfig = {
      getAccount: vi.fn(async () => ({ id: accId })),
    } as unknown as typeof ctx.imConfig

    ctx.imDelivery = {
      receiveInbound: vi.fn(async () => ({} as unknown as ReceiveInboundResult)),
    } as unknown as typeof ctx.imDelivery

    const service = new DingTalkDwsAdapterServiceImpl(ctx, {
      reconnectDelayMs: 60,
      maxReconnectAttempts: 5,
    })

    await service.startConsumer(accId)
    expect(spawnCount).toBe(1)

    // 1. Consumer exits abnormally: schedules reconnectTimer for 60ms later
    exitPromiseResolve!({ status: 'exited', exitCode: 1 })

    // 2. Allow event-loop tick so handle.done callback runs and arms reconnectTimer
    await new Promise(res => setTimeout(res, 10))

    // 3. Immediately dispose context while reconnectTimer is actively pending
    await ctx.fiber.dispose()

    // 4. Wait well past the 60ms reconnect window
    await new Promise(res => setTimeout(res, 100))

    // 5. Assert that no second spawn ever occurred
    expect(spawnCount).toBe(1)
    expect(service.getConsumerState(accId).isRunning).toBe(false)
  })

  it('counter-example 2: teardown rejects when child process fails to exit (no false quiescence)', async () => {
    const ctx = new Context()

    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        return {
          spec,
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          terminate: vi.fn(),
          // Process stubbornly does not exit within grace period
          waitForExit: vi.fn(async () => false),
          done: new Promise<SubprocessOutcome>(() => {}),
        } as unknown as SubprocessHandle
      }),
    } as unknown as typeof ctx.subprocess

    ctx.imConfig = {
      getAccount: vi.fn(async () => ({ id: accId })),
    } as unknown as typeof ctx.imConfig

    ctx.imDelivery = {
      receiveInbound: vi.fn(async () => ({} as unknown as ReceiveInboundResult)),
    } as unknown as typeof ctx.imDelivery

    const service = new DingTalkDwsAdapterServiceImpl(ctx)
    await service.startConsumer(accId)

    // Stopping or disposing must throw or report unquenched child rather than falsely claiming success
    await expect(service.stopConsumer(accId)).rejects.toThrow('failed to terminate')
  })

  it('counter-example 3: receiveInbound reject logs warning, records lastError on consumer, and terminates consumer', async () => {
    const ctx = new Context()
    let stdoutStream: Readable

    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        stdoutStream = new Readable({
          read() {
            this.push(JSON.stringify({
              msgId: 'msg-err-1',
              openConversationId: 'cid-1',
              text: 'trigger fatal storage error',
            }) + '\n')
            this.push(null)
          },
        })
        return {
          spec,
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: stdoutStream,
          stderr: new Readable({ read() { this.push(null) } }),
          terminate: vi.fn(),
          waitForExit: vi.fn(async () => true),
          done: new Promise<SubprocessOutcome>(() => {}),
        } as unknown as SubprocessHandle
      }),
    } as unknown as typeof ctx.subprocess

    ctx.imConfig = {
      getAccount: vi.fn(async () => ({ id: accId })),
    } as unknown as typeof ctx.imConfig

    // Delivery fails fatally (e.g. database unrecoverable / corrupted disk)
    ctx.imDelivery = {
      receiveInbound: vi.fn(async () => {
        throw new Error('Durable database storage write rejected: disk quota exceeded')
      }),
    } as unknown as typeof ctx.imDelivery

    const warnedMessages: string[] = []
    const warnSpy = vi.fn((msg: string) => {
      warnedMessages.push(msg)
    })
    ctx.logger = vi.fn(() => ({
      warn: warnSpy,
      info: vi.fn(),
      error: vi.fn(),
    })) as any

    const service = new DingTalkDwsAdapterServiceImpl(ctx)
    await service.startConsumer(accId)

    // Wait a tick for stdout delivery attempt
    await new Promise(res => setTimeout(res, 50))

    const state = service.getConsumerState(accId)
    // 1. Must record the failure in state
    expect(state.lastError).toContain('disk quota exceeded')
    // 2. Consumer must be terminated
    expect(state.isRunning).toBe(false)
    // 3. Warning log must not be lost
    expect(warnSpy).toHaveBeenCalled()
    expect(warnedMessages.some(m => m.includes('disk quota exceeded'))).toBe(true)

    await service.stopConsumer(accId).catch(() => {})
  })
})
