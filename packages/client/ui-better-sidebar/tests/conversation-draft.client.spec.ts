import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SessionInputShell } from '@deepseek-ai/dsh-client-ui-conversation/src/client/input/facade.ts'
import { $selectDetectSpan } from '@deepseek-ai/dsh-client-ui-conversation/src/client/input/editor/span-map.ts'
import type { SidebarContext, SidebarConversation } from '../src/context-types.ts'
import { appendToDraft } from '../src/client/conversation-draft.ts'

const commandAttachments = {
  serialize: () => Promise.resolve([]),
  release: () => {},
  unsupportedNotice: (token: string) => `${token.trim()} attachments-unsupported`,
}

describe('sidebar conversation draft insertion', () => {
  it('replaces the addressed Lexical selection without reading a textarea', () => {
    const scope = {} as Context
    const shell = new SessionInputShell({
      actx: scope,
      defaultSink: () => Promise.resolve({ kind: 'success' }),
      commandAttachments,
    })
    shell.setDraft('alpha omega')
    shell.editor.update(() => {
      $selectDetectSpan({ start: 6, end: 11 })
    }, { discrete: true })
    const inputFor = vi.fn(() => shell)
    const conversation: SidebarConversation = { input: { for: inputFor } }
    const ctx = {
      sessions: { scope: (id: string) => id === 'session-a' ? scope : undefined },
      get: (name: string) => name === 'conversation' ? conversation : undefined,
    } as unknown as SidebarContext

    expect(appendToDraft(ctx, 'session-a', 'beta')).toBe(true)
    expect(shell.snapshot.draft).toBe('alpha beta')
    expect(inputFor).toHaveBeenCalledWith(scope)
  })
})
