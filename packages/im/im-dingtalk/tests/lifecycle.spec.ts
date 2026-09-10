/**
 * Lifecycle, auto-reconnect, and error handling tests for DingTalk DWS adapter.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type { ReceiveInboundResult } from '@deepseek-ai/dsh-im-core/delivery'
import { DingTalkDwsAdapterServiceImpl } from '../src/service.ts'
import { Readable, Writable } from 'node:stream'

describe('DingTalk DWS Adapter Defensive Lifecycle and Error Handling', () => {
  const accId = brandString<ImAccountId>('acc-dt-lifecycle')

  it('terminates active child subprocesses upon context disposal and awaits quiescence', async () => {
    const ctx = new Context()
    let isTerminated = false
    let isWaitCalled = false

    const mockHandle: SubprocessHandle = {
      spec: { argv: ['dws'], cwd: '.', graceMs: 5000, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' } },
      stdin: new Writable({ write(_c, _e, cb) { cb() } }),
      stdout: new Readable({ read() { this.push(null) } }),
      stderr: new Readable({ read() { this.push(null) } }),
      terminate: vi.fn(() => { isTerminated = true }),
      waitForExit: vi.fn(async () => {
        isWaitCalled = true
        return true
      }),
      done: new Promise(() => {}), // keeps running
    }

    ctx.subprocess = {
      spawn: vi.fn(() => mockHandle),
    } as unknown as typeof ctx.subprocess

    ctx.imConfig = {
      getAccount: vi.fn(async () => ({ id: accId })),
    } as unknown as typeof ctx.imConfig

    ctx.imDelivery = {
      receiveInbound: vi.fn(async () => ({} as unknown as ReceiveInboundResult)),
    } as unknown as typeof ctx.imDelivery

    const service = new DingTalkDwsAdapterServiceImpl(ctx)
    await service.startConsumer(accId)

    const stateBefore = service.getConsumerState(accId)
    expect(stateBefore.isRunning).toBe(true)

    // Trigger cordis effect disposal
    await ctx.fiber.dispose()

    const stateAfter = service.getConsumerState(accId)
    expect(stateAfter.isRunning).toBe(false)
    expect(isTerminated).toBe(true)
    expect(isWaitCalled).toBe(true)
  })

  it('attempts reconnection when consumer child process exits abnormally', async () => {
    const ctx = new Context()
    let spawnCount = 0
    let exitPromiseResolve: (outcome: SubprocessOutcome) => void

    ctx.subprocess = {
      spawn: vi.fn((spec: SubprocessSpawnSpec) => {
        spawnCount++
        const done = new Promise<SubprocessOutcome>((resolve) => {
          exitPromiseResolve = resolve
        })
        return {
          spec,
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          terminate: vi.fn(),
          waitForExit: vi.fn(async () => true),
          done,
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
      reconnectDelayMs: 20,
      maxReconnectAttempts: 2,
    })

    await service.startConsumer(accId)
    expect(spawnCount).toBe(1)

    // Simulate child crash with exitCode 1
    exitPromiseResolve!({ status: 'exited', exitCode: 1 })

    // Wait for reconnect delay
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(spawnCount).toBe(2)

    await service.stopConsumer(accId)
  })

  it('cancels pending reconnect timer and does not spawn new process if stopped or disposed', async () => {
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
      reconnectDelayMs: 50,
      maxReconnectAttempts: 3,
    })

    await service.startConsumer(accId)
    expect(spawnCount).toBe(1)

    // Crash: triggers reconnect timer scheduled for 50ms later
    exitPromiseResolve!({ status: 'exited', exitCode: 1 })

    // Within the delay window, explicitly stop consumer
    await new Promise(resolve => setTimeout(resolve, 10))
    await service.stopConsumer(accId)

    // Wait past the 50ms window: no new spawn should occur
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(spawnCount).toBe(1)
  })

  it('stops reconnecting when maxReconnectAttempts is reached', async () => {
    const ctx = new Context()
    let spawnCount = 0
    let lastExitResolve: (outcome: SubprocessOutcome) => void

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
            lastExitResolve = resolve
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
      reconnectDelayMs: 10,
      maxReconnectAttempts: 1,
    })

    await service.startConsumer(accId)
    expect(spawnCount).toBe(1)

    // Crash 1 -> should reconnect (attempt 1)
    lastExitResolve!({ status: 'exited', exitCode: 1 })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(spawnCount).toBe(2)

    // Crash 2 -> reached limit (attempt 2 > max 1), should not reconnect
    lastExitResolve!({ status: 'exited', exitCode: 1 })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(spawnCount).toBe(2)

    const state = service.getConsumerState(accId)
    expect(state.isRunning).toBe(false)
  })
})
