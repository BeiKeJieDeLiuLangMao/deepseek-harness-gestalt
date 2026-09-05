/**
 * Command-directory pull: display catalog identity from ISessions.
 * Execute still addresses the composer Session. Omitting the helper hides
 * the generic catalog; a failed list is an error, not an empty success.
 */
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Host `commands.list` Remote used by the command directory. */
export interface CommandListRemote {
  list(sessionId: SessionId): Promise<
    | { readonly ok: true; readonly value: readonly CommandDescriptor[] }
    | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
  >
}

/**
 * Load the generic command catalog that may be shown for one Session.
 * @param sessions - ClientSessions catalog helper owner.
 * @param commands - Host commands list Remote.
 * @param sessionId - Session whose composer is asking.
 * @returns Host descriptors for the catalog identity, or empty when hidden.
 */
export async function loadCommandCatalog(
  sessions: Pick<ISessions, 'commandCatalogSessionId'>,
  commands: CommandListRemote,
  sessionId: SessionId,
): Promise<readonly CommandDescriptor[]> {
  const catalogId = sessions.commandCatalogSessionId(sessionId)
  if (catalogId === undefined) return []
  const result = await commands.list(catalogId)
  if (!result.ok) {
    throw new Error(`command.list failed: ${result.error.code}: ${result.error.message}`)
  }
  return result.value
}
