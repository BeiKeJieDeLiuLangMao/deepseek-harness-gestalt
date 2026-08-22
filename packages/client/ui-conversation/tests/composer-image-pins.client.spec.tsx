// @vitest-environment jsdom

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useComposerImagePinOverlay } from '../src/client/annotation/composer-image-pins.tsx'
import type { ImagePinAnnotation } from '../src/client/annotation/model.ts'
import { TextAnnotationId } from '../src/client/annotation/model.ts'
import type { ComposerAttachment, ComposerBarProps } from '../src/client/contract/slots.ts'
import type { DraftAttachmentId, InputActions, InputState } from '../src/client/input/contract.ts'

afterEach(cleanup)

const t = ((key: string): string => {
  const messages: Record<string, string> = {
    'annotation.pinMode': 'Annotate image',
    'annotation.pinModeExit': 'Exit annotation',
    'annotation.notePlaceholder': 'Add an optional note',
    'annotation.save': 'Save annotation',
    'image.original': 'Original image',
  }
  return messages[key] ?? key
}) as ComposerBarProps['t']

const draftId = 'draft-1' as DraftAttachmentId
const otherId = 'draft-2' as DraftAttachmentId

function attachment(id: DraftAttachmentId, name = 'shot.png'): ComposerAttachment {
  return {
    kind: 'image',
    id,
    file: new File([Uint8Array.of(1)], name, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
  }
}

function Bench({
  annotations,
  actions,
  target = attachment(draftId),
}: {
  annotations?: InputState['annotations']
  actions?: Pick<InputActions, 'addImagePin' | 'updateImagePin'>
  target?: ComposerAttachment
}) {
  const overlay = useComposerImagePinOverlay(annotations, actions, t)
  const live = overlay.pinOverlayFor?.(target)
  const other = overlay.pinOverlayFor?.(attachment(otherId, 'other.png'))
  return (
    <div>
      <span data-testid="ready">{overlay.pinOverlayFor === undefined ? 'off' : 'on'}</span>
      {live !== undefined && (
        <>
          <span data-testid="pins">{String(live.pins.length)}</span>
          <span data-testid="mode">{live.modeLabel}</span>
          <button type="button" onClick={() => { live.onPlace(12.5, 80) }}>place</button>
          <button type="button" onClick={() => { live.onSelect(live.pins[0]?.id ?? 'pin-1') }}>select</button>
          <button type="button" onClick={() => { live.onCloseEditor?.() }}>close-editor</button>
          {live.editor}
        </>
      )}
      {other?.editor !== undefined && <span data-testid="other-editor">yes</span>}
    </div>
  )
}

describe('useComposerImagePinOverlay', () => {
  it('stays inert without actions or annotations', () => {
    const actions = { addImagePin: vi.fn(), updateImagePin: vi.fn() }
    expect(render(<Bench />).getByTestId('ready').textContent).toBe('off')
    cleanup()
    expect(render(<Bench actions={actions} />).getByTestId('ready').textContent).toBe('off')
    cleanup()
    expect(render(<Bench annotations={[]} />).getByTestId('ready').textContent).toBe('off')
  })

  it('places a composer pin, edits its note, and ignores a history pin on another image', () => {
    const updateImagePin = vi.fn()
    function Harness() {
      const [annotations, setAnnotations] = useState<InputState['annotations']>([{
        id: TextAnnotationId('text-1'),
        kind: 'text',
        anchor: { sourceId: 'm1', quote: 'passage', prefix: '', suffix: '' },
        note: '',
      }, {
        id: TextAnnotationId('history-1'),
        kind: 'image-pin',
        imageId: draftId,
        source: 'history',
        imageName: 'shot.png',
        x: 1,
        y: 2,
        note: 'history',
      }])
      const actions: Pick<InputActions, 'addImagePin' | 'updateImagePin'> = {
        addImagePin: (imageId, imageName, x, y, note) => {
          const id = TextAnnotationId('pin-1')
          setAnnotations(current => [
            ...current,
            { id, kind: 'image-pin', imageId, source: 'composer', imageName, x, y, note },
          ])
          return id
        },
        updateImagePin: (id, patch) => {
          updateImagePin(id, patch)
          setAnnotations(current => current.map((item) => {
            if (item.id !== id || item.kind !== 'image-pin') return item
            return { ...item, note: patch.note ?? item.note, x: patch.x ?? item.x, y: patch.y ?? item.y }
          }))
        },
      }
      return <Bench annotations={annotations} actions={actions} />
    }
    const view = render(<Harness />)
    expect(view.getByTestId('pins').textContent).toBe('0')
    fireEvent.click(view.getByRole('button', { name: 'place' }))
    expect(view.getByTestId('pins').textContent).toBe('1')
    expect(view.queryByTestId('other-editor')).toBeNull()
    const editor = view.getByPlaceholderText('Add an optional note')
    fireEvent.change(editor, { target: { value: 'this corner' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(updateImagePin).toHaveBeenCalledWith(TextAnnotationId('pin-1'), { note: 'this corner' })
    expect(view.queryByPlaceholderText('Add an optional note')).toBeNull()
  })

  it('reopens an existing composer pin and cancels the editor', () => {
    const pin: ImagePinAnnotation = {
      id: TextAnnotationId('pin-1'),
      kind: 'image-pin',
      imageId: draftId,
      source: 'composer',
      imageName: 'shot.png',
      x: 10,
      y: 20,
      note: 'kept',
    }
    const view = render(<Bench
      annotations={[pin]}
      actions={{ addImagePin: vi.fn(), updateImagePin: vi.fn() }}
    />)
    fireEvent.click(view.getByRole('button', { name: 'select' }))
    const editor = view.getByPlaceholderText('Add an optional note')
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(view.queryByPlaceholderText('Add an optional note')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'select' }))
    expect(view.getByPlaceholderText('Add an optional note')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'close-editor' }))
    expect(view.queryByPlaceholderText('Add an optional note')).toBeNull()
  })

  it('labels an unnamed draft image when placing a pin', () => {
    const addImagePin = vi.fn(() => TextAnnotationId('pin-1'))
    const view = render(<Bench
      annotations={[]}
      actions={{ addImagePin, updateImagePin: vi.fn() }}
      target={attachment(draftId, '')}
    />)
    fireEvent.click(view.getByRole('button', { name: 'place' }))
    expect(addImagePin).toHaveBeenCalledWith(draftId, 'Original image', 12.5, 80, '')
  })
})
