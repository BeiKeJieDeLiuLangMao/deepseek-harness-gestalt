/**
 * Insert text into an explicitly addressed Session's composer draft through the
 * conversation service — the shared path behind the explorer's @-reference
 * button and the viewer selection popup. The service is resolved lazily
 * through `ctx.get` (the inject-free read the app's own plugins use); a
 * missing service or scope degrades to a logged no-op, never a crash.
 *
 * File references additionally use DSH's own structured insert event
 * (`slash/input-insert-reference`, see `insertFileReference`) instead of
 * plain draft text: the native `@file` picker emits this event, and the
 * conversation input machine mints one occurrence whose chip covers the
 * whole reference. Plain text `@folder/file.ts` only ever gets DSH's
 * folder-ref decoration (`@folder/`) — the file name stays undecorated — so
 * plain append is the fallback, not the primary path, for files.
 *
 * Plain text enters through the input facade's editor transaction. The
 * facade owns the Lexical selection and replaces it directly; before first
 * focus it selects the document end. No sidebar DOM query participates in
 * editor addressing, so the caller's explicit Session scope remains the
 * complete routing key.
 */
import type { SidebarContext, SidebarConversation } from '../context-types.ts'

/**
 * Insert `text` through the explicitly addressed Session's live editor
 * selection. Returns false — and logs — when the conversation service,
 * Session scope, or editor transaction is unavailable.
 */
export function appendToDraft(ctx: SidebarContext, sessionId: string, text: string): boolean {
  try {
    const actx = ctx.sessions.scope(sessionId)
    if (actx === undefined) {
      console.warn('[dsh-better-sidebar] draft insert skipped: no session scope', sessionId)
      return false
    }
    const conversation = ctx.get('conversation') as SidebarConversation | undefined
    if (conversation === undefined) {
      console.warn('[dsh-better-sidebar] draft insert skipped: conversation service unavailable')
      return false
    }
    const input = conversation.input.for(actx)
    const before = input.state.getSnapshot()
    input.paste(text)
    const after = input.state.getSnapshot()
    return after.draft !== before.draft || after.draftRev !== before.draftRev
  } catch (error) {
    console.warn('[dsh-better-sidebar] draft insert failed:', error)
    return false
  }
}

/**
 * The DSH `@file` spelling for one relative path, mirroring the host grammar
 * (`formatFileMention` in `@deepseek-ai/dsh-file-reference`): plain when
 * there is no whitespace, quoted when there is, and `undefined` when the
 * path contains a control character or an embedded quote the editor grammar
 * cannot represent.
 */
export function fileMention(relativePath: string): { mention: string; label: string } | undefined {
  const path = relativePath.replace(/[\\/]+$/, '')
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point of this guard
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return undefined
  const mention = /\s/u.test(path) ? `@"${path}"` : `@${path}`
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const label = at === -1 ? path : path.slice(at + 1)
  return { mention, label }
}

/**
 * Insert one FILE reference as a structured chip (like DSH's own `@` picker).
 * The chip displays `@<basename>` but serializes to `@<relative path>` on
 * send, so the reference stays a single link from trigger to basename.
 *
 * Directories are NOT handled here: DSH's folder grammar wants the trailing
 * slash as plain text (`@dir/`) so completion can descend, which
 * `appendToDraft` already covers.
 */
export function insertFileReference(ctx: SidebarContext, sessionId: string, relativePath: string): boolean {
  const reference = fileMention(relativePath)
  if (reference === undefined) return false
  try {
    const actx = ctx.sessions.scope(sessionId)
    if (actx === undefined) return false
    const conversation = ctx.get('conversation') as SidebarConversation | undefined
    if (conversation === undefined) return false
    const input = conversation.input.for(actx)
    const before = input.state.getSnapshot()
    if (before.draftRev === undefined) return false
    // The session-scope SidebarContext's typed `emit` is keyed to DSH's closed event
    // map; this internal composer event is deliberately string-loose at runtime.
    ;(actx as unknown as { emit(name: string, payload: unknown): void }).emit('slash/input-insert-reference', {
      reference: {
        source: 'reference',
        ref: reference.mention,
        label: reference.label,
        appearance: 'file',
        clipboardText: reference.mention,
      },
      span: {
        draftRev: before.draftRev,
        start: before.draft.length,
        end: before.draft.length,
      },
    })
    const after = input.state.getSnapshot()
    return after.draftRev !== before.draftRev
  } catch (error) {
    console.warn('[dsh-better-sidebar] file-reference insert failed:', error)
    return false
  }
}
