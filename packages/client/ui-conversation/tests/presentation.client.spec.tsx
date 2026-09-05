// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { RenderMessageImages } from '../src/client/contract/slots.ts'
import {
  ConversationApproval,
  ConversationComposer,
  ConversationNodePresentation,
  conversationPresentationTranslate,
} from '../src/presentation.tsx'

afterEach(cleanup)

const photo = (id: string, name: string) => ({
  attachmentId: AttachmentId(id),
  mediaType: 'image/png' as const,
  bytes: 12,
  width: 8,
  height: 8,
  name,
})

describe('public conversation presentation seam', () => {
  it('settles approval allow-once and reject once, then retries after a visible failure', async () => {
    const answer = vi.fn<(outcome: 'allowed-once' | 'rejected') => Promise<void>>()
      .mockRejectedValueOnce(new Error('transport refused'))
      .mockResolvedValue(undefined)
    render(createElement(ConversationApproval, {
      wait: { kind: 'approval', toolName: 'bash', reason: 'run privileged command', answer },
      snapshot: sessionSnapshot('presentation-session' as SessionId),
      t: conversationPresentationTranslate('en'),
    }))
    expect(screen.getByText('run privileged command')).toBeTruthy()
    expect(screen.getByText('Waiting for approval')).toBeTruthy()
    const allow = screen.getByRole('button', { name: 'Allow once' })
    const reject = screen.getByRole('button', { name: 'Reject' })
    fireEvent.click(allow)
    fireEvent.click(allow)
    fireEvent.click(reject)
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer).toHaveBeenCalledWith('allowed-once')
    expect((await screen.findByRole('alert')).textContent).toContain('transport refused')
    fireEvent.click(reject)
    await waitFor(() => { expect(answer).toHaveBeenCalledTimes(2) })
    expect(answer).toHaveBeenLastCalledWith('rejected')
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('resets a replaced wait and ignores a late failure from the previous request', async () => {
    let rejectFirst!: (reason: unknown) => void
    const first = new Promise<void>((_, reject) => { rejectFirst = reject })
    const firstAnswer = vi.fn(() => first)
    const secondAnswer = vi.fn(async () => undefined)
    const t = conversationPresentationTranslate('en')
    const view = render(createElement(ConversationApproval, {
      wait: { kind: 'approval', reason: 'first request', answer: firstAnswer },
      t,
    }))
    const allow = screen.getByRole('button', { name: 'Allow once' })
    allow.click()
    allow.click()
    expect(firstAnswer).toHaveBeenCalledOnce()
    view.rerender(createElement(ConversationApproval, {
      wait: { kind: 'approval', reason: 'second request', answer: secondAnswer },
      t,
    }))
    expect(screen.getByText('second request')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    rejectFirst(new Error('stale transport'))
    await Promise.resolve()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    expect(secondAnswer).toHaveBeenCalledOnce()
  })

  it('ignores settlement after unmount and retries a synchronous answer throw', async () => {
    let rejectFirst!: (reason: unknown) => void
    const first = new Promise<void>((_, reject) => { rejectFirst = reject })
    const firstAnswer = vi.fn(() => first)
    const t = conversationPresentationTranslate('en')
    const view = render(createElement(ConversationApproval, {
      wait: { kind: 'approval', reason: 'unmounted request', answer: firstAnswer },
      t,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    view.unmount()
    rejectFirst(new Error('gone'))
    await Promise.resolve()

    const answer = vi.fn<(outcome: 'allowed-once' | 'rejected') => Promise<void>>()
      .mockImplementationOnce(() => { throw new Error('sync refused') })
      .mockResolvedValue(undefined)
    render(createElement(ConversationApproval, {
      wait: { kind: 'approval', reason: 'retry request', answer },
      t,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    expect((await screen.findByRole('alert')).textContent).toContain('sync refused')
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    await waitFor(() => { expect(answer).toHaveBeenCalledTimes(2) })
  })

  it('does not settle approval while mutation authority is disabled', () => {
    const answer = vi.fn()
    render(createElement(ConversationApproval, {
      wait: { kind: 'approval', toolName: 'bash', answer },
      t: conversationPresentationTranslate('zh'),
      disabled: true,
    }))
    expect(screen.getByText('工具 bash 请求越权执行')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(answer).not.toHaveBeenCalled()
  })

  it('hands user image blocks to the authorized renderer in source order', () => {
    const first = photo('att-first', 'first.png')
    const second = photo('att-second', 'second.png')
    const content: ContentBlock[] = [
      { type: 'image', attachment: first },
      { type: 'text', text: 'caption' },
      { type: 'image', attachment: second },
      { type: 'reasoning', text: 'hidden' },
    ]
    const renderMessageImages = vi.fn<RenderMessageImages>(() => null)
    render(createElement(ConversationNodePresentation, {
      node: { kind: 'user', seq: 1, time: 1, content, source: content },
      renderMessageImages,
      renderTool: vi.fn(),
      t: conversationPresentationTranslate('en'),
    }))

    expect(renderMessageImages).toHaveBeenCalledWith({
      images: [{ attachment: first }, { attachment: second }],
      align: 'end',
    })
    expect(screen.getByText('caption')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Unknown surface event: block/ }))
    expect(screen.getByText(/"type": "reasoning"/)).toBeTruthy()
    expect(renderMessageImages.mock.calls[0]![0].images[0]).toEqual({ attachment: first })
    expect(renderMessageImages.mock.calls[0]![0].images[0]).not.toHaveProperty('preview')
  })

  it('renders unknown keyed nodes through the shared localized JSON fallback', () => {
    render(createElement(ConversationNodePresentation, {
      node: {
        kind: 'unknown', seq: 1, time: 1, type: 'surface/future', data: 'x'.repeat(20_001),
      },
      renderMessageImages: vi.fn(),
      renderTool: vi.fn(),
      t: conversationPresentationTranslate('en'),
    }))

    fireEvent.click(screen.getByRole('button', { name: /Unknown surface event: surface\/future/ }))
    expect(screen.getByText(/truncated.*20003/i)).toBeTruthy()
  })

  it('submits and retains rejected text through the narrow shared InputBar contract', async () => {
    const onSubmit = vi.fn(async () => { throw new Error('Desktop refused') })
    render(createElement(ConversationComposer, {
      snapshot: sessionSnapshot('presentation-session' as SessionId),
      onSubmit,
      t: conversationPresentationTranslate('en'),
    }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'submit me' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(onSubmit).toHaveBeenCalledWith('submit me') })
    expect((input as HTMLTextAreaElement).value).toBe('submit me')
    expect((await screen.findByRole('alert')).textContent).toContain('Desktop refused')
  })

  it('settles a synchronous transport refusal and re-enables the retained draft', async () => {
    const onSubmit = vi.fn(() => { throw new Error('mutation channel unavailable') })
    render(createElement(ConversationComposer, {
      snapshot: sessionSnapshot('presentation-session' as SessionId),
      onSubmit,
      t: conversationPresentationTranslate('en'),
    }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'retry me' } })

    expect(() => { fireEvent.keyDown(input, { key: 'Enter' }) }).not.toThrow()
    await waitFor(() => { expect(input.hasAttribute('disabled')).toBe(false) })
    expect((input as HTMLTextAreaElement).value).toBe('retry me')
  })

  it('uses the same primary action for Desktop-authoritative running state', () => {
    const onCancel = vi.fn()
    render(createElement(ConversationComposer, {
      snapshot: { ...sessionSnapshot('presentation-session' as SessionId), running: true },
      onSubmit: vi.fn(),
      onCancel,
      t: conversationPresentationTranslate('zh'),
    }))
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('places owner-supplied controls in the narrow InputBar tool row', () => {
    render(createElement(ConversationComposer, {
      snapshot: sessionSnapshot('presentation-session' as SessionId),
      onSubmit: vi.fn(),
      tools: createElement('button', { type: 'button' }, 'Attach'),
      t: conversationPresentationTranslate('en'),
    }))

    const tool = screen.getByRole('button', { name: 'Attach' })
    expect(tool.closest('[data-composer-card]')).not.toBeNull()
  })

  it('preserves draft rules across keyboard, composition, paste, and unavailable states', async () => {
    let resolveSubmit: (() => void) | undefined
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve }))
    const view = render(createElement(ConversationComposer, {
      snapshot: sessionSnapshot('presentation-session' as SessionId),
      onSubmit,
      t: conversationPresentationTranslate('en'),
    }))
    const input = screen.getByRole('textbox')

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Z', metaKey: true, shiftKey: true })
    fireEvent.keyDown(input, { key: 'y', ctrlKey: true })
    fireEvent.paste(input, { clipboardData: { getData: () => '' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.compositionEnd(input)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'send once' } })
    fireEvent.keyDown(input, { key: 'Enter', repeat: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(onSubmit).toHaveBeenCalledWith('send once') })
    fireEvent.keyDown(input, { key: 'z', metaKey: true })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.paste(input, { clipboardData: { getData: () => 'busy paste' } })

    resolveSubmit?.()
    await waitFor(() => { expect((input as HTMLTextAreaElement).value).toBe('') })
    view.rerender(createElement(ConversationComposer, {
      snapshot: { ...sessionSnapshot('presentation-session' as SessionId), removed: true },
      onSubmit,
      t: conversationPresentationTranslate('en'),
    }))
    expect(screen.getByPlaceholderText('Session unavailable')).toBeTruthy()
  })
})
