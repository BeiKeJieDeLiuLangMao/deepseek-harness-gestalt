import { describe, expect, it, vi } from 'vitest'
import { DesktopShutdown, disposeDesktopOwners, disposeDesktopPresence, settleDesktopCleanup } from '../src/shutdown.ts'

function deferred(): { promise: Promise<void>; resolve(): void; reject(error: unknown): void } {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function nextTask(): Promise<void> {
  await new Promise<void>((resolve) => { setImmediate(resolve) })
}

describe('DesktopShutdown', () => {
  it('publishes success once after independently held Host and cleanup branches, before exit', async () => {
    const host = deferred()
    const cleanup = deferred()
    const events: string[] = []
    const successReceipt = vi.fn(async () => { events.push('receipt') })
    const exit = vi.fn((code: number) => { events.push(`exit:${String(code)}`) })
    const owner = new DesktopShutdown({
      stopHost: async () => { await host.promise; events.push('host') },
      cleanup: async () => { await cleanup.promise; events.push('cleanup') },
      successReceipt,
      exit,
      reportError: vi.fn(),
    })

    const task = owner.request(7, 'exit')
    cleanup.resolve()
    await nextTask()
    expect(events).toEqual(['cleanup'])
    host.resolve()
    await task

    expect(events).toEqual(['cleanup', 'host', 'receipt', 'exit:7'])
    expect(successReceipt).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(7)
  })

  for (const failed of ['host', 'cleanup', 'both'] as const) {
    it(`joins both branches and emits no receipt when ${failed} cleanup fails`, async () => {
      const host = deferred()
      const cleanup = deferred()
      const events: string[] = []
      const successReceipt = vi.fn()
      const reportError = vi.fn((error: unknown) => { events.push('report'); expect(error).toBeInstanceOf(AggregateError) })
      const exit = vi.fn((code: number) => { events.push(`exit:${String(code)}`) })
      const owner = new DesktopShutdown({
        stopHost: async () => {
          await host.promise
          events.push('host')
          if (failed === 'host' || failed === 'both') throw new Error('Host failed')
        },
        cleanup: async () => {
          await cleanup.promise
          events.push('cleanup')
          if (failed === 'cleanup' || failed === 'both') throw new Error('cleanup failed')
        },
        successReceipt,
        exit,
        reportError,
      })

      const task = owner.request(9, 'exit')
      host.resolve()
      await nextTask()
      expect(events).toEqual(['host'])
      expect(reportError).not.toHaveBeenCalled()
      cleanup.resolve()
      await task

      expect(events).toEqual(['host', 'cleanup', 'report', 'exit:1'])
      expect(successReceipt).not.toHaveBeenCalled()
      expect(reportError).toHaveBeenCalledOnce()
      expect(exit).toHaveBeenCalledExactlyOnceWith(1)
      const aggregate = reportError.mock.calls[0]?.[0]
      if (!(aggregate instanceof AggregateError)) throw new Error('expected aggregate cleanup failure')
      expect(aggregate.errors).toHaveLength(failed === 'both' ? 2 : 1)
    })
  }

  for (const receiptKind of ['synchronous', 'asynchronous'] as const) {
    it(`reports ${receiptKind} success receipt failure and exits 1`, async () => {
      const receiptFailure = new Error('receipt failed')
      const exit = vi.fn()
      const reportError = vi.fn()
      const successReceipt = receiptKind === 'synchronous'
        ? () => { throw receiptFailure }
        : async () => { throw receiptFailure }
      const owner = new DesktopShutdown({
        stopHost: async () => {},
        cleanup: async () => {},
        successReceipt,
        exit,
        reportError,
      })

      await owner.request(7, 'exit')

      expect(reportError).toHaveBeenCalledExactlyOnceWith(receiptFailure)
      expect(exit).toHaveBeenCalledExactlyOnceWith(1)
      expect(exit).not.toHaveBeenCalledWith(7)
    })
  }

  it('contains reporter failure without suppressing failure exit', async () => {
    const exit = vi.fn()
    const owner = new DesktopShutdown({
      stopHost: async () => {},
      cleanup: async () => { throw new Error('cleanup failed') },
      successReceipt: vi.fn(),
      reportError: () => { throw new Error('reporter failed') },
      exit,
    })

    await expect(owner.request(7, 'exit')).resolves.toBeUndefined()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('leaves a successful exit-adapter throw as the request rejection', async () => {
    const exitFailure = new Error('exit failed')
    const successReceipt = vi.fn()
    const reportError = vi.fn()
    const exit = vi.fn(() => { throw exitFailure })
    const owner = new DesktopShutdown({
      stopHost: async () => {}, cleanup: async () => {}, successReceipt, exit, reportError,
    })

    await expect(owner.request(7, 'exit')).rejects.toBe(exitFailure)
    expect(successReceipt).toHaveBeenCalledOnce()
    expect(reportError).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledExactlyOnceWith(7)
  })

  for (const failure of ['none', 'cleanup', 'receipt'] as const) {
    it(`allow-quit publishes or reports ${failure} without explicit exit`, async () => {
      const exit = vi.fn()
      const reportError = vi.fn()
      const successReceipt = vi.fn(async () => {
        if (failure === 'receipt') throw new Error('receipt failed')
      })
      const owner = new DesktopShutdown({
        stopHost: async () => {},
        cleanup: async () => { if (failure === 'cleanup') throw new Error('cleanup failed') },
        successReceipt,
        exit,
        reportError,
      })

      await owner.request(7, 'allow-quit')

      expect(successReceipt).toHaveBeenCalledTimes(failure === 'cleanup' ? 0 : 1)
      expect(reportError).toHaveBeenCalledTimes(failure === 'none' ? 0 : 1)
      expect(exit).not.toHaveBeenCalled()
    })
  }

  it('preserves the first mode and code through reentry with one receipt', async () => {
    const gate = deferred()
    const successReceipt = vi.fn()
    const exit = vi.fn()
    let reentry: Promise<void> | undefined
    const owner = new DesktopShutdown({
      stopHost: () => { reentry = owner.request(99, 'allow-quit'); return gate.promise },
      cleanup: async () => {},
      successReceipt,
      exit,
      reportError: vi.fn(),
    })

    const task = owner.request(7, 'exit')
    expect(reentry).toBe(task)
    expect(owner.request(88, 'allow-quit')).toBe(task)
    gate.resolve()
    await task

    expect(successReceipt).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('observes synchronous Host and owner failures without skipping other cleanup', async () => {
    const attempted = vi.fn()
    const successReceipt = vi.fn()
    const exit = vi.fn()
    const reportError = vi.fn()
    const owner = new DesktopShutdown({
      stopHost: () => { throw new Error('Host stop failed') },
      cleanup: () => settleDesktopCleanup([
        () => { throw new Error('Account failed') },
        async () => { throw new Error('Pairing failed') },
        () => { attempted() },
      ]),
      successReceipt,
      exit,
      reportError,
    })

    await owner.request(0, 'exit')

    expect(attempted).toHaveBeenCalledOnce()
    expect(successReceipt).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })
})

describe('disposeDesktopPresence', () => {
  it('accepts absent presence and joins successful close before disposal', async () => {
    await disposeDesktopPresence(undefined)
    const order: string[] = []
    await disposeDesktopPresence({
      closeWindow: async () => { order.push('close') }, dispose: async () => { order.push('dispose') },
    })
    expect(order).toEqual(['close', 'dispose'])
  })

  it('attempts disposal after synchronous close failure and aggregates both errors', async () => {
    const dispose = vi.fn(async () => { throw new Error('dispose failed') })
    await expect(disposeDesktopPresence({
      closeWindow: () => { throw new Error('close failed') }, dispose,
    })).rejects.toMatchObject({ errors: [
      expect.objectContaining({ message: 'close failed' }), expect.objectContaining({ message: 'dispose failed' }),
    ] })
    expect(dispose).toHaveBeenCalledOnce()
  })
})

describe('disposeDesktopOwners', () => {
  it('awaits both owners and aggregates every shutdown failure', async () => {
    const account = { dispose: vi.fn(async () => { throw new Error('account disposal failed') }) }
    const pairing = { dispose: vi.fn(async () => { throw new Error('pairing disposal failed') }) }

    await expect(disposeDesktopOwners(account, pairing)).rejects.toMatchObject({
      errors: [
        expect.objectContaining({ message: 'account disposal failed' }),
        expect.objectContaining({ message: 'pairing disposal failed' }),
      ],
    })
    expect(account.dispose).toHaveBeenCalledOnce()
    expect(pairing.dispose).toHaveBeenCalledOnce()
  })
})
