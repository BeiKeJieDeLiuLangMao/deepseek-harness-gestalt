/** Occupant of `question.presentation`: JSON questions plus Host answer/cancel. */
import { useMemo } from 'react'
import {
  PendingQuestion,
  type QuestionComposerProps,
  type QuestionPresentationSlotProps,
} from './contract/slots.ts'
import { QuestionComposer } from './QuestionComposer.tsx'

/**
 * Build the owned PendingQuestion for one Host pending row and render the
 * shared composer. Host answer/cancel run before local finish; rejection keeps drafts.
 * @param props - slot owner JSON, Host callbacks, and the question store/locale seats.
 * @returns the shared question presentation.
 */
export function QuestionPresentationSlot(props: QuestionPresentationSlotProps) {
  const pending = useMemo(
    () => {
      const value = new PendingQuestion(props.sessionId, props.questions, undefined, {
        key: props.requestKey,
        submit: (kind, answer) => kind === 'answered'
          ? props.answer(answer ?? { answers: [] })
          : props.cancel(),
      })
      // Swallow ASK_CANCELLED: Host cancel owns settlement and this adapter has no local waterfall waiter.
      void value.result.catch(() => {})
      return value
    },
    // requestKey is the Host pending identity; a same-key rerender must keep drafts.
    [props.answer, props.cancel, props.requestKey, props.sessionId],
  )
  const composerProps = {
    sessionId: props.sessionId,
    session: props.useSession(snapshot => snapshot),
    pendingInteraction: props.useSessionPendingInteraction(interactions => interactions.get(props.sessionId)),
    useSession: props.useSession,
    useSessions: props.useSessions,
    useSessionPendingInteraction: props.useSessionPendingInteraction,
    useWorkspaces: props.useWorkspaces,
    useConversation: props.useConversation,
    useChat: props.useChat,
    useTrajectory: props.useTrajectory,
    useProjection: props.useProjection,
    useInput: props.useInput,
    inputActions: props.inputActions,
    useStore: props.useStore,
    actions: props.actions,
    t: props.t,
    matched: pending,
  } satisfies QuestionComposerProps
  return <QuestionComposer {...composerProps} />
}
