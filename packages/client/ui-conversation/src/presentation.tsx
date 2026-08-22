/** Public presentation seam shared by Web compositions that do not mount the Desktop page shell. */

import { useCallback, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import type {
  ConversationSnapshot, PendingWait, TurnErrorNode, TurnMaxTokensNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputEffect, InputState } from './client/input/contract.ts'
import { AssistantMarkdown } from './client/chat/AssistantMarkdown.tsx'
import {
  TurnErrorItem, TurnMaxTokensItem, UserStyleBubble,
} from './client/chat/MessageItem.tsx'
import { ApprovalPanel } from './client/skeleton/ApprovalPanel.tsx'
import { InputBarPresentation } from './client/skeleton/InputBarPresentation.tsx'
import { InputMachine } from './client/input/machine.ts'
import { en, zh } from './client/locales.ts'

/** Locale ids supported by the shared Web presentation. */
export type ConversationPresentationLocale = 'zh' | 'en'

const COMMON = {
  zh: { copy: '复制', copied: '复制成功', loading: '加载中…' },
  en: { copy: 'Copy', copied: 'Copied', loading: 'Loading…' },
} as const

/**
 * Bind the shared conversation dictionaries without constructing a Client Runtime.
 * @param locale - selected product locale.
 * @returns translator accepted by the exported conversation components.
 */
export function conversationPresentationTranslate(
  locale: ConversationPresentationLocale,
): TranslateNS<'conversation'> {
  const dictionary: Record<string, string> = locale === 'zh' ? zh : en
  const common: Record<string, string> = COMMON[locale]
  const translate: TranslateNS<'conversation'> = (key, params) => {
    const template = dictionary[key] ?? common[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : match)
  }
  return translate
}

/** Props for the shared user-message renderer. */
export interface ConversationUserMessageProps {
  /** Desktop-authoritative message content. */
  content: readonly unknown[]
  /** Shared image renderer bound to the current Session's authorized loader. */
  renderMessageImages: Parameters<typeof UserStyleBubble>[0]['renderMessageImages']
  /** Shared conversation translator. */
  t: TranslateNS<'conversation'>
}

/** Render a user message through the same bubble implementation as Desktop. */
export function ConversationUserMessage({ content, renderMessageImages, t }: ConversationUserMessageProps): ReactNode {
  return <UserStyleBubble content={content} renderMessageImages={renderMessageImages} t={t} />
}

/** Props for the shared turn-failure renderer. */
export interface ConversationFailureProps {
  /** Desktop-authoritative turn failure. */
  node: TurnErrorNode | TurnMaxTokensNode
  /** Shared conversation translator. */
  t: TranslateNS<'conversation'>
}

/** Render a terminal turn outcome through the same implementation as Desktop. */
export function ConversationFailure({ node, t }: ConversationFailureProps): ReactNode {
  return node.kind === 'turn-error' ? <TurnErrorItem node={node} t={t} /> : <TurnMaxTokensItem t={t} />
}

/** Props for the shared Approval takeover. */
export interface ConversationApprovalProps {
  /** Desktop-authoritative pending Approval carrier. */
  wait: PendingWait<'approval'>
  /** Current Desktop-authoritative Session projection used to find the paired command. */
  snapshot: ConversationSnapshot
  /** Shared conversation translator. */
  t: TranslateNS<'conversation'>
}

/** Render and settle an Approval through the same composer takeover as Desktop. */
export function ConversationApproval({ wait, snapshot, t }: ConversationApprovalProps): ReactNode {
  const useSession = useCallback(<T,>(selector: (value: ConversationSnapshot) => T): T => selector(snapshot), [snapshot])
  return <ApprovalPanel {...({ matched: wait, useSession, t } as Parameters<typeof ApprovalPanel>[0])} />
}

/** Props for the shared standalone composer adapter. */
export interface ConversationComposerProps {
  /** Desktop-authoritative Session projection controlling run and removal state. */
  snapshot: ConversationSnapshot
  /** Submit one prompt through the composition's authority adapter. */
  onSubmit: (text: string) => void | Promise<void>
  /** Cancel the active Desktop turn when supplied. */
  onCancel?: (() => void) | undefined
  /** Shared conversation translator. */
  t: TranslateNS<'conversation'>
}

/** Execute InputMachine effects for the standalone composer. */
function settleEffects(
  machine: InputMachine,
  effects: readonly InputEffect[],
  publish: () => void,
  onSubmit: ConversationComposerProps['onSubmit'],
): void {
  for (const effect of effects) {
    /* v8 ignore next -- the standalone adapter has no claim owner, so its only non-empty effect is default-sink. */
    if (effect.type !== 'default-sink') continue
    void Promise.resolve(onSubmit(effect.draft)).then(
      () => {
        machine.dispatch({ type: 'submit-settled', attempt: effect.attempt, ok: true })
        publish()
      },
      (cause: unknown) => {
        machine.dispatch({
          type: 'submit-settled', attempt: effect.attempt, ok: false,
          message: cause instanceof Error ? cause.message : String(cause),
        })
        publish()
      },
    )
  }
}

/**
 * Render the standard InputBar over a local InputMachine while delegating submission and cancellation.
 * The adapter owns draft mechanics only; the supplied Session projection remains authoritative for run state.
 */
export function ConversationComposer({ snapshot, onSubmit, onCancel, t }: ConversationComposerProps): ReactNode {
  const machineRef = useRef<InputMachine>()
  const machine = machineRef.current ?? new InputMachine()
  machineRef.current = machine
  const [input, setInput] = useState<InputState>(() => machine.state)
  const publish = useCallback(() => { setInput(machine.state) }, [machine])
  const dispatch = useCallback((event: Parameters<InputMachine['dispatch']>[0]) => {
    const effects = machine.dispatch(event)
    publish()
    settleEffects(machine, effects, publish, onSubmit)
  }, [machine, onSubmit, publish])
  const composing = useRef(false)
  const submit = useCallback(() => { dispatch({ type: 'enter', mode: 'queue' }) }, [dispatch])
  const busy = input.phase === 'adjudicating' || input.phase === 'submitting'
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && event.shiftKey) return
    if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z' || event.key === 'y')) {
      event.preventDefault()
      if (busy || snapshot.removed) return
      dispatch({ type: event.key === 'y' || event.shiftKey ? 'redo' : 'undo' })
      return
    }
    if (event.key !== 'Enter' || composing.current || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (event.repeat || busy || snapshot.removed) return
    submit()
  }
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    if (busy || snapshot.removed) return
    const text = event.clipboardData.getData('text/plain')
    if (text === '') return
    event.preventDefault()
    dispatch({
      type: 'paste-begin',
      text,
      selection: {
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd,
      },
    })
  }
  return (
    <div
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={() => { composing.current = false }}
    >
      <InputBarPresentation
        draft={input.draft}
        phase={input.phase}
        running={snapshot.running}
        busy={busy}
        disabled={snapshot.removed}
        placeholder={t(snapshot.removed ? 'placeholder.unavailable' : 'placeholder.default')}
        onDraftChange={(draft) => { dispatch({ type: 'draft-changed', draft }) }}
        onSubmit={submit}
        onStop={onCancel}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        t={t}
      />
    </div>
  )
}

export { AssistantMarkdown }
export type { AssistantMarkdownProps } from './client/chat/AssistantMarkdown.tsx'
export { InputBarPresentation }
export type { InputBarPresentationProps } from './client/skeleton/InputBarPresentation.tsx'
