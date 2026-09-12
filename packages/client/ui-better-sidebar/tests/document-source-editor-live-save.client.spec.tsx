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

const SESSION = SessionId('save-session')
const PATH = 'smoke.md'
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
      requests.push({ url: String(input), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ ok: true, value: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
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
        sessionId: SESSION, path: PATH,
        content: retained === undefined ? '# Smoke\r\n\r\nSaved marker.' : '# Smoke\r\n\r\nUnsaved marker.\r\nSaved marker.',
      },
    }])
  })
})
