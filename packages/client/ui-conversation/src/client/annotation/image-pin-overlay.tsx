import { useState } from 'react'
import type { MessageImagePinOverlay } from '../contract/slots.ts'
import type { InputActions, InputState } from '../input/contract.ts'
import { AnnotationEditor } from './AnnotationEditor.tsx'
import type { ImagePinAnnotation, TextAnnotationId } from './model.ts'

/** Locale keys the pin overlay reads. */
export type ImagePinOverlayTranslate = (
  key:
    | 'annotation.pinMode'
    | 'annotation.pinModeExit'
    | 'annotation.notePlaceholder'
    | 'annotation.save'
    | 'image.original',
) => string

/** Per-surface identity and place-call for one opened preview. */
export interface ImagePinOverlayBinding<T> {
  readonly source: ImagePinAnnotation['source']
  /** @returns Stable image identity used to filter and place pins. */
  imageId(attachment: T): string
  /** @returns Display name, or `fallback` when the attachment has none. */
  imageName(attachment: T, fallback: string): string
  /**
   * @param actions - Live pin-create face.
   * @param attachment - Opened preview target.
   * @param x - Pin X in `[0, 100]`.
   * @param y - Pin Y in `[0, 100]`.
   * @param name - Resolved display name.
   * @returns The minted draft pin id.
   */
  place(
    actions: Pick<InputActions, 'addImagePin'>,
    attachment: T,
    x: number,
    y: number,
    name: string,
  ): TextAnnotationId
}

/**
 * Shared pin overlay for one opened preview, parameterized by image identity.
 * @param annotations - Current draft items.
 * @param actions - Pin create/update actions; absence disables the overlay.
 * @param t - Conversation locale seat.
 * @param binding - Image identity and the surface-specific place call.
 * @returns Preview overlay factory, or undefined when pinning is unavailable.
 */
export function useImagePinOverlay<T>(
  annotations: InputState['annotations'] | undefined,
  actions: Pick<InputActions, 'addImagePin' | 'updateImagePin'> | undefined,
  t: ImagePinOverlayTranslate,
  binding: ImagePinOverlayBinding<T>,
): {
  pinOverlayFor?: (attachment: T) => MessageImagePinOverlay
} {
  const [editingId, setEditingId] = useState<string | null>(null)
  if (actions === undefined || annotations === undefined) return {}
  const editing = annotations.find((item): item is ImagePinAnnotation => (
    item.kind === 'image-pin' && item.id === editingId
  ))
  return {
    pinOverlayFor: (attachment) => {
      const imageId = binding.imageId(attachment)
      return {
        pins: annotations.flatMap((item, index) => (
          item.kind === 'image-pin' && item.source === binding.source && item.imageId === imageId
            ? [{ id: item.id, x: item.x, y: item.y, index: index + 1 }]
            : []
        )),
        modeLabel: t('annotation.pinMode'),
        exitLabel: t('annotation.pinModeExit'),
        onPlace: (x, y) => {
          setEditingId(binding.place(actions, attachment, x, y, binding.imageName(attachment, t('image.original'))))
        },
        onSelect: (id) => { setEditingId(id) },
        onCloseEditor: () => { setEditingId(null) },
        editor: editing !== undefined && editing.imageId === imageId
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
      }
    },
  }
}
