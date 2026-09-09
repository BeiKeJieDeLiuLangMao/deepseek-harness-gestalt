/** Runtime editor ownership that follows official tab-record lifetimes. */
import type { SidebarRightTabCloseContext } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RetainedEditorState } from '../TextEditor.tsx'
import { t } from '../locales.ts'

function keyOf(sessionId: SessionId, tabId: TabId): string {
  return `${sessionId}\u0000${tabId}`
}

/** Retained editor drafts and close admission for official file occurrences. */
export class OfficialFileRuntime {
  private readonly editors = new Map<string, RetainedEditorState>()
  private readonly dirty = new Set<string>()
  private readonly armed = new Set<string>()

  /** Bind retained state cleanup to a tab record's signal once. */
  arm(sessionId: SessionId, tabId: TabId, signal: AbortSignal): void {
    const key = keyOf(sessionId, tabId)
    if (signal.aborted) {
      this.releaseKey(key)
      return
    }
    if (this.armed.has(key)) return
    this.armed.add(key)
    signal.addEventListener('abort', () => { this.releaseKey(key) }, { once: true })
  }

  /** Read the editor draft retained across body remounts. */
  editor(sessionId: SessionId, tabId: TabId): RetainedEditorState | undefined {
    return this.editors.get(keyOf(sessionId, tabId))
  }

  /** Retain one editor's live document before its body unmounts. */
  retain(sessionId: SessionId, tabId: TabId, state: RetainedEditorState): void {
    const key = keyOf(sessionId, tabId)
    this.editors.set(key, state)
    if (state.dirty) this.dirty.add(key)
    else this.dirty.delete(key)
  }

  /** Update close admission without serializing the editor document per keystroke. */
  setDirty(sessionId: SessionId, tabId: TabId, dirty: boolean): void {
    const key = keyOf(sessionId, tabId)
    if (dirty) this.dirty.add(key)
    else this.dirty.delete(key)
  }

  /** Admit a close or replacement only after the user accepts discarding a dirty draft. */
  beforeClose(context: SidebarRightTabCloseContext): boolean {
    if (!this.dirty.has(keyOf(context.sessionId, context.tab.id))) return true
    return typeof window.confirm === 'function' && window.confirm(t('discardUnsavedConfirm'))
  }

  /** Release one official occurrence after its close commits. */
  release(context: SidebarRightTabCloseContext): void {
    this.releaseKey(keyOf(context.sessionId, context.tab.id))
  }

  private releaseKey(key: string): void {
    this.editors.delete(key)
    this.dirty.delete(key)
    this.armed.delete(key)
  }
}
