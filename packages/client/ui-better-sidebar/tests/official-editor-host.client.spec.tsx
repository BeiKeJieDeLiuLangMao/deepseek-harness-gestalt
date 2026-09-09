// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OfficialFileViewerOwnerProps } from '../src/client/official-files/contract.ts'
import { OfficialEditorHost } from '../src/client/official-files/OfficialEditorHost.tsx'
import { api } from '../src/client/api.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('official file host resource ownership', () => {
  it('reads, navigates, and inserts through the child owner while the parent holds the tab', async () => {
    const display = SessionId('parent-display')
    const resource = SessionId('side-child')
    const signal = new AbortController().signal
    const fsRead = vi.spyOn(api, 'fsRead').mockResolvedValue({
      kind: 'text', content: '# Child file', truncated: false,
    })
    const writeFile = vi.fn(() => Promise.resolve())
    const insertText = vi.fn()
    const reference = vi.fn()
    const armEditor = vi.fn()
    const sessions = {
      byId: {
        [display]: { cwd: '/parent-work' },
        [resource]: { cwd: '/child-work' },
      },
    }
    const store = { byTab: {} }
    const filePreferences = { preferences: { editorExplorer: true, pluginSettings: {} } }
    const fileViewers: never[] = []
    const markdownViewer = {
      id: 'markdown', title: () => 'Markdown', extensions: ['md'], fetchStrategy: 'fsRead' as const,
    }
    let viewerOwner: OfficialFileViewerOwnerProps | undefined
    const props = {
      useTabInfo: () => ({
        panel: { id: 'pane' },
        tab: {
          id: 'file-tab',
          sessionId: display,
          contentId: 'dsh-resource://file/session/side-child/docs/a.md',
          title: 'a.md',
          payload: {},
          navigation: { params: { line: 9 }, revision: 1 },
          signal,
          actions: {
            openResource: vi.fn(), update: vi.fn(), close: vi.fn(), openTab: vi.fn(),
          },
        },
      }),
      useSessions: (select: (value: unknown) => unknown) => select(sessions),
      useStore: (select: (value: unknown) => unknown) => select(store),
      useFilePreferences: (select: (value: unknown) => unknown) => select(filePreferences),
      useFileViewers: (select: (value: unknown) => unknown) => select(fileViewers),
      renderSlot: (_key: string, owner: OfficialFileViewerOwnerProps) => {
        viewerOwner = owner
        return null
      },
      start: vi.fn(),
      toggle: vi.fn(),
      reveal: vi.fn(),
      split: vi.fn(),
      matchViewer: () => markdownViewer,
      viewerSettings: () => ({}),
      htmlSafety: () => ({ forceUnsandboxed: false, defaultUnsandboxed: false }),
      setOpenWith: () => Promise.resolve(),
      disableWorkspaceFence: () => Promise.resolve(),
      writeFile,
      openExternal: vi.fn(),
      reference,
      insertText,
      renamed: vi.fn(),
      removed: vi.fn(),
      armEditor,
      retainedEditor: () => undefined,
      retainEditor: vi.fn(),
      setDirty: vi.fn(),
    }

    render(<OfficialEditorHost {...(props as unknown as Parameters<typeof OfficialEditorHost>[0])} />)
    await waitFor(() => { expect(viewerOwner).toBeDefined() })

    expect(fsRead).toHaveBeenCalledWith(
      { sessionId: resource, cwd: '/child-work' },
      '/child-work/docs/a.md',
      expect.any(AbortSignal),
    )
    expect(viewerOwner).toMatchObject({
      address: 'dsh-resource://file/session/side-child/docs/a.md',
      scope: { sessionId: resource, cwd: '/child-work' },
      path: '/child-work/docs/a.md',
      line: 9,
    })
    await viewerOwner?.writeFile('# Updated')
    viewerOwner?.insertIntoConversation('selected text')
    expect(writeFile).toHaveBeenCalledWith(resource, '/child-work', '/child-work/docs/a.md', '# Updated')
    expect(insertText).toHaveBeenCalledWith(resource, 'selected text')
    expect(armEditor).toHaveBeenCalledWith(display, 'file-tab', signal)
  })
})
