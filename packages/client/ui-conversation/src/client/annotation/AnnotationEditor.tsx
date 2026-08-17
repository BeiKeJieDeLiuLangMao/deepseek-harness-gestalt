import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import css from './AnnotationEditor.module.css'

/**
 * Render the shared anchored note input used by creation and draft editing.
 * @param props - Localized labels, initial note, and save callback.
 * @returns The controlled note editor.
 */
export function AnnotationEditor({ initialNote = '', placeholder, saveLabel, onSave }: {
  initialNote?: string
  placeholder: string
  saveLabel: string
  onSave: (note: string) => void
}) {
  const [note, setNote] = useState(initialNote)
  const composing = useRef(false)
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
    // oxlint-disable-next-line typescript/no-deprecated
    const compositionEnter = composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
    if (event.key !== 'Enter' || event.shiftKey || compositionEnter) return
    event.preventDefault()
    onSave(note)
  }
  return (
    <div className={css.root} role="dialog">
      <textarea
        autoFocus
        value={note}
        placeholder={placeholder}
        onChange={(event) => { setNote(event.target.value) }}
        onKeyDown={onKeyDown}
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={() => {
          // Safari sends the closing Enter after compositionend.
          setTimeout(() => { composing.current = false }, 10)
        }}
      />
      <button type="button" aria-label={saveLabel} onClick={() => { onSave(note) }}>↑</button>
    </div>
  )
}
