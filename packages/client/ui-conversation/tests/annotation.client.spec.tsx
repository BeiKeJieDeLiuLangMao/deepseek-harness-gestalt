// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  compileAnnotationSubmission, createTextAnchor, resolveTextAnchor, TextAnnotationId,
} from '../src/client/annotation/model.ts'
import { TextAnnotationTarget } from '../src/client/annotation/TextAnnotationTarget.tsx'
import {
  removeDraftHighlightOwner, replaceDraftHighlightRanges,
} from '../src/client/annotation/draft-highlights.ts'
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

  it('selection shows only annotate/copy before the shared editor obeys IME and Enter rules', () => {
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
    fireEvent.mouseUp(view.container.querySelector('[data-annotation-source]')!)

    expect(view.getByRole('toolbar').textContent).toBe('Add annotationCopy')
    fireEvent.click(view.getByRole('button', { name: 'Add annotation' }))
    const editor = view.getByPlaceholderText('Optional note')
    fireEvent.change(editor, { target: { value: 'Tighten this' } })
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    expect(add).not.toHaveBeenCalled()
    fireEvent.compositionEnd(editor)
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })
    expect(add).not.toHaveBeenCalled()
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ quote: 'Alpha bold omega' }), 'Tighten this')
  })

  it('submits annotation-only prose through the ordinary sink and clears only after admission', () => {
    const sink = vi.fn()
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
    shell.commitAnnotations([id])
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
