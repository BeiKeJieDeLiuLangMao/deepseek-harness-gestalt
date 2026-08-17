/**
 * Agent-scoped durable one-shot and fixed-rate reminders over the Session event log.
 * @module @deepseek-ai/dsh-schedule
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { foldScheduleEvents, ScheduleLogError, scheduleView } from './domain.ts'
import { flushSchedulePersistence } from './persistence.ts'
import { scheduleProjectionDefinition } from './projection.ts'
import { ScheduleRuntime } from './runtime.ts'
import { registerScheduleTools } from './tools.ts'
import { runScheduleTransaction } from './transaction.ts'
import type { ScheduleDeleteResult, ScheduleId, ScheduleView } from './types.ts'

export type * from './types.ts'
export {
  SCHEDULE_CHANGE_VERSION,
  MIN_EVERY_INTERVAL_SECONDS,
  ScheduleId,
  ScheduleInputError,
  ScheduleLogError,
  allocateScheduleId,
  createAfterScheduleRecord,
  createAtScheduleRecord,
  createEveryScheduleRecord,
  decodeScheduleChange,
  foldScheduleEvents,
  renderReminderFraming,
  renderEveryReminderBatchFraming,
  resolveEveryOccurrence,
  scheduleView,
} from './domain.ts'
export { registerScheduleTools } from './tools.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    schedules: ScheduleService
  }
}

type OwnerCleanup = () => void | Promise<void>

/** Host-visible failure for a stale or invalid Schedule mutation. */
export class ScheduleMutationError extends Error {
  /** Stable machine-readable failure code. */
  readonly code: 'schedule_not_found' | 'invalid_transition' | 'corrupt_schedule_log'

  /**
   * Construct a mutation failure.
   * @param code - Stable failure discriminator.
   * @param message - Human-readable mutation detail.
   */
  constructor(code: ScheduleMutationError['code'], message: string) {
    super(message)
    this.name = 'ScheduleMutationError'
    this.code = code
  }
}

/** Durable Schedule owner, Remote mutation namespace, and live Agent runtime installer. */
export class ScheduleService extends TypertRemoteService {
  static inject = ['agents', 'sessions', 'tools', 'sessionPersistence']

  private readonly runtimes = new Map<Agent, { readonly cleanup: OwnerCleanup; readonly runtime: ScheduleRuntime }>()
  private stopping = false

