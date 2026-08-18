import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ImageLightbox.module.css'

function pinPercent(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
    y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
  }
}

/** Lightbox strings the owner resolves from its own locale namespace. */
export interface ImageLightboxLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
}

/** One displayed pin mark in displayed-raster percentages. */
export interface ImageLightboxPin {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly index: number
}

/** Optional Composer annotation overlay for staged-image pins. */
export interface ImageLightboxAnnotation {
  readonly mode: boolean
  readonly pins: readonly ImageLightboxPin[]
  readonly modeLabel: string
  readonly exitLabel: string
  readonly refuse?: string
  readonly onToggleMode: () => void
  readonly onPlace: (x: number, y: number) => void
  readonly onSelect: (id: string) => void
}

/**
 * Document-level original-image preview opened by clicking a thumbnail.
 * Closes on Escape, backdrop press, or the close control, and restores focus
 * to the opener on unmount. Rendered through a body portal: an opener inside
 * a transformed or filtered ancestor would otherwise trap the fixed backdrop
 * in that ancestor's box instead of covering the viewport.
 *
 * @param props.src - the original image URL.
 * @param props.alt - the image's alt text.
 * @param props.labels - dialog and close-control strings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @param props.annotation - optional pin overlay for Composer drafts.
 * @returns the modal preview dialog.
 */
export function ImageLightbox({ src, alt, labels, onClose, annotation }: {
  src: string
  alt: string
  labels: ImageLightboxLabels
  onClose: () => void
  annotation?: ImageLightboxAnnotation
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus()
    }
  }, [onClose])

  const onImageClick = (event: MouseEvent<HTMLImageElement>): void => {
    if (annotation === undefined || !annotation.mode || annotation.refuse !== undefined) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = pinPercent(event.clientX, event.clientY, rect)
    annotation.onPlace(point.x, point.y)
  }

  return createPortal(
    <div
      className={css.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
    >
      <div className={css.mask} aria-hidden="true" onMouseDown={onClose} />
      <div className={css.stage}>
        <img
          className={css.image}
          src={src}
          alt={alt}
          onClick={onImageClick}
        />
        {annotation?.pins.map(pin => (
          <button
            key={pin.id}
            type="button"
            className={css.pin}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            aria-label={`Pin ${pin.index}`}
            onClick={(event) => {
              event.stopPropagation()
              annotation.onSelect(pin.id)
            }}
          >
            {pin.index}
          </button>
        ))}
      </div>
      {annotation !== undefined && (
        <button
          type="button"
          className={css.annotate}
          aria-pressed={annotation.mode}
          aria-label={annotation.mode ? annotation.exitLabel : annotation.modeLabel}
          onClick={annotation.onToggleMode}
        >
          {annotation.mode ? annotation.exitLabel : annotation.modeLabel}
        </button>
      )}
      {annotation?.refuse !== undefined && (
        <p className={css.refuse} role="alert">{annotation.refuse}</p>
      )}
      <button ref={closeRef} type="button" className={css.close} aria-label={labels.close} onClick={onClose}>
        <IconCloseOutline16 size={16} />
      </button>
    </div>,
    document.body,
  )
}
