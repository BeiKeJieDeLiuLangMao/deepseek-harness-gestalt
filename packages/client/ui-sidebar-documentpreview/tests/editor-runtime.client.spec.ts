// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { DocumentEditorRegistry } from '../src/client/document/editor.ts'

const SESSION = SessionId('session')
const TAB = 'tab' as TabId

function closeContext() {
  return { sessionId: SESSION, tab: { id: TAB } } as never
}

describe('DocumentEditorRegistry', () => {
  it('registers editor metadata reversibly', () => {
    const registry = new DocumentEditorRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const dispose = registry.register({ id: 'editor', documentIds: ['markdown'] })
    expect(registry.editorFor('markdown')?.id).toBe('editor')
    dispose()
    expect(registry.editorFor('markdown')).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('retains dirty state until the official tab signal ends', () => {
    const registry = new DocumentEditorRegistry()
    const controller = new AbortController()
    registry.arm(SESSION, TAB, controller.signal)
    registry.retain(SESSION, TAB, {
      source: 'complete file\r\n', content: 'complete file', dirty: true, mode: 'edit', localUnlock: false,
      previewScroll: 1, editorScroll: 2,
    })
    expect(registry.state(SESSION, TAB)).toMatchObject({ source: 'complete file\r\n', content: 'complete file' })
    controller.abort()
    expect(registry.state(SESSION, TAB)).toBeUndefined()
  })

  it('admits clean closes and asks before discarding dirty drafts', () => {
    const registry = new DocumentEditorRegistry()
    expect(registry.beforeClose(closeContext(), 'discard?')).toBe(true)
    registry.setDirty(SESSION, TAB, true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    expect(registry.beforeClose(closeContext(), 'discard?')).toBe(false)
    expect(registry.beforeClose(closeContext(), 'discard?')).toBe(true)
    expect(confirm).toHaveBeenNthCalledWith(1, 'discard?')
    confirm.mockRestore()
  })
})
