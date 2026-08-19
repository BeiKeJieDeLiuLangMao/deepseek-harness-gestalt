/**
 * `@` InputTriggerSource for workspace paths. The draft carries plain
 * `@rel/path`; the host pre-step validates and injects the marker.
 */
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { rankFiles, type WorkspacePathEntry } from './rank.ts'

const MENU_LIMIT = 12

/** Fetch the raw workspace index for one session. */
export type WorkspaceIndexSearch = (
  sessionId: SessionId,
  signal: AbortSignal,
) => Promise<readonly WorkspacePathEntry[]>

/** One session's index fetch. */
interface IndexCache {
  readonly promise: Promise<readonly WorkspacePathEntry[]>
  readonly abort: AbortController
  settled?: readonly WorkspacePathEntry[]
}

/**
 * Build the `workspace` `@` source over an injected index fetch.
 * @param search - session-addressed index RPC or test stub.
 * @returns the `workspace` `@` source.
 */
export function createWorkspaceSource(search: WorkspaceIndexSearch): InputTriggerSource {
  const fetches = new Map<SessionId, IndexCache>()
  const lexiconListeners = new Map<SessionId, Set<() => void>>()

  const notify = (sessionId: SessionId): void => {
    const listeners = lexiconListeners.get(sessionId)
    if (listeners === undefined) return
    for (const listener of listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[ui-workspace-reference] lexicon listener failed:', error)
      }
    }
  }

  const fetchIndex = (sessionId: SessionId): Promise<readonly WorkspacePathEntry[]> => {
    const existing = fetches.get(sessionId)
    if (existing !== undefined) return existing.promise
    const abort = new AbortController()
    const promise = search(sessionId, abort.signal).then((files) => {
      const current = fetches.get(sessionId)
      /* v8 ignore next -- a superseded fetch is dropped by invalidate */
      if (current?.promise === promise) current.settled = files
      notify(sessionId)
      return files
    }, (error: unknown) => {
      const current = fetches.get(sessionId)
      /* v8 ignore next -- a superseded fetch is dropped by invalidate */
      if (current?.promise === promise) fetches.delete(sessionId)
      throw error
    })
    fetches.set(sessionId, { promise, abort })
    return promise
  }

  const invalidate = (sessionId: SessionId): void => {
    const current = fetches.get(sessionId)
    if (current === undefined) return
    fetches.delete(sessionId)
    current.abort.abort()
    notify(sessionId)
  }

  const source: InputTriggerSource = {
    trigger: '@',
    name: 'workspace',
    order: 1,
    async candidates(session, { query, signal }) {
      const files = await fetchIndex(session.sessionId)
      if (signal.aborted) return []
      return rankFiles(files, query, MENU_LIMIT).map(file => ({
        name: file.relative,
        description: file.kind === 'dir' ? `${file.relative}/` : file.relative,
      }))
    },
    warm(session) {
      fetchIndex(session.sessionId).catch(() => {
        // Warm is fire-and-forget; the next candidates() call retries.
      })
    },
    lexicon(session) {
      return fetches.get(session.sessionId)?.settled?.map(file => file.relative)
    },
    subscribeLexicon(session, listener) {
      const key = session.sessionId
      const listeners = lexiconListeners.get(key) ?? new Set()
      listeners.add(listener)
      lexiconListeners.set(key, listeners)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) lexiconListeners.delete(key)
      }
    },
    onPick({ candidate }) {
      const token = candidate.description?.endsWith('/')
        ? `${candidate.name}/`
        : candidate.name
      return { text: `@${token} ` }
    },
    codec: {
      clipboardText: ref => `@${ref}`,
      serialize: (ref, _signal) => Promise.resolve(`@${ref}`),
    },
  }
  return Object.assign(source, { invalidate })
}
