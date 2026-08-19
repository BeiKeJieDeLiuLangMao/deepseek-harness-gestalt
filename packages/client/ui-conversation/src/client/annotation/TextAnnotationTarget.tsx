import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { MarkdownSelectionMapRef } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TextAnchor, TextAnnotation, TextAnnotationId } from './model.ts'
import { createTextAnchor } from './model.ts'
import { AnnotationEditor } from './AnnotationEditor.tsx'
import { removeDraftHighlightOwner, replaceDraftHighlightRanges } from './draft-highlights.ts'
import css from './TextAnnotationTarget.module.css'
interface PendingSelection {
  anchor: TextAnchor
  range: Range
  left: number
  top: number
}

/** Viewport placement of one anchored floating surface, clamped away from the viewport edges. */
function place(range: Range): { left: number; top: number } {
  const rect = range.getBoundingClientRect()
  return {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
    top: rect.bottom + 8,
  }
}

function rangeForAnchor(
  selectionMapRef: MarkdownSelectionMapRef,
  anchor: TextAnchor,
): Range | null {
  return selectionMapRef.current?.rangeForText(anchor) ?? null
}

/**
 * Render one completed-assistant Markdown selection target.
 * @param props - Source identity, renderer mapping, matching drafts, localized labels, and children.
 * @returns The source with selection actions and Draft Marks.
 */
export function TextAnnotationTarget({ sourceId, selectionMapRef, annotations, add, t, children }: {
  sourceId: string
  selectionMapRef: MarkdownSelectionMapRef
  annotations: readonly TextAnnotation[]
  add: (anchor: TextAnchor, note: string) => TextAnnotationId
  t: (key: 'annotation.add' | 'annotation.copy' | 'annotation.notePlaceholder' | 'annotation.save' | 'annotation.staleAnchor') => string
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement | null>(null)
  const floating = useRef<HTMLDivElement | null>(null)
  const editingRef = useRef(false)
  const ranges = useRef(new Map<TextAnnotationId, Range>())
  const highlightOwner = useRef<object>({})
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [editing, setEditing] = useState(false)
  const [stale, setStale] = useState<readonly TextAnnotation[]>([])

  useEffect(() => {
    const container = root.current
    if (container === null) return
    const live = new Set(annotations.map(item => item.id))
    for (const id of ranges.current.keys()) if (!live.has(id)) ranges.current.delete(id)
    const unresolved: TextAnnotation[] = []
    for (const annotation of annotations) {
      const current = ranges.current.get(annotation.id)
      if (current !== undefined && container.contains(current.commonAncestorContainer)) continue
      const rebuilt = rangeForAnchor(selectionMapRef, annotation.anchor)
      if (rebuilt !== null) ranges.current.set(annotation.id, rebuilt)
      else unresolved.push(annotation)
    }
    // A present selection map that fails to resolve an anchor marks it stale
    // or ambiguous; an absent map (renderer not mounted yet) adjudicates
    // nothing. Identity-stable writes keep this effect render-neutral.
    const nextStale = selectionMapRef.current === null ? [] : unresolved
    setStale(prev => prev.length === nextStale.length
      && prev.every((item, index) => item === nextStale[index])
      ? prev
      : nextStale)
    replaceDraftHighlightRanges(highlightOwner.current, [...ranges.current.values()])
  }, [annotations, selectionMapRef])
  useEffect(() => () => { removeDraftHighlightOwner(highlightOwner.current) }, [])

  const select = useCallback((): void => {
    const container = root.current
    const selection = window.getSelection()
    if (container === null || selection === null) return
    const dismiss = (): void => {
      editingRef.current = false
      setPending(null)
      setEditing(false)
    }
    const keepEditor = editingRef.current
      && floating.current !== null
      && document.activeElement !== null
      && floating.current.contains(document.activeElement)
    if (selection.isCollapsed || selection.rangeCount !== 1) {
      if (!keepEditor) dismiss()
      return
    }
    const range = selection.getRangeAt(0)
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      dismiss()
      return
    }
    const inspected = selectionMapRef.current?.inspect(range)
    if (inspected === null || inspected === undefined) {
      dismiss()
      return
    }
    const quote = inspected.quote
    if (quote.trim() === '') {
      dismiss()
      return
    }
    const rect = place(range)
    setPending({
      anchor: createTextAnchor(sourceId, inspected.projection, quote, inspected.start),
      range: range.cloneRange(),
      left: rect.left,
      top: rect.top,
    })
    setEditing(false)
  }, [selectionMapRef, sourceId])

  useEffect(() => {
    document.addEventListener('selectionchange', select)
    return () => { document.removeEventListener('selectionchange', select) }
  }, [select])

  // While a pending selection is open, its floating surface follows the
  // anchor: scroll (capture: scroll events never bubble) and resize recompute
  // the placement on the next animation frame.
  const pendingOpen = pending !== null
  useEffect(() => {
    if (!pendingOpen) return
    const dismissOutside = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (floating.current?.contains(target) === true) return
      editingRef.current = false
      setPending(null)
      setEditing(false)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => { document.removeEventListener('pointerdown', dismissOutside, true) }
  }, [pendingOpen])
  useEffect(() => {
    if (!pendingOpen) return
    let frame = 0
    const follow = (): void => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setPending(current => current === null ? current : { ...current, ...place(current.range) })
      })
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [pendingOpen])

  const style = pending === null ? undefined : {
    '--annotation-left': `${pending.left}px`,
    '--annotation-top': `${pending.top}px`,
  } as CSSProperties
  const keepSelection = (event: MouseEvent<HTMLButtonElement>): void => { event.preventDefault() }
  return (
    <div
      ref={root}
      className={css.target}
      onMouseUp={select}
      data-annotation-source={sourceId}
    >
      {children}
      {stale.length > 0 && (
        <p role="alert" className={css.staleAnchor}>{t('annotation.staleAnchor')}</p>
      )}
      {pending !== null && (
        <div ref={floating} className={css.floating} style={style}>
          {editing ? (
            <AnnotationEditor
              placeholder={t('annotation.notePlaceholder')}
              saveLabel={t('annotation.save')}
              onSave={(note) => {
                const id = add(pending.anchor, note)
                ranges.current.set(id, pending.range)
                editingRef.current = false
                setPending(null)
                setEditing(false)
              }}
              onCancel={() => {
                editingRef.current = false
                setPending(null)
                setEditing(false)
              }}
            />
          ) : (
            <div className={css.toolbar} role="toolbar">
              <button type="button" onMouseDown={keepSelection} onClick={() => {
                editingRef.current = true
                setEditing(true)
              }}>{t('annotation.add')}</button>
              <button type="button" onMouseDown={keepSelection} onClick={() => {
                if ('clipboard' in navigator) void navigator.clipboard.writeText(pending.anchor.quote)
                editingRef.current = false
                setPending(null)
              }}>{t('annotation.copy')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
