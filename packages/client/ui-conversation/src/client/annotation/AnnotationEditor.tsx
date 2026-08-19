import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import css from './AnnotationEditor.module.css'

/**
 * Render the shared anchored note input used by creation and draft editing.
 * @param props - Localized labels, initial note, save/cancel callbacks, and overlay class.
 * @returns The controlled note editor.
 */
export function AnnotationEditor({
  initialNote = '', placeholder, saveLabel, onSave, onCancel, overlay = false,
}: {
  initialNote?: string
  placeholder: string
  saveLabel: string
  onSave: (note: string) => void
  /** Dismiss without saving, e.g. Escape. */
  onCancel?: () => void
  /** Pin the editor to the preview chrome (above the image mask). */
  overlay?: boolean
}) {
  const [note, setNote] = useState(initialNote)
  const composing = useRef(false)
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
    // oxlint-disable-next-line typescript/no-deprecated
    const compositionEnter = composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel?.()
      return
    }
    if (event.key !== 'Enter' || event.shiftKey || compositionEnter) return
    event.preventDefault()
    onSave(note)
  }
  const node = (
    <div className={overlay ? `${css.root} ${css.portal}` : css.root} role="dialog" data-annotation-editor>
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
  return node
}
