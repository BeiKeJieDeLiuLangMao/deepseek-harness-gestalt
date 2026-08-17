import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TextAnchor, TextAnnotation, TextAnnotationId } from './model.ts'
import { createTextAnchor, resolveTextAnchor } from './model.ts'
import { AnnotationEditor } from './AnnotationEditor.tsx'
import { removeDraftHighlightOwner, replaceDraftHighlightRanges } from './draft-highlights.ts'
import css from './TextAnnotationTarget.module.css'

interface PendingSelection {
  anchor: TextAnchor
  range: Range
  left: number
  top: number
}

function rangeForAnchor(container: HTMLElement, anchor: TextAnchor): Range | null {
  const text = container.textContent
  const resolved = resolveTextAnchor(anchor, text)
  if (resolved === null) return null
  const nodes: Text[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node as Text)
  let cursor = 0
  let start: { node: Text; offset: number } | undefined
  let end: { node: Text; offset: number } | undefined
  for (const node of nodes) {
    const next = cursor + node.data.length
    if (start === undefined && resolved.start <= next) start = { node, offset: resolved.start - cursor }
    if (resolved.end <= next) {
      end = { node, offset: resolved.end - cursor }
      break
    }
    cursor = next
  }
  if (start === undefined || end === undefined) return null
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

/**
 * Render one completed-assistant Markdown selection target.
 * @param props - Source text, matching drafts, localized labels, and children.
 * @returns The source with selection actions and Draft Marks.
 */
export function TextAnnotationTarget({ sourceId, source, annotations, add, t, children }: {
  sourceId: string
  source: string
  annotations: readonly TextAnnotation[]
  add: (anchor: TextAnchor, note: string) => TextAnnotationId
  t: (key: 'annotation.add' | 'annotation.copy' | 'annotation.notePlaceholder' | 'annotation.save') => string
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement | null>(null)
  const ranges = useRef(new Map<TextAnnotationId, Range>())
  const highlightOwner = useRef<object>({})
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const container = root.current
    if (container === null) return
    const live = new Set(annotations.map(item => item.id))
    for (const id of ranges.current.keys()) if (!live.has(id)) ranges.current.delete(id)
    for (const annotation of annotations) {
      const current = ranges.current.get(annotation.id)
      if (current !== undefined && container.contains(current.commonAncestorContainer)) continue
      const rebuilt = rangeForAnchor(container, annotation.anchor)
      if (rebuilt !== null) ranges.current.set(annotation.id, rebuilt)
    }
    replaceDraftHighlightRanges(highlightOwner.current, [...ranges.current.values()])
  }, [annotations, source])
  useEffect(() => () => { removeDraftHighlightOwner(highlightOwner.current) }, [])

  const select = useCallback((): void => {
    const container = root.current
    const selection = window.getSelection()
    if (container === null || selection === null || selection.isCollapsed) return
    const dismiss = (): void => {
      setPending(null)
      setEditing(false)
    }
    if (selection.rangeCount !== 1) {
      dismiss()
      return
    }
    const range = selection.getRangeAt(0)
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      dismiss()
      return
    }
    const quote = selection.toString()
    if (quote.trim() === '') {
      dismiss()
      return
    }
    const visible = extractMarkdownPlainText(source)
    const before = document.createRange()
    before.selectNodeContents(container)
    before.setEnd(range.startContainer, range.startOffset)
    const approximate = before.toString().length
    const starts: number[] = []
    for (let at = visible.indexOf(quote); at >= 0; at = visible.indexOf(quote, at + 1)) starts.push(at)
    const start = starts.toSorted((a, b) => Math.abs(a - approximate) - Math.abs(b - approximate))[0]
    if (start === undefined) {
      dismiss()
      return
    }
    const rect = range.getBoundingClientRect()
    setPending({
      anchor: createTextAnchor(sourceId, visible, quote, start),
      range: range.cloneRange(),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      top: rect.bottom + 8,
    })
    setEditing(false)
  }, [source, sourceId])

  useEffect(() => {
    document.addEventListener('selectionchange', select)
    return () => { document.removeEventListener('selectionchange', select) }
  }, [select])

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
      {pending !== null && (
        <div className={css.floating} style={style}>
          {editing ? (
            <AnnotationEditor
              placeholder={t('annotation.notePlaceholder')}
              saveLabel={t('annotation.save')}
              onSave={(note) => {
                const id = add(pending.anchor, note)
                ranges.current.set(id, pending.range)
                setPending(null)
                setEditing(false)
              }}
            />
          ) : (
            <div className={css.toolbar} role="toolbar">
              <button type="button" onMouseDown={keepSelection} onClick={() => { setEditing(true) }}>{t('annotation.add')}</button>
              <button type="button" onMouseDown={keepSelection} onClick={() => {
                if ('clipboard' in navigator) void navigator.clipboard.writeText(pending.anchor.quote)
                setPending(null)
              }}>{t('annotation.copy')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
