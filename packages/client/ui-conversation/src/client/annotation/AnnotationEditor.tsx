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
    if (event.key !== 'Enter' || event.shiftKey || composing.current || event.nativeEvent.isComposing) return
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
        onCompositionEnd={() => { composing.current = false }}
      />
      <button type="button" aria-label={saveLabel} onClick={() => { onSave(note) }}>↑</button>
    </div>
  )
}
