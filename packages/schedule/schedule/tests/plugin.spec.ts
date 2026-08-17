import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionPreparation } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
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
