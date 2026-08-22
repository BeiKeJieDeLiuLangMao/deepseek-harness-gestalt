// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_CHAT_SNAPSHOT,
  EMPTY_CONVERSATION_VIEWS,
  type ConversationSnapshot,
  type SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { InputBarProps } from '../src/client/skeleton/InputBar.tsx'

let inputBarProps: InputBarProps | undefined

vi.mock('../src/client/skeleton/InputBar.tsx', () => ({
  InputBar: (props: InputBarProps): ReactNode => {
    inputBarProps = props
    return createElement('div', { 'data-input-bar': '' })
  },
}))

import {
  ConversationComposer,
  conversationPresentationTranslate,
} from '../src/presentation.tsx'

afterEach(() => {
  cleanup()
  inputBarProps = undefined
})

const snapshot: ConversationSnapshot = {
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
}

describe('public conversation presentation seam', () => {
  it('supplies the exact InputBar adapter without enabling Desktop-only attachment and annotation owners', async () => {
    const onSubmit = vi.fn(async () => { throw new Error('Desktop refused') })
    render(createElement(ConversationComposer, {
      snapshot,
      onSubmit,
      t: conversationPresentationTranslate('en'),
    }))
    const props = inputBarProps
    if (props === undefined || props.inputActions === undefined || props.keyboard === undefined) {
      throw new Error('expected the shared InputBar adapter')
    }

    expect(props.inputActions.addImages([])).toBe(false)
    props.inputActions.removeImage('missing' as never)
    props.inputActions.pruneImages([])
    expect(() => props.inputActions?.addTextAnnotation({} as never, 'note')).toThrow('does not own annotations')
    props.inputActions.updateTextAnnotation('missing' as never, 'note')
    props.inputActions.removeTextAnnotation('missing' as never)
    props.inputActions.discardTextAnnotations()
    expect(() => props.inputActions?.addImagePin('missing' as never, 'x', 0, 0, '')).toThrow('does not own image pins')
    props.inputActions.updateImagePin('missing' as never, {})
    props.inputActions.removeImagePin('missing' as never)

    act(() => {
      props.keyboard?.setDraft('draft')
      props.keyboard?.setDraft('edit', { start: 0, end: 1, insertedLength: 1 })
      props.keyboard?.undo()
      props.keyboard?.redo()
      props.keyboard?.steerQueue()
      props.keyboard?.pasteBegin('plain', { start: 0, end: 0 })
      props.keyboard?.pasteBegin('rich', { start: 0, end: 0 }, [], 1)
      props.keyboard?.invalidatePaste()
      props.keyboard?.track('rich', 4)
      props.keyboard?.dismissPopup()
    })
    expect(props.keyboard.arbitrate('enter', false)).toBe('pass')
    expect(props.keyboard.space()).toBe(false)
    expect(props.keyboard.snapshot).toBeDefined()
    expect(props.resolveSubmitMode(false, 'enter', true)).toBe('queue')
    expect(props.useNotices(value => value)).toBeNull()
    expect(props.useLexicon(value => value).size).toBe(0)
    expect(props.useMenuLauncher(value => value)).toBeNull()
    expect(props.useProjection('plan')).toBeUndefined()
    expect(props.renderSlot('conversation.input.plan', { locked: false })).toBeNull()

    act(() => {
      props.inputActions?.setDraft('submit me')
      props.inputActions?.submit()
    })
    await act(async () => { await Promise.resolve() })
    expect(onSubmit).toHaveBeenCalledWith('submit me')
  })
})
