/** Occupant of `question.presentation`: JSON questions plus a Host submit callback. */
import { useMemo } from 'react'
import {
  PendingQuestion,
  type QuestionComposerProps,
  type QuestionPresentationSlotProps,
} from './contract/slots.ts'
import { QuestionComposer } from './QuestionComposer.tsx'

/**
 * Build the owned PendingQuestion for one Host pending row and render the
 * shared composer. Host `submit` runs before local finish; rejection keeps drafts.
 * @param props - slot owner JSON, submit callback, and the question store/locale seats.
 * @returns the shared question presentation.
 */
export function QuestionPresentationSlot(props: QuestionPresentationSlotProps) {
  const pending = useMemo(
    () => new PendingQuestion(props.sessionId, props.questions, undefined, {
      key: props.requestKey,
      submit: props.submit,
    }),
    // requestKey is the Host pending identity; a same-key rerender must keep drafts.
    [props.requestKey, props.sessionId, props.submit],
  )
  return <QuestionComposer {...props as QuestionComposerProps} matched={pending} />
}
