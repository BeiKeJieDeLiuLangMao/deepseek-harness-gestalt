/** Short-lived persisted Session reads used by Host sidebar routes. */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type SessionPersistence from '@deepseek-ai/dsh-session-persistence'
import type { SessionInspection } from '@deepseek-ai/dsh-session-persistence'

type SessionReader = Pick<SessionPersistence, 'open'>

/** Header, inherited cut, and validated events obtained from one non-owning persistence read. */
export type PersistedSessionRead = Pick<SessionInspection, 'meta' | 'inheritedEventCount' | 'events'>

/**
 * Read one persisted Session and release the read handle before returning.
 * @param persistence - mounted formal persistence face.
 * @param sessionId - persisted Session identity.
 * @returns immutable header metadata and validated events.
 */
export async function readPersistedSession(
  persistence: SessionReader,
  sessionId: SessionId,
): Promise<PersistedSessionRead> {
  const reader = await persistence.open(sessionId, 'read')
  let events: PersistedSessionRead['events']
  try {
    events = await reader.read()
  } catch (readError: unknown) {
    try {
      await reader.close()
    } catch (closeError: unknown) {
      throw new AggregateError(
        [readError, closeError],
        `failed to read and close persisted Session "${sessionId}"`,
      )
    }
    throw readError
  }
  await reader.close()
  return {
    meta: reader.header,
    inheritedEventCount: reader.inheritedEventCount,
    events,
  }
}

/** Read the persisted working directory used by cold Host file and tool routes. */
export async function readPersistedSessionCwd(
  persistence: SessionReader,
  sessionId: SessionId,
): Promise<string | undefined> {
  return (await readPersistedSession(persistence, sessionId)).meta.cwd
}

/** Read cold events for the Changes panel, or report an unavailable persisted source. */
export async function tryReadPersistedSessionEvents(
  persistence: SessionReader,
  sessionId: SessionId,
): Promise<PersistedSessionRead['events'] | undefined> {
  try {
    return (await readPersistedSession(persistence, sessionId)).events
  } catch {
    // Changes is a best-effort lens; a missing or unreadable cold Session contributes no operations.
    return undefined
  }
}
