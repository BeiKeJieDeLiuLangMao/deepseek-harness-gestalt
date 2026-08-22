// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_CHAT_SNAPSHOT,
  EMPTY_CONVERSATION_VIEWS,
  type ConversationSnapshot,
  type SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  ConversationComposer,
  conversationPresentationTranslate,
} from '../src/presentation.tsx'

afterEach(cleanup)

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    sessionId: 'presentation-session' as SessionId,
    views: EMPTY_CONVERSATION_VIEWS,
    chat: EMPTY_CHAT_SNAPSHOT,
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    ...overrides,
  }
}

describe('public conversation presentation seam', () => {
  it('submits and retains rejected text through the narrow shared InputBar contract', async () => {
    const onSubmit = vi.fn(async () => { throw new Error('Desktop refused') })
    render(createElement(ConversationComposer, {
      snapshot: snapshot(),
      onSubmit,
      t: conversationPresentationTranslate('en'),
    }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'submit me' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(onSubmit).toHaveBeenCalledWith('submit me') })
    expect((input as HTMLTextAreaElement).value).toBe('submit me')
    expect(document.querySelector('[data-input-backdrop]')?.textContent).toContain('submit me')
  })

  it('uses the same primary action for Desktop-authoritative running state', () => {
    const onCancel = vi.fn()
    render(createElement(ConversationComposer, {
      snapshot: snapshot({ running: true }),
      onSubmit: vi.fn(),
      onCancel,
      t: conversationPresentationTranslate('zh'),
    }))
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
