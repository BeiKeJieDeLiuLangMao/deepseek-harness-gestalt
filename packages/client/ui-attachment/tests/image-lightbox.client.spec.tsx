// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ImageLightbox } from '../src/ImageLightbox.tsx'

afterEach(cleanup)

const labels = { dialog: '原图预览', close: '关闭原图预览' }

describe('ImageLightbox', () => {
  it('focuses its close control, closes by button and Escape, and restores focus', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()
    const view = render(<ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={onClose} />)
    const close = view.getByRole('button', { name: '关闭原图预览' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('tolerates a focus owner it cannot restore (no active element at mount)', () => {
    // jsdom always reports body as the fallback active element; stub the
    // element-less state a detached focus can leave.
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => null })
    try {
      const view = render(<ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={vi.fn()} />)
      view.unmount()
    } finally {
      delete (document as { activeElement?: unknown }).activeElement
    }
  })

  it('closes on a mask press but not on a press over the image', () => {
    const onClose = vi.fn()
    const view = render(<ImageLightbox src="blob:original" alt="原图" labels={labels} onClose={onClose} />)
    fireEvent.mouseDown(view.getByRole('img'))
    expect(onClose).not.toHaveBeenCalled()
    const mask = document.querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.mouseDown(mask)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('places a pin from the latest annotation mode after the toggle rerender', () => {
    const onPlace = vi.fn()
    const annotation = {
      mode: false,
      pins: [],
      modeLabel: 'Annotate image',
      exitLabel: 'Exit annotation',
      onToggleMode: () => {},
      onPlace,
      onSelect: () => {},
    }
    const view = render(
      <ImageLightbox src="blob:original" alt="shot.png" labels={labels} onClose={vi.fn()} annotation={annotation} />,
    )
    fireEvent.click(view.getByRole('img', { name: 'shot.png' }))
    expect(onPlace).not.toHaveBeenCalled()
    view.rerender(
      <ImageLightbox
        src="blob:original"
        alt="shot.png"
        labels={labels}
        onClose={vi.fn()}
        annotation={{ ...annotation, mode: true }}
      />,
    )
    fireEvent.click(view.getByRole('img', { name: 'shot.png' }), { clientX: 25, clientY: 40 })
    expect(onPlace).toHaveBeenCalled()
  })

  it('pins a click, refuses a new mark, and keeps pin selection on the overlay', () => {
    const onPlace = vi.fn()
    const onSelect = vi.fn()
    const view = render(
      <ImageLightbox
        src="blob:original"
        alt="shot.png"
        labels={labels}
        onClose={vi.fn()}
        annotation={{
          mode: true,
          pins: [{ id: 'pin-1', x: 20, y: 30, index: 1 }],
          modeLabel: 'Annotate image',
          exitLabel: 'Exit annotation',
          refuse: 'Cannot add another pin',
          onToggleMode: () => {},
          onPlace,
          onSelect,
        }}
      />,
    )
    const image = view.getByRole('img', { name: 'shot.png' })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent.click(image, { clientX: 10, clientY: 10 })
    expect(onPlace).not.toHaveBeenCalled()
    expect(view.getByRole('alert').textContent).toBe('Cannot add another pin')

    const pin = view.getByRole('button', { name: 'Pin 1' })
    fireEvent.pointerDown(pin)
    fireEvent.click(pin)
    expect(onSelect).toHaveBeenCalledWith('pin-1')
  })

  it('places a pin at 0% when the displayed raster has no size', () => {
    const onPlace = vi.fn()
    const view = render(
      <ImageLightbox
        src="blob:original"
        alt="shot.png"
        labels={labels}
        onClose={vi.fn()}
        annotation={{
          mode: true,
          pins: [],
          modeLabel: 'Annotate image',
          exitLabel: 'Exit annotation',
          onToggleMode: () => {},
          onPlace,
          onSelect: () => {},
        }}
      />,
    )
    const image = view.getByRole('img', { name: 'shot.png' })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 0, height: 10, top: 0, left: 0, bottom: 10, right: 0, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent.click(image, { clientX: 4, clientY: 6 })
    expect(onPlace).toHaveBeenCalledWith(0, 0)

    onPlace.mockClear()
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 20, height: 0, top: 0, left: 0, bottom: 0, right: 20, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent.click(image, { clientX: 4, clientY: 6 })
    expect(onPlace).toHaveBeenCalledWith(0, 0)

    onPlace.mockClear()
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 50, top: 0, left: 0, bottom: 50, right: 100, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent.click(image, { clientX: 25, clientY: 10 })
    expect(onPlace).toHaveBeenCalledWith(25, 20)
  })
})
