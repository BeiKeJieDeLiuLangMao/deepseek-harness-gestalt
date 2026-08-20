/** Browser registration and Remote transport adapter for the Session Schedule board. */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as applyJobs, inject as jobsInject } from '@deepseek-ai/dsh-client-ui-jobs/client'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { ScheduleActions } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { apply as nodeApply } from '../src/index.ts'

const sessionId = 'session-1' as SessionId
const scheduleId = 'schedule-1' as ScheduleId

async function bench() {
  const ctx = new Context()
  const calls: Array<{ readonly method: string; readonly args: readonly unknown[] }> = []
  class RemoteService extends Service {
    constructor() { super(ctx, 'remote') }
  }
  new RemoteService()
  const answer = (method: string) => async (...args: unknown[]) => {
    calls.push({ method, args })
    return { ok: true as const, value: undefined }
  }
  ctx.provide('remote.schedules', {
    pause: answer('pause'),
    resume: answer('resume'),
    delete: answer('delete'),
  })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  ctx.provide('sessions', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  const jobsFiber = ctx.plugin({ inject: [...jobsInject], apply: applyJobs })
  await jobsFiber.await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const entry = () => {
    const registered = ctx.slots.entries('conversation.session.header.actions')
      .find(candidate => candidate.options.id === 'schedule-list')
    if (registered === undefined) return undefined
    return {
      ...registered,
      inject: registered.inject as unknown as ((id: SessionId) => ScheduleActions) | undefined,
    }
  }
  const entryIds = () => ctx.slots.entries('conversation.session.header.actions')
    .map(candidate => candidate.options.id)
  return { ctx, calls, entry, entryIds, fiber, jobsFiber }
}

describe('ui-schedule browser plugin', () => {
  it('declares and registers the A-variant entry immediately after background jobs', async () => {
    const b = await bench()
    expect(inject).toEqual(['sessions', 'slots', 'remote', 'remote.schedules', 'locale'])
    expect(b.entryIds()).toEqual(['job-list', 'schedule-list'])
    expect(b.entry()?.options).toMatchObject({ id: 'schedule-list', order: 30 })
    expect(b.entry()?.locale).toBe(NS)
    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
    expect(b.entryIds()).toEqual(['job-list'])
  })

  it('forwards the Session and Schedule identities through the mounted Remote namespace', async () => {
    const b = await bench()
    const actions = b.entry()?.inject?.(sessionId)
    if (actions === undefined) throw new Error('Schedule entry has no injected actions')
    await actions.onPause(scheduleId)
    await actions.onResume(scheduleId)
    await actions.onDelete(scheduleId)
    expect(b.calls).toEqual([
      { method: 'pause', args: [sessionId, scheduleId] },
      { method: 'resume', args: [sessionId, scheduleId] },
      { method: 'delete', args: [sessionId, scheduleId] },
    ])
  })

  it('registers complete bilingual dictionaries and releases them with the fiber', async () => {
    const b = await bench()
    b.ctx.locale.setLocale('zh')
    const translate = b.ctx.locale.bind(NS)
    expect(translate('list.title')).toBe(zh['list.title'])
    b.ctx.locale.setLocale('en')
    expect(translate('list.title')).toBe(en['list.title'])
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    await b.fiber.dispose()
    expect(translate('list.title')).not.toBe(en['list.title'])
  })
})

describe('ui-schedule node half', () => {
  it('contributes no Host behavior', () => {
    expect(nodeApply).not.toThrow()
  })
})
