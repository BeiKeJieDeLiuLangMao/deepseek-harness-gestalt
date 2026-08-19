import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { InputActions, InputState } from '../input/contract.ts'
import { AnnotationEditor } from './AnnotationEditor.tsx'
import type { ImagePinAnnotation } from './model.ts'

/**
 * History-image pin overlay plus the shared note editor for one opened preview.
 * @param annotations - Current draft items.
 * @param actions - Pin create/update actions; absence disables the overlay.
 * @param t - Conversation locale seat.
 * @returns Gallery overlay factory, or undefined when pinning is unavailable.
 */
export function useHistoryImagePinOverlay(
  annotations: InputState['annotations'],
  actions: Pick<InputActions, 'addImagePin' | 'updateImagePin'> | undefined,
  t: ChatViewSlotProps['t'],
): {
  pinOverlayFor?: (attachment: ImageAttachmentRef) => {
    pins: readonly { id: string; x: number; y: number; index: number }[]
    modeLabel: string
    exitLabel: string
    onPlace: (x: number, y: number) => void
    onSelect: (id: string) => void
    onCloseEditor?: () => void
    editor?: ReactNode
  }
} {
  const [editingId, setEditingId] = useState<string | null>(null)
  if (actions === undefined) return {}
  const editing = annotations.find((item): item is ImagePinAnnotation => (
    item.kind === 'image-pin' && item.id === editingId
  ))
  return {
    pinOverlayFor: attachment => ({
      pins: annotations.flatMap((item, index) => (
        item.kind === 'image-pin' && item.source === 'history' && item.imageId === attachment.attachmentId
          ? [{ id: item.id, x: item.x, y: item.y, index: index + 1 }]
          : []
      )),
      modeLabel: t('annotation.pinMode'),
      exitLabel: t('annotation.pinModeExit'),
      onPlace: (x, y) => {
        const id = actions.addImagePin(
          attachment.attachmentId as never, attachment.name ?? t('image.original'), x, y, '', 'history',
        )
        setEditingId(id)
      },
      onSelect: (id) => { setEditingId(id) },
      onCloseEditor: () => { setEditingId(null) },
      editor: editing !== undefined && editing.imageId === attachment.attachmentId
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
