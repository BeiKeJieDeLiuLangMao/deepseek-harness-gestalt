/** Optional editors contributed to the official document-preview owner. */
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarRightTabCloseContext } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

/** Editor state retained by one official preview tab while its editor body is unmounted. */
export interface DocumentEditorState {
  readonly content: string
  readonly dirty: boolean
  readonly mode: 'preview' | 'edit'
  readonly localUnlock: boolean
  readonly previewScroll: number
  readonly editorScroll: number
}

/** Metadata paired with one keyed `sidebar.right.tab.document.editor` body. */
export interface DocumentEditorDefinition {
  /** Key of both this metadata and its keyed editor body. */
  readonly id: string
  /** Document renderer ids this editor supplements. */
  readonly documentIds: readonly string[]
}

function occurrenceKey(sessionId: SessionId, tabId: TabId): string {
  return `${sessionId}\u0000${tabId}`
}

/** Observable editor inventory plus dirty and retained state owned by official preview occurrences. */
export class DocumentEditorRegistry {
  private readonly definitions = new Map<string, DocumentEditorDefinition>()
  private readonly listeners = new Set<() => void>()
  private readonly retained = new Map<string, DocumentEditorState>()
  private readonly dirty = new Set<string>()
  private readonly armed = new Set<string>()
  private snapshot: readonly DocumentEditorDefinition[] = []

  /**
   * Read the current editor definitions.
   * @returns the same snapshot until registration changes.
   */
  readonly getSnapshot = (): readonly DocumentEditorDefinition[] => this.snapshot

  /**
   * Observe editor inventory changes.
   * @param listener - inventory observer.
   * @returns its disposer.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Register one editor metadata entry for the contributor lifetime.
   * @param definition - editor identity and supported renderers.
   * @returns an idempotent disposer.
   */
  register(definition: DocumentEditorDefinition): () => void {
    if (this.definitions.has(definition.id)) throw new Error(`documentEditors: duplicate implementation "${definition.id}"`)
    this.definitions.set(definition.id, definition)
    this.publish()
    let active = true
    return () => {
      if (!active) return
      active = false
      this.definitions.delete(definition.id)
      this.publish()
    }
  }

  /**
   * Find the editor supplement for a selected renderer.
   * @param documentId - selected preview renderer.
   * @returns its first registered editor, or undefined.
   */
  editorFor(documentId: string): DocumentEditorDefinition | undefined {
    return this.snapshot.find(definition => definition.documentIds.includes(documentId))
  }

  /**
   * Bind occurrence cleanup to its official tab lifetime.
   * @param sessionId - display Session owner.
   * @param tabId - official tab record.
   * @param signal - tab-record lifetime.
   */
  arm(sessionId: SessionId, tabId: TabId, signal: AbortSignal): void {
    const key = occurrenceKey(sessionId, tabId)
    if (signal.aborted) {
      this.releaseKey(key)
      return
    }
    if (this.armed.has(key)) return
    this.armed.add(key)
    signal.addEventListener('abort', () => { this.releaseKey(key) }, { once: true })
  }

  /**
   * Read retained editor state for one official occurrence.
   * @param sessionId - display Session owner.
   * @param tabId - official tab record.
   * @returns retained state, or undefined.
   */
  state(sessionId: SessionId, tabId: TabId): DocumentEditorState | undefined {
    return this.retained.get(occurrenceKey(sessionId, tabId))
  }

  /**
   * Retain editor state without serializing it into layout or Session data.
   * @param sessionId - display Session owner.
   * @param tabId - official tab record.
   * @param state - editor draft and view state.
   */
  retain(sessionId: SessionId, tabId: TabId, state: DocumentEditorState): void {
    const key = occurrenceKey(sessionId, tabId)
    this.retained.set(key, state)
    this.setDirty(sessionId, tabId, state.dirty)
  }

  /**
   * Update close admission without copying the editor document per keystroke.
   * @param sessionId - display Session owner.
   * @param tabId - official tab record.
   * @param dirty - whether close needs confirmation.
   */
  setDirty(sessionId: SessionId, tabId: TabId, dirty: boolean): void {
    const key = occurrenceKey(sessionId, tabId)
    if (dirty) this.dirty.add(key)
    else this.dirty.delete(key)
  }

  /**
   * Admit close or replacement only after a dirty draft is explicitly discarded.
   * @param context - official close occurrence.
   * @param message - localized confirmation text.
   * @returns whether the close may commit.
   */
  beforeClose(context: SidebarRightTabCloseContext, message: string): boolean {
    if (!this.dirty.has(occurrenceKey(context.sessionId, context.tab.id))) return true
    return typeof window.confirm === 'function' && window.confirm(message)
  }

  /**
   * Release editor state after the official occurrence closes.
   * @param context - committed official close occurrence.
   */
  release(context: SidebarRightTabCloseContext): void {
    this.releaseKey(occurrenceKey(context.sessionId, context.tab.id))
  }

  private releaseKey(key: string): void {
    this.retained.delete(key)
    this.dirty.delete(key)
    this.armed.delete(key)
  }

  private publish(): void {
    this.snapshot = [...this.definitions.values()]
    notifySubscribers(this.listeners, '[document-editors] registry')
  }
}
