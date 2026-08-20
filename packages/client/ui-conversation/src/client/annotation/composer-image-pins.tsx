import { useState } from 'react'
import type { ComposerAttachment, ComposerBarProps, MessageImagePinOverlay } from '../contract/slots.ts'
import type { InputActions, InputState } from '../input/contract.ts'
import { AnnotationEditor } from './AnnotationEditor.tsx'
import type { ImagePinAnnotation } from './model.ts'

/**
 * Composer draft-image pin overlay plus the shared note editor for one opened preview.
 * @param annotations - Current draft items.
 * @param actions - Pin create/update actions; absence disables the overlay.
 * @param t - Composer locale seat.
 * @returns Preview overlay factory, or undefined when pinning is unavailable.
 */
export function useComposerImagePinOverlay(
  annotations: InputState['annotations'] | undefined,
  actions: Pick<InputActions, 'addImagePin' | 'updateImagePin'> | undefined,
  t: ComposerBarProps['t'],
): {
  pinOverlayFor?: (attachment: ComposerAttachment) => MessageImagePinOverlay
} {
  const [editingId, setEditingId] = useState<string | null>(null)
  if (actions === undefined || annotations === undefined) return {}
  const editing = annotations.find((item): item is ImagePinAnnotation => (
    item.kind === 'image-pin' && item.id === editingId
  ))
  return {
    pinOverlayFor: attachment => ({
      pins: annotations.flatMap((item, index) => (
        item.kind === 'image-pin' && item.source === 'composer' && item.imageId === attachment.id
          ? [{ id: item.id, x: item.x, y: item.y, index: index + 1 }]
          : []
      )),
      modeLabel: t('annotation.pinMode'),
      exitLabel: t('annotation.pinModeExit'),
      onPlace: (x, y) => {
        const id = actions.addImagePin(attachment.id, attachment.file.name || t('image.original'), x, y, '')
        setEditingId(id)
      },
      onSelect: (id) => { setEditingId(id) },
      onCloseEditor: () => { setEditingId(null) },
      editor: editing !== undefined && editing.imageId === attachment.id
        ? (
          <AnnotationEditor
            initialNote={editing.note}
            placeholder={t('annotation.notePlaceholder')}
            saveLabel={t('annotation.save')}
            overlay
            onSave={(note) => {
              actions.updateImagePin(editing.id, { note })
              setEditingId(null)
            }}
            onCancel={() => { setEditingId(null) }}
          />
        )
        : undefined,
    }),
  }
}
