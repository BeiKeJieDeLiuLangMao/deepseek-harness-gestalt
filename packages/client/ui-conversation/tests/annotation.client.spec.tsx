// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  compileAnnotationSubmission, createTextAnchor, resolveTextAnchor, TextAnnotationId,
} from '../src/client/annotation/model.ts'
import { AnnotationEditor } from '../src/client/annotation/AnnotationEditor.tsx'
import { TextAnnotationTarget } from '../src/client/annotation/TextAnnotationTarget.tsx'
import {
  removeDraftHighlightOwner, replaceDraftHighlightRanges,
} from '../src/client/annotation/draft-highlights.ts'
import type { AnnotationSubmissionReservation, SessionInputDeps } from '../src/client/input/facade.ts'
import { SessionInputShell } from '../src/client/input/facade.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('text annotation mechanics', () => {
  it('anchors an exact repeated quotation with surrounding context', () => {
    const source = 'Alpha repeat middle repeat omega.'
    const anchor = createTextAnchor('message-1', source, 'repeat', 20)

    expect(anchor).toEqual({
      sourceId: 'message-1',
      quote: 'repeat',
      prefix: 'Alpha repeat middle ',
      suffix: ' omega.',
    })
    expect(resolveTextAnchor(anchor, source)).toEqual({ start: 20, end: 26 })
    expect(resolveTextAnchor(anchor, 'Alpha repeat middle changed omega.')).toBeNull()
  })

  it('compiles question-first readable prose without an annotation protocol', () => {
    const anchor = createTextAnchor('message-1', 'The exact passage.', 'exact passage', 4)
    const compiled = compileAnnotationSubmission('Please tighten this.', [{
      id: TextAnnotationId('annotation-1'), kind: 'text', anchor, note: '',
    }], {
      heading: n => `Annotation ${n}`,
      quote: value => `Quoted text: “${value}”`,
      note: value => `Note: ${value}`,
    })

    expect(compiled).toBe('Please tighten this.\n\nAnnotation 1\nQuoted text: “exact passage”')
    expect(compiled).not.toMatch(/<annotation|json|respond in/i)
  })

  it('keyboard selection across Markdown shows only annotate/copy before the shared editor', () => {
    const add = vi.fn(() => TextAnnotationId('annotation-1'))
    const view = render(
      <TextAnnotationTarget
        sourceId="message-1:0"
        source="Alpha bold omega"
        annotations={[]}
        add={add}
        t={key => ({
          'annotation.add': 'Add annotation',
          'annotation.copy': 'Copy',
          'annotation.notePlaceholder': 'Optional note',
          'annotation.save': 'Save annotation',
        })[key]}
      >
        <p>Alpha <strong>bold</strong> omega</p>
      </TextAnnotationTarget>,
    )
    const texts = view.container.querySelector('p')!.childNodes
    const range = document.createRange()
    range.setStart(texts[0]!, 0)
    range.setEnd(texts[2]!, 6)
    Object.defineProperty(range, 'getBoundingClientRect', { value: () => ({ left: 20, bottom: 40 }) })
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent(document, new Event('selectionchange'))

    expect(view.getByRole('toolbar').textContent).toBe('Add annotationCopy')
    fireEvent.click(view.getByRole('button', { name: 'Add annotation' }))
    const editor = view.getByPlaceholderText('Optional note')
    fireEvent.change(editor, { target: { value: 'Tighten this' } })
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })
    expect(add).not.toHaveBeenCalled()
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ quote: 'Alpha bold omega' }), 'Tighten this')
  })

  it('defers the composition guard so Safari closing Enter never saves', () => {
    vi.useFakeTimers()
    try {
      const save = vi.fn()
      const view = render(
        <AnnotationEditor placeholder="Optional note" saveLabel="Save annotation" onSave={save} />,
      )
      const editor = view.getByPlaceholderText('Optional note')
      fireEvent.compositionStart(editor)
      fireEvent.compositionEnd(editor)
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(save).not.toHaveBeenCalled()
      vi.advanceTimersByTime(20)
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(save).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('submits annotation-only prose through one owned reservation and clears only after admission', () => {
    const reservations: AnnotationSubmissionReservation[] = []
    const sink = vi.fn<SessionInputDeps['defaultSink']>((...args) => {
      if (args[3] !== undefined) reservations.push(args[3])
    })
    const shell = new SessionInputShell({
      actx: {} as ClientContext,
      defaultSink: sink,
      annotationLabels: {
        heading: index => `Annotation ${index}`,
        quote: value => `Quoted text: “${value}”`,
        note: value => `Note: ${value}`,
      },
    })
    const anchor = createTextAnchor('message-1', 'Exact quotation', 'Exact quotation', 0)
    const id = shell.actions.addTextAnnotation(anchor, '')
    shell.submit()
    expect(sink).toHaveBeenCalledWith('Annotation 1\nQuoted text: “Exact quotation”', [], 'queue', {
      restoreText: '', ids: [id],
    })
    expect(shell.snapshot.annotations).toHaveLength(1)
    const reservation = reservations[0]
    expect(reservation).toBeDefined()
    if (reservation === undefined) throw new Error('annotation submission was not reserved')
    expect(shell.snapshot.annotationSubmitting).toBe(true)
    shell.submit()
    shell.actions.updateTextAnnotation(id, 'must not replace the submitted snapshot')
    shell.actions.removeTextAnnotation(id)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(shell.snapshot.annotations[0]?.note).toBe('')
    shell.settleAnnotationSubmission(reservation, true)
    expect(shell.snapshot.annotations).toEqual([])
    expect(shell.snapshot.annotationSubmitting).toBe(false)
  })

  it('failure releases the reservation without deleting its annotations', () => {
    const reservations: AnnotationSubmissionReservation[] = []
    const sink = vi.fn<SessionInputDeps['defaultSink']>((...args) => {
      if (args[3] !== undefined) reservations.push(args[3])
    })
    const shell = new SessionInputShell({ actx: {} as ClientContext, defaultSink: sink })
    shell.setDraft('Please revise this.')
    const anchor = createTextAnchor('message-1', 'Exact quotation', 'Exact quotation', 0)
    const id = shell.actions.addTextAnnotation(anchor, 'Original note')

    shell.submit()
    const reservation = reservations[0]
    expect(reservation).toBeDefined()
    if (reservation === undefined) throw new Error('annotation submission was not reserved')
    shell.submit()
    shell.setDraft('A later edit must not enter the admitted snapshot.')
    expect(sink).toHaveBeenCalledTimes(1)
    expect(shell.snapshot.draft).toBe('Please revise this.')
    shell.settleAnnotationSubmission(reservation, false)

    expect(shell.snapshot.annotationSubmitting).toBe(false)
    expect(shell.snapshot.annotations).toEqual([{ id, kind: 'text', anchor, note: 'Original note' }])
    shell.actions.updateTextAnnotation(id, 'Retry note')
    shell.submit()
    expect(sink).toHaveBeenCalledTimes(2)
    const retry = reservations[1]
    expect(retry).toBeDefined()
    if (retry === undefined) throw new Error('annotation retry was not reserved')
    shell.settleAnnotationSubmission(reservation, true)
    expect(shell.snapshot.annotationSubmitting).toBe(true)
    expect(shell.snapshot.annotations[0]?.note).toBe('Retry note')
    shell.settleAnnotationSubmission(retry, true)
    expect(shell.snapshot.annotations).toEqual([])
  })

  it('edits and deletes an unsent annotation through the Composer actions', () => {
    const shell = new SessionInputShell({ actx: {} as ClientContext, defaultSink: vi.fn() })
    const anchor = createTextAnchor('message-1', 'Exact quotation', 'Exact quotation', 0)
    const id = shell.actions.addTextAnnotation(anchor, '')

    shell.actions.updateTextAnnotation(id, 'Revised note')
    expect(shell.snapshot.annotations[0]?.note).toBe('Revised note')
    shell.actions.removeTextAnnotation(id)
    expect(shell.snapshot.annotations).toEqual([])
  })

  it('aggregates Draft Marks from multiple mounted text targets without cross-deletion', () => {
    class FakeHighlight {
      readonly ranges: readonly Range[]
      constructor(...ranges: Range[]) { this.ranges = ranges }
    }
    const set = vi.fn()
    const deleteMark = vi.fn()
    vi.stubGlobal('CSS', { highlights: { set, delete: deleteMark } })
    vi.stubGlobal('Highlight', FakeHighlight)
    const firstOwner = {}
    const secondOwner = {}
    const firstRange = document.createRange()
    const secondRange = document.createRange()

    replaceDraftHighlightRanges(firstOwner, [firstRange])
    replaceDraftHighlightRanges(secondOwner, [secondRange])
    expect((set.mock.lastCall?.[1] as FakeHighlight).ranges).toEqual([firstRange, secondRange])

    removeDraftHighlightOwner(firstOwner)
    expect((set.mock.lastCall?.[1] as FakeHighlight).ranges).toEqual([secondRange])
    removeDraftHighlightOwner(secondOwner)
    expect(deleteMark).toHaveBeenLastCalledWith('annotation-draft-mark')
  })

  it('rebuilds a Draft Mark from its Text Anchor after the Markdown target mounts again', () => {
    class FakeHighlight {
      readonly ranges: readonly Range[]
      constructor(...ranges: Range[]) { this.ranges = ranges }
    }
    const set = vi.fn()
    vi.stubGlobal('CSS', { highlights: { set, delete: vi.fn() } })
    vi.stubGlobal('Highlight', FakeHighlight)
    const anchor = createTextAnchor('message-1:0', 'Alpha bold omega', 'bold', 6)

    render(
      <TextAnnotationTarget
        sourceId="message-1:0"
        source="Alpha **bold** omega"
        annotations={[{ id: TextAnnotationId('annotation-1'), kind: 'text', anchor, note: '' }]}
        add={() => TextAnnotationId('unused')}
        t={() => ''}
      >
        <p>Alpha <strong>bold</strong> omega</p>
      </TextAnnotationTarget>,
    )

    const mark = set.mock.lastCall?.[1] as FakeHighlight
    expect(mark.ranges).toHaveLength(1)
    expect(mark.ranges[0]?.toString()).toBe('bold')
  })
})
