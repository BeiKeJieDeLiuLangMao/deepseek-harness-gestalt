/**
 * Skill-directory pull: display catalog identity from ISessions, Host list
 * still addressed by that identity. A missing helper hides skills; a failed
 * list is an error, not an empty success.
 */
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Host `skills/list` Remote used by the skill directory. */
export interface SkillListRemote {
  list(
    payload: { sessionId: SessionId },
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: { readonly skills: readonly SkillEntry[] } }
    | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
  >
}

/**
 * Load the skill catalog that may be shown for one Session.
 * @param sessions - ClientSessions catalog helper owner.
 * @param skills - Host skills list Remote.
 * @param sessionId - Session whose composer is asking.
 * @param signal - abort for this pull.
 * @returns Host skills for the catalog identity, or empty when hidden.
 */
export async function loadSkillCatalog(
  sessions: Pick<ISessions, 'skillCatalogSessionId'>,
  skills: SkillListRemote,
  sessionId: SessionId,
  signal?: AbortSignal,
): Promise<readonly SkillEntry[]> {
  const catalogId = sessions.skillCatalogSessionId(sessionId)
  if (catalogId === undefined) return []
  const result = await skills.list({ sessionId: catalogId }, signal)
  if (!result.ok) {
    throw new Error(`skills/list failed: ${result.error.code}: ${result.error.message}`)
  }
  return result.value.skills
}
