// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileConversation } from '../src/MobileConversation.tsx'
import { MOBILE_TERMINAL_PREVIEW_LINES, previewTerminalLines } from '../src/mobile-content.ts'

afterEach(() => { cleanup() })

describe('Mobile conversation renderer', () => {
  it('renders shared Markdown, code, image, tool, diff, approval, and Ask User blocks', () => {
    render(createElement(MobileConversation, {
      title: 'Safe',
      onBack: () => {},
      blocks: [
        { kind: 'markdown', text: 'Hello markdown' },
        { kind: 'code', language: 'ts', text: 'const n = 1' },
        { kind: 'image', alt: 'diagram', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
        { kind: 'tool', name: 'read', args: { path: 'a.ts' }, result: { ok: true } },
        { kind: 'diff', path: 'a.ts', text: '-old\n+new' },
        { kind: 'approval', summary: 'Allow write' },
        { kind: 'ask-user', question: 'Continue?' },
      ],
    }))
    expect(screen.getByText('Hello markdown')).toBeTruthy()
    expect(screen.getByText('const n = 1')).toBeTruthy()
    expect(screen.getByAltText('diagram')).toBeTruthy()
    expect(screen.getByText('read')).toBeTruthy()
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('Allow write')).toBeTruthy()
    expect(screen.getByText('Continue?')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '允许' })).toBeNull()
  })

  it('disables settlement until foreground reconnect and Desktop-authoritative sync', () => {
    const onSettled = vi.fn()
    render(createElement(MobileConversation, {
      title: 'Safe',
      onBack: () => {},
      companionState: { foreground: true, socketOpen: true, synchronized: false },
      onSettled,
      blocks: [{ kind: 'approval', summary: 'Allow write' }],
    }))
    const button = screen.getByRole('button', { name: '允许' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('disables prompt and cancel callbacks until foreground synchronization', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const onAttach = vi.fn()
    render(createElement(MobileConversation, {
      title: 'Blocked',
      onBack: () => {},
      blocks: [],
      onSubmit,
      onCancel,
      onAttach,
      streaming: true,
      companionState: { foreground: true, socketOpen: true, synchronized: false },
    }))
    fireEvent.change(screen.getByRole('textbox', { name: '继续会话' }), { target: { value: 'continue' } })
    const submit = screen.getByRole('button', { name: '发送' })
    const cancel = screen.getByRole('button', { name: '取消' })
    const attach = screen.getByRole('button', { name: '添加附件' })
    expect(submit.hasAttribute('disabled')).toBe(true)
    expect(cancel.hasAttribute('disabled')).toBe(true)
    expect(attach.hasAttribute('disabled')).toBe(true)
    fireEvent.click(submit)
    fireEvent.click(cancel)
    fireEvent.click(attach)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(onAttach).not.toHaveBeenCalled()
  })

  it('renders unknown tools as a generic read-only card and bounds terminal output', () => {
    const lines = Array.from({ length: MOBILE_TERMINAL_PREVIEW_LINES + 4 }, (_, index) => `line-${String(index)}`)
    render(createElement(MobileConversation, {
      title: 'Tools',
      onBack: () => {},
      blocks: [
        { kind: 'unknown-tool', name: 'mystery', args: { q: 1 }, result: { v: 2 } },
        { kind: 'terminal', summary: 'bash', lines },
      ],
    }))
    expect(screen.getByText('mystery')).toBeTruthy()
    expect(screen.getByText('{"q":1}')).toBeTruthy()
    expect(screen.getByText('bash')).toBeTruthy()
    expect(screen.getByText('还有 4 行')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(previewTerminalLines(lines).spilled).toBe(4)
  })
})
