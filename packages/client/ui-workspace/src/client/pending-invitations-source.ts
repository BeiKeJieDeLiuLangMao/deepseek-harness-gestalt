/**
 * Apply-owned pending-invitation list. The source object is stable for the
 * registration lifetime; snapshots keep the same reference until the list
 * identity or poll epoch changes. Polling, generation, and dispose live here
 * so the browsing region never starts a Host subscription.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspacePendingInvitation } from './contract/slots.ts'

/** Host pending-invitation list plus a poll epoch for local dismiss/reoffer. */
export type PendingInvitationsSnapshot = {
  invitations: readonly WorkspacePendingInvitation[]
  epoch: number
}

const EMPTY_INVITATIONS: readonly WorkspacePendingInvitation[] = Object.freeze([])
const EMPTY: PendingInvitationsSnapshot = Object.freeze({ invitations: EMPTY_INVITATIONS, epoch: 0 })

/** Client methods the poll reads. The apply closure supplies the live lookup. */
export type PendingInvitationPollClient = {
  pendingInvitations(): Promise<readonly WorkspacePendingInvitation[]>
}

/**
 * Create one pending-invitation observable and the timer that fills it.
 * @param readClient - current membership client, or none while Desktop is absent.
 * @param intervalMs - validated plugin poll interval.
 * @returns source plus start/replace/dispose controls used from apply.
 */
export function createPendingInvitationsSource(
  readClient: () => PendingInvitationPollClient | undefined,
  intervalMs: number,
): {
  source: HostObservable<PendingInvitationsSnapshot>
  start(): void
  notifyProviderChange(): void
  dispose(): void
} {
  let snapshot: PendingInvitationsSnapshot = EMPTY
  const listeners = new Set<() => void>()
  let generation = 0
  let inFlight = false
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  let bound: PendingInvitationPollClient | undefined

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // One subscriber must not starve the rest of the generation notify.
      }
    }
  }

  const publish = (next: readonly WorkspacePendingInvitation[]): void => {
    const sameIds = next.length === snapshot.invitations.length
      && next.every((invitation, index) => invitation.invitationId === snapshot.invitations[index]?.invitationId)
    if (sameIds && next.length === 0) return
    if (sameIds) {
      snapshot = { invitations: snapshot.invitations, epoch: snapshot.epoch + 1 }
      notify()
      return
    }
    snapshot = next.length === 0
      ? { invitations: EMPTY_INVITATIONS, epoch: snapshot.epoch + 1 }
      : { invitations: next, epoch: snapshot.epoch + 1 }
    notify()
  }

  const poll = (): void => {
    if (disposed) return
    const current = readClient()
    if (current !== bound) {
      generation += 1
      inFlight = false
      bound = current
      if (current === undefined) {
        stopTimer()
        publish(EMPTY_INVITATIONS)
        return
      }
    }
    if (inFlight || bound === undefined) return
    const client = bound
    const token = generation
    inFlight = true
    void client.pendingInvitations().then((invitations) => {
      if (token !== generation) {
        inFlight = false
        return
      }
      inFlight = false
      if (disposed || bound !== client) return
      publish(invitations)
    }).catch(() => {
      if (token !== generation) {
        inFlight = false
        return
      }
      inFlight = false
    })
  }

  const stopTimer = (): void => {
    if (timer === undefined) return
    clearInterval(timer)
    timer = undefined
  }

  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    start(): void {
      if (disposed) return
      bound = undefined
      generation += 1
      inFlight = false
      poll()
      if (bound !== undefined && timer === undefined) timer = setInterval(poll, intervalMs)
    },
    notifyProviderChange(): void {
      if (disposed) return
      generation += 1
      inFlight = false
      bound = undefined
      poll()
      if (bound === undefined) stopTimer()
      else if (timer === undefined) timer = setInterval(poll, intervalMs)
    },
    dispose(): void {
      disposed = true
      generation += 1
      inFlight = false
      bound = undefined
      stopTimer()
      listeners.clear()
      snapshot = EMPTY
    },
  }
}
