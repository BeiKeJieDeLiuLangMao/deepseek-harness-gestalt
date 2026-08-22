import type { ComposerAttachment, ComposerBarProps, MessageImagePinOverlay } from '../contract/slots.ts'
import type { InputActions, InputState } from '../input/contract.ts'
import { useImagePinOverlay } from './image-pin-overlay.tsx'

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
  return useImagePinOverlay(annotations, actions, t, {
    source: 'composer',
    imageId: attachment => attachment.id,
    imageName: (attachment, fallback) => attachment.file.name || fallback,
    place: (live, attachment, x, y, name) => live.addImagePin(attachment.id, name, x, y, ''),
  })
}
