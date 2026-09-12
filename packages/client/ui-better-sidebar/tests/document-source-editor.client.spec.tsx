// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { DocumentSourceEditor } from '../src/client/official-files/DocumentSourceEditor.tsx'

vi.mock('../src/client/TextEditor.tsx', () => ({
  TextEditorCore: (props: { writeFile: (content: string) => Promise<void> }) => {
    void props.writeFile('whole edited file')
    return null
  },
}))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('DocumentSourceEditor', () => {
  it('writes the complete EOF text through its private bridge then asks the official owner to reread', async () => {
    const sessionId = SessionId('child')
    const writeFile = vi.fn(() => Promise.resolve())
    const saved = vi.fn()
    const controller = new AbortController()
    render(<DocumentSourceEditor {...({
      useTabInfo: () => ({ tab: { title: 'a.md', navigation: { revision: 1 }, signal: controller.signal } }),
      documentId: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
      resourceAddress: sessionFileAddress(sessionId, 'a.md'),
      content: { kind: 'text', text: 'whole original file', pages: [], eof: true },
      wrap: true,
      retained: undefined,
      retain: vi.fn(),
      setDirty: vi.fn(),
      saved,
      writeFile,
      insertText: vi.fn(),
    } as unknown as Parameters<typeof DocumentSourceEditor>[0])} />)
    await waitFor(() => { expect(saved).toHaveBeenCalledTimes(1) })
    expect(writeFile).toHaveBeenCalledWith(sessionId, 'a.md', 'whole edited file')
  })

  it('does not publish a save completion after the official tab closes', async () => {
    const sessionId = SessionId('child')
    const pending = Promise.withResolvers<void>()
    const saved = vi.fn()
    const controller = new AbortController()
    render(<DocumentSourceEditor {...({
      useTabInfo: () => ({ tab: { title: 'a.md', navigation: { revision: 1 }, signal: controller.signal } }),
      documentId: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
      resourceAddress: sessionFileAddress(sessionId, 'a.md'),
      content: { kind: 'text', text: 'whole original file', pages: [], eof: true },
      wrap: true,
      retained: undefined,
      retain: vi.fn(),
      setDirty: vi.fn(),
      saved,
      writeFile: vi.fn(() => pending.promise),
      insertText: vi.fn(),
    } as unknown as Parameters<typeof DocumentSourceEditor>[0])} />)
    controller.abort()
    pending.resolve()
    await pending.promise
    await Promise.resolve()
    expect(saved).not.toHaveBeenCalled()
  })
})
