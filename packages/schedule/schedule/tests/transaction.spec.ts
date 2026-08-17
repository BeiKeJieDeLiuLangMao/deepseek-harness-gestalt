import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ScheduleTransactions } from '../src/transaction.ts'

describe('Schedule transaction ownership', () => {
  it('isolates equal Session ids across owners and quiesces before disposal', async () => {
    const first = new ScheduleTransactions()
    const second = new ScheduleTransactions()
    const sessionId = SessionId('shared-id')
    let release: (() => void) | undefined
    const blocked = first.run(sessionId, async () => {
      await new Promise<void>((resolve) => { release = resolve })
    })

    await expect(second.run(sessionId, async () => 'independent')).resolves.toBe('independent')
    let disposed = false
    const disposing = first.dispose().then(() => { disposed = true })
    await Promise.resolve()
    expect(disposed).toBe(false)
    await expect(first.run(sessionId, async () => undefined)).rejects.toThrow('stopping')

    if (release === undefined) throw new Error('missing blocked transaction release')
    release()
    await blocked
    await disposing
    expect(disposed).toBe(true)
  })
})
