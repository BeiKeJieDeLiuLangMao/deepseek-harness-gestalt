import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SidebarRightTabCloseContext } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { OfficialFileRuntime } from '../src/client/official-files/runtime.ts'

const SID = 'session' as SessionId
const TAB = 'tab' as TabId

function closeContext(): SidebarRightTabCloseContext {
  return {
    sessionId: SID,
    surface: 'right',
    tab: { id: TAB, kind: 'file', contentId: 'dsh-resource://file/session/session/a.md', title: 'a.md' },
    payload: undefined,
    pin: undefined,
    signal: new AbortController().signal,
    reason: 'close',
  }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('official file runtime', () => {
  it('retains the occurrence draft until the tab signal aborts', () => {
    const runtime = new OfficialFileRuntime()
    const controller = new AbortController()
    runtime.arm(SID, TAB, controller.signal)
    runtime.retain(SID, TAB, {
      content: '# changed', dirty: true, mode: 'edit', localUnlock: true, previewScroll: 44, editorScroll: 88,
    })
    expect(runtime.editor(SID, TAB)).toMatchObject({ content: '# changed', dirty: true, editorScroll: 88 })
    controller.abort()
    expect(runtime.editor(SID, TAB)).toBeUndefined()
  })

  it('does not retain state when the occurrence ended before the body armed', () => {
    const runtime = new OfficialFileRuntime()
    const controller = new AbortController()
    runtime.retain(SID, TAB, {
      content: '# changed', dirty: true, mode: 'edit', localUnlock: false, previewScroll: 0, editorScroll: 0,
    })
    controller.abort()
    runtime.arm(SID, TAB, controller.signal)
    expect(runtime.editor(SID, TAB)).toBeUndefined()
    expect(runtime.beforeClose(closeContext())).toBe(true)
  })

  it('admits clean closes and asks before discarding a dirty editor', () => {
    const runtime = new OfficialFileRuntime()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })
    expect(runtime.beforeClose(closeContext())).toBe(true)
    runtime.setDirty(SID, TAB, true)
    expect(runtime.beforeClose(closeContext())).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    confirm.mockReturnValue(true)
    expect(runtime.beforeClose(closeContext())).toBe(true)
  })
})
