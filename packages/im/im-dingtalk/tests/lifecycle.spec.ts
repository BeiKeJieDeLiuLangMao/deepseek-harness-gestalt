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
      stdin: new Writable({ write(_c, _e, cb) { cb() } }),
      stdout: new Readable({ read() { this.push(null) } }),
      stderr: new Readable({ read() { this.push(null) } }),
      collected: {},
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
      spawn: vi.fn((_spec: SubprocessSpawnSpec) => {
        spawnCount++
        const done = new Promise<SubprocessOutcome>((resolve) => {
          exitPromiseResolve = resolve
        })
        return {
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          collected: {},
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

    // Simulate child crash with exitCode 1 and stderr message
    exitPromiseResolve!({ exitCode: 1, signal: null })

    // Wait for reconnect delay
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(spawnCount).toBe(2)

    await service.stopConsumer(accId)
  })

  it('records stderr in consumer state upon abnormal exit and rejects startConsumer when disposed', async () => {
    const ctx = new Context()
    let exitPromiseResolve: (outcome: SubprocessOutcome) => void

    ctx.subprocess = {
      spawn: vi.fn((_spec: SubprocessSpawnSpec) => {
        return {
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          collected: {
            stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
            stderr: { readFrom: () => ({ text: 'OAuth token expired or invalid', nextOffset: 30, lossy: false }) },
          },
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
      reconnectDelayMs: 100,
      maxReconnectAttempts: 2,
    })

    await service.startConsumer(accId)

    // Crash with exitCode 2: stderr should populate lastError
    exitPromiseResolve!({ exitCode: 2, signal: null })
    await new Promise(resolve => setTimeout(resolve, 10))

    const state = service.getConsumerState(accId)
    expect(state.lastError).toBe('OAuth token expired or invalid')

    // Dispose context: subsequent startConsumer must immediately reject
    await ctx.fiber.dispose()
    await expect(service.startConsumer(accId)).rejects.toThrow('service is disposed')
  })

  it('cancels pending reconnect timer and does not spawn new process if stopped or disposed', async () => {
    const ctx = new Context()
    let spawnCount = 0
    let exitPromiseResolve: (outcome: SubprocessOutcome) => void

    ctx.subprocess = {
      spawn: vi.fn((_spec: SubprocessSpawnSpec) => {
        spawnCount++
        return {
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          collected: {},
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
    exitPromiseResolve!({ exitCode: 1, signal: null })

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
      spawn: vi.fn((_spec: SubprocessSpawnSpec) => {
        spawnCount++
        return {
          stdin: new Writable({ write(_c, _e, cb) { cb() } }),
          stdout: new Readable({ read() { this.push(null) } }),
          stderr: new Readable({ read() { this.push(null) } }),
          collected: {},
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
    lastExitResolve!({ exitCode: 1, signal: null })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(spawnCount).toBe(2)

    // Crash 2 -> reached limit (attempt 2 > max 1), should not reconnect
    lastExitResolve!({ exitCode: 1, signal: null })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(spawnCount).toBe(2)

    const state = service.getConsumerState(accId)
    expect(state.isRunning).toBe(false)
  })
})
