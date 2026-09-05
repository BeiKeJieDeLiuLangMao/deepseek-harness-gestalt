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
    () => new PendingQuestion(props.sessionId, props.questions, undefined, {
      key: props.requestKey,
      submit: (kind, answer) => kind === 'answered'
        ? props.answer(answer ?? { answers: [] })
        : props.cancel(),
    }),
    // requestKey is the Host pending identity; a same-key rerender must keep drafts.
    [props.answer, props.cancel, props.requestKey, props.sessionId],
  )
  return <QuestionComposer {...props as QuestionComposerProps} matched={pending} />
}
