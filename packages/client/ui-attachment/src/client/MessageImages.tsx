import type { MessageImagesProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { ImageGallery } from '../MessageImage.tsx'
import { messageImageLabels } from './labels.ts'
import { useHistoryImagePinOverlay } from './history-image-pins.tsx'

/** Historical message-image slot entry. */
export function MessageImages({
  images, loadImage, align, compact = false, useInput, inputActions, t,
}: MessageImagesProps) {
  const annotations = useInput(state => state.annotations)
  const pins = useHistoryImagePinOverlay(annotations, inputActions, t)
  return (
    <ImageGallery
      images={images}
      load={loadImage}
      align={align}
      compact={compact}
      labels={messageImageLabels(t)}
      {...(pins.pinOverlayFor === undefined ? {} : { pinOverlayFor: pins.pinOverlayFor })}
    />
  )
}
