// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { DocumentSourceEditor } from '../src/client/official-files/DocumentSourceEditor.tsx'
import { api } from '../src/client/api.ts'

vi.mock('../src/client/lang.ts', () => ({ languageForPath: () => null }))
vi.mock('../src/client/MarkdownHtml.tsx', () => ({ LazyMermaidMarkdown: () => null, MarkdownDocument: () => null }))
vi.mock('../src/client/md-toc.tsx', () => ({ MdToc: () => null }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const DISPLAY = SessionId('display-session')
const SESSION = SessionId('save-session')
const CWD = '/resource/workspace'
const PATH = 'smoke.md'
const ABSOLUTE_PATH = `${CWD}/${PATH}`
const ADDRESS = sessionFileAddress(SESSION, PATH)

function tab(signal: AbortSignal) {
  return {
    title: PATH,
    signal,
    navigation: { revision: 1 },
  }
}

function props(signal: AbortSignal, retained?: Parameters<typeof DocumentSourceEditor>[0]['retained']) {
  return {
    sessionId: DISPLAY,
    useSessions: (selector: (value: unknown) => unknown) => selector({ byId: { [DISPLAY]: { cwd: '/display/workspace' }, [SESSION]: { cwd: CWD } } }),
    useTabInfo: () => ({ tab: tab(signal) }),
    documentId: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
    resourceAddress: ADDRESS,
    content: { text: '# Smoke\r\n', version: 'v1' },
    wrap: true,
    retained,
    retain: vi.fn(),
    setDirty: vi.fn(),
    saved: vi.fn(),
    writeFile: (sessionId: SessionId, path: string, content: string) => api.fsWrite({ sessionId }, path, content).then(() => undefined),
    insertText: vi.fn(),
  } as unknown as Parameters<typeof DocumentSourceEditor>[0]
}

function editorView(container: HTMLElement): EditorView {
  const content = container.querySelector<HTMLElement>('.cm-content')
  const view = content === null ? null : EditorView.findFromDOM(content)
  if (view === null) throw new Error('expected live CodeMirror view')
  return view
}

describe('DocumentSourceEditor live save bridge', () => {
  it.each([
    ['basic', undefined],
    ['retained dirty remount', {
      source: { address: ADDRESS, documentId: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown', version: 'v1', text: '# Smoke\r\n' },
      content: '# Smoke\n\nUnsaved marker.', dirty: true, mode: 'edit' as const,
      localUnlock: false, previewScroll: 0, editorScroll: 0,
    }],
  ] as const)('POSTs the live complete %s document and reaches Saved', async (_name, retained) => {
    const requests: Array<{ url: string; method: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { path?: unknown }
      requests.push({ url: String(input), method: init?.method ?? 'GET', body })
      const absolute = typeof body.path === 'string' && body.path.startsWith('/')
      return new Response(JSON.stringify(absolute
        ? { ok: true, value: {} }
        : { ok: false, error: { code: 'fs-error', message: `"${String(body.path)}" is not an absolute path` } }), {
        status: absolute ? 200 : 400, headers: { 'content-type': 'application/json' },
      })
    }))
    const controller = new AbortController()
    const view = render(<DocumentSourceEditor {...props(controller.signal, retained)} />)
    await waitFor(() => { expect(view.container.querySelector('.cm-content')).not.toBeNull() })
    const cm = editorView(view.container)
    cm.dispatch({ changes: { from: cm.state.doc.length, insert: '\nSaved marker.' } })
    fireEvent.click(view.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(view.queryByText('Saved')).not.toBeNull() })
    expect(requests).toEqual([{
      url: '/sidebar/api/fs.write', method: 'POST',
      body: {
        sessionId: SESSION, path: ABSOLUTE_PATH,
        content: retained === undefined ? '# Smoke\r\n\r\nSaved marker.' : '# Smoke\r\n\r\nUnsaved marker.\r\nSaved marker.',
      },
    }])
  })

  it('leaves an absolute resource path unchanged', async () => {
    const absoluteAddress = sessionFileAddress(SESSION, '/outside/already.md')
    const writeFile = vi.fn(() => Promise.resolve())
    const controller = new AbortController()
    const view = render(<DocumentSourceEditor {...({
      ...props(controller.signal), resourceAddress: absoluteAddress, writeFile,
    } as Parameters<typeof DocumentSourceEditor>[0])} />)
    await waitFor(() => { expect(view.container.querySelector('.cm-content')).not.toBeNull() })
    fireEvent.click(view.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(writeFile).toHaveBeenCalled() })
    expect(writeFile.mock.calls[0]?.slice(0, 2)).toEqual([SESSION, '/outside/already.md'])
  })

  it('does not mount an editor for a relative path when the resource Session has no cwd', () => {
    const controller = new AbortController()
    const value = props(controller.signal) as Parameters<typeof DocumentSourceEditor>[0]
    const view = render(<DocumentSourceEditor {...({
      ...value,
      useSessions: (selector: (snapshot: unknown) => unknown) => selector({ byId: { [DISPLAY]: { cwd: '/display/workspace' }, [SESSION]: {} } }),
    } as Parameters<typeof DocumentSourceEditor>[0])} />)
    expect(view.container.querySelector('.cm-content')).toBeNull()
  })
})