  /**
   * Install Schedule as `ctx.schedules` and observe only future root Agents.
   * @param ctx - Global Host context owning Agents, tools, and persistence.
   */
  constructor(ctx: Context) {
    super(ctx, 'schedules')
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register(scheduleProjectionDefinition)
    })

    ctx.effect(() => {
      const stopCreated = ctx.on('agent/created', ({ agent }) => {
        if (this.stopping || this.runtimes.has(agent) || !ctx.agents.roots().includes(agent)) return
        const runtime = new ScheduleRuntime(ctx, agent)
        const cleanup: OwnerCleanup = agent.ctx.effect(() => {
          const disposeTools = registerScheduleTools(ctx, agent.ctx, agent, () => { runtime.requestDrive() })
          const stopStatus = agent.ctx.on('agent/status', ({ status }) => {
            if (status === 'idle' && agent.session.events.some(event => event.type === 'schedule/change')) {
              runtime.requestDrive()
            }
          })
          runtime.start()
          return async () => {
            stopStatus()
            disposeTools()
            try {
              await runtime.dispose()
            } finally {
              if (this.runtimes.get(agent)?.cleanup === cleanup) this.runtimes.delete(agent)
            }
          }
        }, 'schedule.runtime()')
        this.runtimes.set(agent, { cleanup, runtime })
      })

      return async () => {
        this.stopping = true
        stopCreated()
        const cleanups = [...this.runtimes.values()].map(owner => owner.cleanup)
        this.runtimes.clear()
        await Promise.allSettled(cleanups.map(cleanup => Promise.resolve(cleanup())))
      }
    }, 'schedule.lifecycle()')
  }

  /**
   * Pause one retained deliverable reminder.
   * @param agent - Exact live root Agent resolved from the Session wire identity.
   * @param id - Session-local reminder identity.
   * @returns The paused durable view after its persistence barrier.
   */
  @Remote('pause')
  pause(agent: Agent, id: ScheduleId): Promise<ScheduleView> {
    return this.changeState(agent, id, 'pause')
  }

  /**
   * Resume one paused reminder without changing its target.
   * @param agent - Exact live root Agent resolved from the Session wire identity.
   * @param id - Session-local reminder identity.
   * @returns The resumed timing view after its persistence barrier.
   */
  @Remote('resume')
  resume(agent: Agent, id: ScheduleId): Promise<ScheduleView> {
    return this.changeState(agent, id, 'resume')
  }

  /**
   * Delete one retained reminder, including a paused reminder.
   * @param agent - Exact live root Agent resolved from the Session wire identity.
   * @param id - Session-local reminder identity.
   * @returns The deleted identity after its persistence barrier.
   */
  @Remote('delete')
  async delete(agent: Agent, id: ScheduleId): Promise<ScheduleDeleteResult> {
    this.assertLive(agent)
    this.assertId(id)
    return runScheduleTransaction(agent, async () => {
      await flushSchedulePersistence(this.ctx, agent.session)
      const runtime = this.runtimes.get(agent)?.runtime
      runtime?.requestDrive()
      const folded = this.fold(agent)
      if (!folded.schedules.some(schedule => schedule.record.id === id)) {
        throw new ScheduleMutationError('schedule_not_found', `schedule ${JSON.stringify(id)} is not retained`)
      }
      agent.session.append('schedule/change', { version: 1, operation: 'delete', id })
      runtime?.requestDrive()
      await flushSchedulePersistence(this.ctx, agent.session)
      runtime?.requestDrive()
      return { id, deleted: true }
    })
  }

  /** Apply a durable pause or resume under the Agent-scoped transaction. */
  private async changeState(
    agent: Agent,
    id: ScheduleId,
    operation: 'pause' | 'resume',
  ): Promise<ScheduleView> {
    this.assertLive(agent)
    this.assertId(id)
    return runScheduleTransaction(agent, async () => {
      await flushSchedulePersistence(this.ctx, agent.session)
      const runtime = this.runtimes.get(agent)?.runtime
      runtime?.requestDrive()
      const folded = this.fold(agent)
      const retained = folded.schedules.find(schedule => schedule.record.id === id)
      if (retained === undefined) {
        throw new ScheduleMutationError('schedule_not_found', `schedule ${JSON.stringify(id)} is not retained`)
      }
      const expectedPaused = operation === 'resume'
      if (retained.paused !== expectedPaused) {
        throw new ScheduleMutationError(
          'invalid_transition',
          `schedule ${JSON.stringify(id)} cannot ${operation} from ${retained.paused ? 'paused' : 'active'} state`,
        )
      }
      agent.session.append('schedule/change', { version: 1, operation, id })
      runtime?.requestDrive()
      await flushSchedulePersistence(this.ctx, agent.session)
      runtime?.requestDrive()
      return scheduleView(retained.record, Date.now(), operation === 'pause')
    })
  }

  /** Require the registry's exact live root Agent. */
  private assertLive(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent || !this.ctx.agents.roots().includes(agent)) {
      throw new ScheduleMutationError('schedule_not_found', 'the Schedule owner is not a live root Agent')
    }
  }

  /** Validate a branded wire value again at the Host mutation boundary. */
  private assertId(id: ScheduleId): void {
    if (typeof id !== 'string' || id.length === 0 || id.trim() !== id) {
      throw new ScheduleMutationError('schedule_not_found', 'schedule id must be non-empty without surrounding whitespace')
    }
  }

  /** Strictly fold one exact Session-owned suffix. */
  private fold(agent: Agent): ReturnType<typeof foldScheduleEvents> {
    try {
      return foldScheduleEvents(agent.session.events, agent.session.header.seedLength ?? 0)
    } catch (error: unknown) {
      if (error instanceof ScheduleLogError) {
        throw new ScheduleMutationError('corrupt_schedule_log', 'the Session Schedule log is corrupt')
      }
      throw error
    }
  }
}

export default ScheduleService
