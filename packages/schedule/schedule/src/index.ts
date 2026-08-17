/**
 * Agent-scoped durable one-shot and fixed-rate reminders over the Session event log.
 * @module @deepseek-ai/dsh-schedule
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId, SessionPreparation } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { foldScheduleEvents, ScheduleLogError, scheduleView } from './domain.ts'
import { flushSchedulePersistence } from './persistence.ts'
import { scheduleProjectionDefinition } from './projection.ts'
import { ScheduleRuntime } from './runtime.ts'
import { registerScheduleTools } from './tools.ts'
import { ScheduleTransactions } from './transaction.ts'
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
  private readonly transactions = new ScheduleTransactions()
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
        const runtime = new ScheduleRuntime(ctx, agent, this.transactions)
        const cleanup: OwnerCleanup = agent.ctx.effect(() => {
          const disposeTools = registerScheduleTools(
            ctx,
            agent.ctx,
            agent,
            this.transactions,
            () => { runtime.requestDrive() },
          )
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
        const transactionDisposal = this.transactions.dispose()
        await Promise.allSettled([
          ...cleanups.map(cleanup => Promise.resolve(cleanup())),
          transactionDisposal,
        ])
      }
    }, 'schedule.lifecycle()')
  }

  /**
   * Pause one retained deliverable reminder.
   * @param sessionId - Exact root Session identity; a cold mutation publishes no Agent.
   * @param id - Session-local reminder identity.
   * @returns The paused durable view after its persistence barrier.
   */
  @Remote('pause')
  pause(sessionId: SessionId, id: ScheduleId): Promise<ScheduleView> {
    return this.changeState(sessionId, id, 'pause')
  }

  /**
   * Resume one paused reminder without changing its target.
   * @param sessionId - Exact root Session identity; a cold mutation publishes no Agent.
   * @param id - Session-local reminder identity.
   * @returns The resumed timing view after its persistence barrier.
   */
  @Remote('resume')
  resume(sessionId: SessionId, id: ScheduleId): Promise<ScheduleView> {
    return this.changeState(sessionId, id, 'resume')
  }

  /**
   * Delete one retained reminder, including a paused reminder.
   * @param sessionId - Exact root Session identity; a cold mutation publishes no Agent.
   * @param id - Session-local reminder identity.
   * @returns The deleted identity after its persistence barrier.
   */
  @Remote('delete')
  async delete(sessionId: SessionId, id: ScheduleId): Promise<ScheduleDeleteResult> {
    this.assertId(id)
    return this.transactions.run(sessionId, async () => {
      const live = this.liveRoot(sessionId)
      if (live === undefined) {
        return this.withColdSession(sessionId, async (session) => {
          const folded = this.fold(session)
          if (!folded.schedules.some(schedule => schedule.record.id === id)) {
            throw new ScheduleMutationError('schedule_not_found', `schedule ${JSON.stringify(id)} is not retained`)
          }
          session.append('schedule/change', { version: 1, operation: 'delete', id })
          await flushSchedulePersistence(this.ctx, session)
          return { id, deleted: true }
        }, async raced => this.deleteLive(raced, id))
      }
      return this.deleteLive(live, id)
    })
  }

  /** Delete one retained reminder through an already-live owner. */
  private async deleteLive(agent: Agent, id: ScheduleId): Promise<ScheduleDeleteResult> {
    await flushSchedulePersistence(this.ctx, agent.session)
    const runtime = this.runtimes.get(agent)?.runtime
    runtime?.requestDrive()
    const folded = this.fold(agent.session)
    if (!folded.schedules.some(schedule => schedule.record.id === id)) {
      throw new ScheduleMutationError('schedule_not_found', `schedule ${JSON.stringify(id)} is not retained`)
    }
    agent.session.append('schedule/change', { version: 1, operation: 'delete', id })
    runtime?.requestDrive()
    await flushSchedulePersistence(this.ctx, agent.session)
    runtime?.requestDrive()
    return { id, deleted: true }
  }

  /** Apply a durable pause or resume under the Session-scoped transaction. */
  private async changeState(
    sessionId: SessionId,
    id: ScheduleId,
    operation: 'pause' | 'resume',
  ): Promise<ScheduleView> {
    this.assertId(id)
    return this.transactions.run(sessionId, async () => {
      const live = this.liveRoot(sessionId)
      if (live === undefined) {
        return this.withColdSession(sessionId, async (session) => {
          const retained = this.retainedForChange(session, id, operation)
          session.append('schedule/change', { version: 1, operation, id })
          await flushSchedulePersistence(this.ctx, session)
          return scheduleView(retained.record, Date.now(), operation === 'pause')
        }, async raced => this.changeLive(raced, id, operation))
      }
      return this.changeLive(live, id, operation)
    })
  }

  /** Apply pause or resume through an already-live owner. */
  private async changeLive(
    agent: Agent,
    id: ScheduleId,
    operation: 'pause' | 'resume',
  ): Promise<ScheduleView> {
    await flushSchedulePersistence(this.ctx, agent.session)
    const runtime = this.runtimes.get(agent)?.runtime
    runtime?.requestDrive()
    const retained = this.retainedForChange(agent.session, id, operation)
    agent.session.append('schedule/change', { version: 1, operation, id })
    runtime?.requestDrive()
    await flushSchedulePersistence(this.ctx, agent.session)
    runtime?.requestDrive()
    return scheduleView(retained.record, Date.now(), operation === 'pause')
  }

  /** Return the exact live root Agent, rejecting a live child authority. */
  private liveRoot(sessionId: SessionId): Agent | undefined {
    const agent = this.ctx.agents.get(sessionId)
    if (agent !== undefined && !this.ctx.agents.roots().includes(agent)) {
      throw new ScheduleMutationError('schedule_not_found', 'the Schedule owner is not a live root Agent')
    }
    return agent
  }

  /** Hold the persistence preparation reservation while changing one cold Session. */
  private async withColdSession<T>(
    sessionId: SessionId,
    operation: (session: Session) => Promise<T>,
    racedLive: (agent: Agent) => Promise<T>,
  ): Promise<T> {
    let preparation: SessionPreparation
    try {
      preparation = await this.ctx.sessionPersistence.prepare(sessionId)
    } catch (error: unknown) {
      const live = this.liveRoot(sessionId)
      if (live !== undefined) return racedLive(live)
      throw error
    }
    let detach: (() => void)
    try {
      detach = this.ctx.sessions.enter(preparation.session)
    } catch (error: unknown) {
      preparation[Symbol.dispose]()
      const live = this.liveRoot(sessionId)
      if (live !== undefined) return racedLive(live)
      throw error
    }
    try {
      await flushSchedulePersistence(this.ctx, preparation.session)
      return await operation(preparation.session)
    } finally {
      detach()
      preparation[Symbol.dispose]()
    }
  }

  /** Resolve and validate the retained record targeted by pause or resume. */
  private retainedForChange(
    session: Session,
    id: ScheduleId,
    operation: 'pause' | 'resume',
  ): ReturnType<typeof foldScheduleEvents>['schedules'][number] {
    const folded = this.fold(session)
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
    return retained
  }

  /** Validate a branded wire value again at the Host mutation boundary. */
  private assertId(id: ScheduleId): void {
    if (typeof id !== 'string' || id.length === 0 || id.trim() !== id) {
      throw new ScheduleMutationError('schedule_not_found', 'schedule id must be non-empty without surrounding whitespace')
    }
  }

  /** Strictly fold one exact Session-owned suffix. */
  private fold(session: Session): ReturnType<typeof foldScheduleEvents> {
    try {
      return foldScheduleEvents(session.events, session.header.seedLength ?? 0)
    } catch (error: unknown) {
      if (error instanceof ScheduleLogError) {
        throw new ScheduleMutationError('corrupt_schedule_log', 'the Session Schedule log is corrupt')
      }
      throw error
    }
  }
}

export default ScheduleService
