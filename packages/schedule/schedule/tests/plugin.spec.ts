import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { CallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, SessionPreparation } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import * as scheduleDomain from '../src/domain.ts'
import ScheduleService, { ScheduleId } from '../src/index.ts'

class PersistenceProbe extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sessionPersistence')
  }
}

async function harness(): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(PersistenceProbe)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.on('session/flush', () => {})
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('Schedule plugin composition', () => {
  it('exports one Loader-safe Remote Service', () => {
    expect(ScheduleService.inject).toEqual(['agents', 'sessions', 'tools', 'sessionPersistence'])
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports({ default: ScheduleService })).toBe(ScheduleService)
  })

  it('installs only on future root agents and unwinds on plugin disposal', async () => {
    const ctx = await harness()
    const existing = await ctx.agents.create({ sessionId: SessionId('schedule-existing') })
    const plugin = await ctx.plugin(ScheduleService)
    expect(ctx.tools.get('schedule_create', existing.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_create')).toBeUndefined()

    const root = await ctx.agents.create({ sessionId: SessionId('schedule-root') })
    expect(ctx.tools.get('schedule_create', root.agent)?.name).toBe('schedule_create')
    expect(ctx.tools.get('schedule_list', root.agent)?.name).toBe('schedule_list')
    expect(ctx.tools.get('schedule_delete', root.agent)?.name).toBe('schedule_delete')
    expect(ctx.tools.get('schedule_create')).toBeUndefined()

    const created = await ctx.agents.withInitiator(root.agent, () => ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('schedule-plugin-create'),
      name: 'schedule_create',
      arguments: { prompt: 'future reminder', after_seconds: 3_600 },
      agent: root.agent,
    }))
    expect(created.isError).toBe(false)
    if (created.isError) throw new Error('expected Schedule create value')
    expect(created.value).toMatchObject({ id: 'schedule-1', deliveryMode: 'session-local' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'running' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })

    const child = await root.agent.ctx.agents.create({ sessionId: SessionId('schedule-child') })
    expect(ctx.agents.roots()).toEqual([existing.agent, root.agent])
    expect(ctx.tools.get('schedule_create', child.agent)).toBeUndefined()

    const departing = await ctx.agents.create({ sessionId: SessionId('schedule-departing') })
    expect(ctx.tools.get('schedule_create', departing.agent)).toBeDefined()
    await departing.dispose()
    expect(ctx.tools.get('schedule_create', departing.agent)).toBeUndefined()

    await plugin.dispose()
    expect(ctx.tools.get('schedule_create', root.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_list', root.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_delete', root.agent)).toBeUndefined()

    await child.dispose()
    await root.dispose()
    await existing.dispose()
    await ctx.fiber.dispose()
  })

  it('mutates pause, resume, and delete through the Host service and publishes the projection', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const root = await ctx.agents.create({ sessionId: SessionId('schedule-remote') })
    root.agent.session.append('schedule/change', {
      version: 1,
      operation: 'create',
      schedule: {
        id: ScheduleId('schedule-1'),
        kind: 'after',
        prompt: 'check logs',
        afterSeconds: 3_600,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })

    expect(remoteMethods(ctx.schedules).map(method => method.exportName ?? method.method))
      .toEqual(['pause', 'resume', 'delete'])
    await ctx.schedules.pause(root.agent.id, ScheduleId('schedule-1'))
    expect(ctx.sessionProjections.snapshot(root.agent.session).values.schedules)
      .toEqual([expect.objectContaining({ id: 'schedule-1', paused: true })])
    await ctx.schedules.resume(root.agent.id, ScheduleId('schedule-1'))
    expect(ctx.sessionProjections.snapshot(root.agent.session).values.schedules)
      .toEqual([expect.objectContaining({ id: 'schedule-1', paused: false })])
    await ctx.schedules.delete(root.agent.id, ScheduleId('schedule-1'))
    expect(ctx.sessionProjections.snapshot(root.agent.session).values.schedules).toEqual([])

    await plugin.dispose()
    expect('schedules' in ctx.sessionProjections.snapshot(root.agent.session).values).toBe(false)
    await root.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects Host mutations that are missing, stale, child-owned, or corrupt', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const root = await ctx.agents.create({ sessionId: SessionId('schedule-mutation-errors') })
    root.agent.session.append('schedule/change', {
      version: 1,
      operation: 'create',
      schedule: {
        id: ScheduleId('schedule-1'),
        kind: 'after',
        prompt: 'check logs',
        afterSeconds: 3_600,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })

    await expect(ctx.schedules.pause(root.agent.id, ScheduleId('')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'schedule_not_found' })
    await expect(ctx.schedules.delete(root.agent.id, ScheduleId(' schedule-1')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'schedule_not_found' })
    await expect(ctx.schedules.pause(root.agent.id, ScheduleId('missing')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'schedule_not_found' })
    await expect(ctx.schedules.delete(root.agent.id, ScheduleId('missing')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'schedule_not_found' })
    await expect(ctx.schedules.resume(root.agent.id, ScheduleId('schedule-1')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'invalid_transition' })
    await ctx.schedules.pause(root.agent.id, ScheduleId('schedule-1'))
    await expect(ctx.schedules.pause(root.agent.id, ScheduleId('schedule-1')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'invalid_transition' })

    const child = await root.agent.ctx.agents.create({ sessionId: SessionId('schedule-mutation-child') })
    await expect(ctx.schedules.pause(child.agent.id, ScheduleId('schedule-1')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'schedule_not_found' })

    const unexpected = await ctx.agents.create({ sessionId: SessionId('schedule-mutation-unexpected') })
    unexpected.agent.session.append('schedule/change', {
      version: 1,
      operation: 'create',
      schedule: {
        id: ScheduleId('schedule-1'),
        kind: 'after',
        prompt: 'unexpected',
        afterSeconds: 3_600,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })
    const corrupt = vi.spyOn(scheduleDomain, 'foldScheduleEvents').mockImplementation(() => {
      throw new scheduleDomain.ScheduleLogError('schedule delete targets inactive id')
    })
    await expect(ctx.schedules.pause(unexpected.agent.id, ScheduleId('schedule-1')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'corrupt_schedule_log' })
    corrupt.mockRestore()

    const spy = vi.spyOn(scheduleDomain, 'foldScheduleEvents').mockImplementation(() => {
      throw new TypeError('fold exploded')
    })
    await expect(ctx.schedules.pause(unexpected.agent.id, ScheduleId('schedule-1')))
      .rejects.toThrow('fold exploded')
    spy.mockRestore()

    await child.dispose()
    await unexpected.dispose()
    await plugin.dispose()
    await root.dispose()
    await ctx.fiber.dispose()
  })

  it('deletes a cold retained reminder and reports a missing unpublished id', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const missingId = SessionId('schedule-cold-delete-missing')
    const retainedId = SessionId('schedule-cold-delete-retained')
    ctx.sessionPersistence.prepare = vi.fn(async (sessionId: SessionId) => {
      const prepared = ctx.sessions.prepare(sessionId, {
        meta: { cwd: '/tmp' },
        ...sessionId === retainedId
          ? {
            seed: [{
              type: 'schedule/change', seq: 0, time: 1,
              data: {
                version: 1,
                operation: 'create',
                schedule: {
                  id: ScheduleId('schedule-1'), kind: 'after', prompt: 'cold delete', afterSeconds: 3_600,
                  scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
                },
              },
            }],
          }
          : {},
      })
      return SessionPreparation.create(prepared)
    })

    await expect(ctx.schedules.delete(missingId, ScheduleId('schedule-1')))
      .rejects.toMatchObject({ name: 'ScheduleMutationError', code: 'schedule_not_found' })
    await expect(ctx.schedules.delete(retainedId, ScheduleId('schedule-1')))
      .resolves.toEqual({ id: 'schedule-1', deleted: true })

    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('propagates a cold preparation failure when no live root exists', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    ctx.sessionPersistence.prepare = vi.fn(async () => {
      throw new Error('artifact missing')
    })

    await expect(ctx.schedules.delete(SessionId('schedule-missing-artifact'), ScheduleId('schedule-1')))
      .rejects.toThrow('artifact missing')

    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('deletes through the live root when Session entry loses the publication race', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const sessionId = SessionId('schedule-delete-enter-race')
    const unused = ctx.sessions.prepare(SessionId('schedule-delete-enter-unused'), { meta: { cwd: '/tmp' } })
    let raced: Awaited<ReturnType<typeof ctx.agents.create>> | undefined
    const enter = ctx.sessions.enter.bind(ctx.sessions)
    ctx.sessions.enter = vi.fn((session: Session) => {
      if (session.id === unused.id) throw new Error('already attached to a store')
      return enter(session)
    })
    ctx.sessionPersistence.prepare = vi.fn(async () => {
      raced = await ctx.agents.create({ sessionId })
      raced.agent.session.append('schedule/change', {
        version: 1,
        operation: 'create',
        schedule: {
          id: ScheduleId('schedule-1'),
          kind: 'after',
          prompt: 'raced delete',
          afterSeconds: 3_600,
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      })
      return SessionPreparation.create(unused)
    })

    await expect(ctx.schedules.delete(sessionId, ScheduleId('schedule-1')))
      .resolves.toEqual({ id: 'schedule-1', deleted: true })
    expect(raced).toBeDefined()
    expect(raced?.agent.session.events.filter(event =>
      event.type === 'schedule/change' && event.data.operation === 'delete')).toHaveLength(1)
    expect(raced?.agent.session.events.filter(event => event.type === 'schedule/change'
      && event.data.operation === 'delete')[0]?.data).toEqual({
      version: 1,
      operation: 'delete',
      id: 'schedule-1',
    })

    await plugin.dispose()
    await raced?.dispose()
    await ctx.fiber.dispose()
  })

  it('recomputes an already-live root when Agent publication wins the cold preparation race', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const sessionId = SessionId('schedule-prepare-race')
    let raced: Awaited<ReturnType<typeof ctx.agents.create>> | undefined
    const prepare = vi.fn(async () => {
      raced = await ctx.agents.create({ sessionId })
      raced.agent.session.append('schedule/change', {
        version: 1,
        operation: 'create',
        schedule: {
          id: ScheduleId('schedule-1'),
          kind: 'after',
          prompt: 'race reminder',
          afterSeconds: 3_600,
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      })
      throw new Error('cannot prepare while the Session is live')
    })
    ctx.sessionPersistence.prepare = prepare

    await expect(ctx.schedules.pause(sessionId, ScheduleId('schedule-1')))
      .resolves.toMatchObject({ id: 'schedule-1', state: 'paused' })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(ctx.agents.roots()).toEqual([raced?.agent])
    expect(raced?.agent.session.events.filter(event =>
      event.type === 'schedule/change' && event.data.operation === 'pause')).toHaveLength(1)

    await plugin.dispose()
    await raced?.dispose()
    await ctx.fiber.dispose()
  })

  it('recomputes the live root when publication wins after preparation', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const sessionId = SessionId('schedule-enter-race')
    const prepared = ctx.sessions.prepare(sessionId, { meta: { cwd: '/tmp' } })
    const raced = await ctx.agents.create({
      sessionId,
      seed: [{
        type: 'schedule/change', seq: 0, time: Date.now(),
        data: {
          version: 1,
          operation: 'create',
          schedule: {
            id: ScheduleId('schedule-1'), kind: 'after', prompt: 'raced', afterSeconds: 3_600,
            scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        },
      }],
    })
    const get = ctx.agents.get.bind(ctx.agents)
    let reads = 0
    ctx.agents.get = vi.fn((id: SessionId) => {
      reads += 1
      return reads === 1 && id === sessionId ? undefined : get(id)
    })
    ctx.sessionPersistence.prepare = vi.fn(async () => SessionPreparation.create(prepared))

    await expect(ctx.schedules.pause(sessionId, ScheduleId('schedule-1')))
      .resolves.toMatchObject({ id: 'schedule-1', state: 'paused' })
    expect(raced.agent.session.events.filter(event =>
      event.type === 'schedule/change' && event.data.operation === 'pause')).toHaveLength(1)

    await plugin.dispose()
    await raced.dispose()
    await ctx.fiber.dispose()
  })

  it('propagates an entry failure when no live root owns the Session', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const other = new Context()
    await other.plugin(SessionStore)
    const sessionId = SessionId('schedule-enter-failure')
    const prepared = other.sessions.prepare(sessionId, { meta: { cwd: '/tmp' } })
    const detach = other.sessions.enter(prepared)
    ctx.sessionPersistence.prepare = vi.fn(async () => SessionPreparation.create(prepared))

    await expect(ctx.schedules.pause(sessionId, ScheduleId('schedule-1')))
      .rejects.toThrow(/already attached to a store/)

    detach()
    await plugin.dispose()
    await other.fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('flushes an unpublished preparation before reading its fold', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const sessionId = SessionId('schedule-cold-preflight')
    const prepared = ctx.sessions.prepare(sessionId, { meta: { cwd: '/tmp' } })
    ctx.sessionPersistence.prepare = vi.fn(async () => SessionPreparation.create(prepared))
    const lifecycle: string[] = []
    ctx.on('session/created', () => { lifecycle.push('created') })
    ctx.on('session/disposed', () => { lifecycle.push('disposed') })
    let flushes = 0
    ctx.on('session/flush', (session) => {
      if (session.id !== sessionId) return
      flushes += 1
      if (flushes === 1) {
        session.append('schedule/change', {
          version: 1,
          operation: 'create',
          schedule: {
            id: ScheduleId('schedule-1'), kind: 'after', prompt: 'preflight', afterSeconds: 3_600,
            scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        })
      }
    })

    await expect(ctx.schedules.pause(sessionId, ScheduleId('schedule-1')))
      .resolves.toMatchObject({ id: 'schedule-1', state: 'paused' })
    expect(flushes).toBe(2)
    expect(lifecycle).toEqual([])
    expect(ctx.sessions.get(sessionId)).toBeUndefined()

    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('closes transaction admission before waiting for plugin teardown', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const schedules = ctx.schedules
    const sessionId = SessionId('schedule-teardown-admission')
    const prepared = ctx.sessions.prepare(sessionId, {
      meta: { cwd: '/tmp' },
      seed: [{
        type: 'schedule/change', seq: 0, time: 1,
        data: {
          version: 1,
          operation: 'create',
          schedule: {
            id: ScheduleId('schedule-1'), kind: 'after', prompt: 'teardown', afterSeconds: 3_600,
            scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        },
      }],
    })
    ctx.sessionPersistence.prepare = vi.fn(async () => SessionPreparation.create(prepared))
    let release: (() => void) | undefined
    const stopFlush = ctx.on('session/flush', async (session) => {
      if (session.id !== sessionId || release !== undefined) return
      await new Promise<void>((resolve) => { release = resolve })
    })
    const pausing = schedules.pause(sessionId, ScheduleId('schedule-1'))
    await vi.waitFor(() => { expect(release).toBeDefined() })
    let disposed = false
    const disposing = plugin.dispose().then(() => { disposed = true })

    await Promise.resolve()
    expect(disposed).toBe(false)
    await expect(schedules.resume(sessionId, ScheduleId('schedule-1')))
      .rejects.toThrow('Schedule transactions are stopping')
    if (release === undefined) throw new Error('missing persistence release')
    release()
    await expect(pausing).resolves.toMatchObject({ id: 'schedule-1', state: 'paused' })
    await disposing
    expect(disposed).toBe(true)

    stopFlush()
    await ctx.fiber.dispose()
  })

  it('reports uncertainty when a cold mutation cannot complete its persistence barrier', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const sessionId = SessionId('schedule-cold-uncertain')
    const prepared = ctx.sessions.prepare(sessionId, {
      meta: { cwd: '/tmp' },
      seed: [{
        type: 'schedule/change',
        seq: 0,
        time: 1,
        data: {
          version: 1,
          operation: 'create',
          schedule: {
            id: ScheduleId('schedule-1'),
            kind: 'after',
            prompt: 'uncertain reminder',
            afterSeconds: 3_600,
            scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        },
      }],
    })
    ctx.sessionPersistence.prepare = vi.fn(async () => SessionPreparation.create(prepared))
    const stopFailure = ctx.on('session/flush', (session) => {
      if (session.id === sessionId && session.events.some(event =>
        event.type === 'schedule/change' && event.data.operation === 'pause')) {
        throw new Error('disk uncertain')
      }
    })

    await expect(ctx.schedules.pause(sessionId, ScheduleId('schedule-1')))
      .rejects.toMatchObject({ name: 'SchedulePersistenceError' })
    expect(ctx.agents.get(sessionId)).toBeUndefined()
    expect(ctx.sessions.get(sessionId)).toBeUndefined()

    stopFailure()
    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('does not checkpoint unrelated idle sessions', async () => {
    const ctx = await harness()
    const plugin = await ctx.plugin(ScheduleService)
    const root = await ctx.agents.create({ sessionId: SessionId('schedule-unrelated-idle') })
    await settle()
    let flushes = 0
    const stopFlush = ctx.on('session/flush', (session) => {
      if (session === root.agent.session) flushes += 1
    })

    agentEvents(ctx, root.agent).emit('agent/status', { status: 'running' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(flushes).toBe(0)

    stopFlush()
    await root.dispose()
    await plugin.dispose()
    await ctx.fiber.dispose()
  })
})
