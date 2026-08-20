// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import type {
  ComposerAttachment, ComposerAttachmentsOwnerProps, ComposerAttachmentsProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ComposerAttachments } from '../src/client/ComposerAttachments.tsx'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = ((key: string, params?: Readonly<Record<string, unknown>>): string => {
  const messages: Record<string, string> = {
    'image.pending': '待发送图片',
    'image.original': '原图',
    'image.preview': '原图预览',
    'image.closePreview': '关闭原图预览',
    'image.openOriginal': '查看原图',
    'image.scrollLeft': '向左滚动图片',
    'image.scrollRight': '向右滚动图片',
    'image.dropBlocked': '当前无法添加图片',
    'image.dropTitle': '图片拖动到此处即可添加',
    'annotation.pinMode': '标注图片',
    'annotation.pinModeExit': '退出标注',
    'annotation.gifRefuse': '动画 GIF 不能放置标注点',
  }
  if (key === 'image.remove') {
    const name = params?.name
    return `移除图片 ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'image.dropDesc') {
    const count = params?.count
    const size = params?.size
    return `最多 ${typeof count === 'number' ? String(count) : ''} 张，每张 ${typeof size === 'string' ? size : ''}`
  }
  return messages[key] ?? key
}) as ComposerAttachmentsProps['t']

function attachment(id: string, name = `${id}.png`): ComposerAttachment {
  return {
    kind: 'image',
    id: id as ComposerAttachment['id'],
    file: new File([Uint8Array.of(1)], name, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
  }
}

function props(overrides: Partial<ComposerAttachmentsOwnerProps> = {}): ComposerAttachmentsProps {
  return {
    attachments: [],
    canAcceptDrop: true,
    onAddImages: () => {},
    onRemoveImage: () => {},
    t,
    ...overrides,
  } as unknown as ComposerAttachmentsProps
}

describe('ComposerAttachments', () => {
  it('accepts file drops anywhere on the document and keeps non-file drags native', () => {
    const onAddImages = vi.fn()
    const view = render(<ComposerAttachments {...props({
      onAddImages,
      dropLimits: { count: 20, size: '5MB' },
    })} />)

    expect(fireEvent.dragEnter(document.body, { dataTransfer: null })).toBe(true)
    const textTransfer = { types: ['text/plain'], files: [], dropEffect: 'none' }
    expect(fireEvent.dragEnter(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(fireEvent.dragOver(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(fireEvent.drop(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(view.queryByRole('status')).toBeNull()

    const image = attachment('dropped').file
    const dataTransfer = { types: ['Files'], files: [image], dropEffect: 'none' }
    expect(fireEvent.dragEnter(document.body, { dataTransfer })).toBe(false)
    expect(view.getByRole('status').textContent).toContain('图片拖动到此处即可添加')
    expect(view.getByRole('status').textContent).toContain('最多 20 张，每张 5MB')
    expect(fireEvent.dragOver(document.body, { dataTransfer })).toBe(false)
    expect(dataTransfer.dropEffect).toBe('copy')
    expect(fireEvent.drop(document.body, { dataTransfer })).toBe(false)
    expect(onAddImages).toHaveBeenCalledWith([image])
    expect(view.queryByRole('status')).toBeNull()
  })

  it('tracks nested file drags and clears an aborted drag', () => {
    const view = render(<ComposerAttachments {...props()} />)
    const dataTransfer = { types: ['Files'], files: [], dropEffect: 'none' }
    fireEvent.dragLeave(document.body, {
      dataTransfer: { types: ['text/plain'], files: [], dropEffect: 'none' },
    })
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 })
    expect(view.getByRole('status')).toBeTruthy()
    fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 })
    expect(view.queryByRole('status')).toBeNull()
    fireEvent.dragEnter(document.documentElement, { dataTransfer })
    const leftViewport = new Event('dragleave', { bubbles: true, cancelable: true })
    Object.defineProperties(leftViewport, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: -1 },
      clientY: { value: 5 },
    })
    fireEvent(document.documentElement, leftViewport)
    expect(view.queryByRole('status')).toBeNull()
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragEnd(window, { dataTransfer })
    expect(view.queryByRole('status')).toBeNull()
  })

  it('shows a blocked drop without forwarding its files', () => {
    const onAddImages = vi.fn()
    const view = render(<ComposerAttachments {...props({ canAcceptDrop: false, onAddImages })} />)
    const image = attachment('blocked').file
    const dataTransfer = { types: ['Files'], files: [image], dropEffect: 'copy' }
    fireEvent.dragEnter(document.body, { dataTransfer })
    expect(view.getByRole('status').textContent).toBe('当前无法添加图片')
    fireEvent.dragOver(document.body, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('none')
    fireEvent.drop(document.body, { dataTransfer })
    expect(onAddImages).not.toHaveBeenCalled()
    expect(view.queryByRole('status')).toBeNull()
  })

  it('routes rail removal and closes previews on Escape or attachment removal', () => {
    const onRemoveImage = vi.fn()
    const image = attachment('draft-1', 'pixel.png')
    const initial = props({ attachments: [image], onRemoveImage })
    const view = render(<ComposerAttachments {...initial} />)

    fireEvent.click(view.getByRole('button', { name: '移除图片 pixel.png' }))
    expect(onRemoveImage).toHaveBeenCalledWith(image.id)
    fireEvent.click(view.getByTitle('查看原图'))
    expect(view.getByRole('dialog', { name: '原图预览' })).toBeTruthy()
    view.rerender(<ComposerAttachments {...props({ attachments: [], onRemoveImage })} />)
    expect(view.queryByRole('dialog', { name: '原图预览' })).toBeNull()

    view.rerender(<ComposerAttachments {...initial} />)
    fireEvent.click(view.getByTitle('查看原图'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(view.queryByRole('dialog', { name: '原图预览' })).toBeNull()
  })

  it('labels an unnamed attachment and its original-image preview', () => {
    const image = attachment('unnamed', '')
    const view = render(<ComposerAttachments {...props({ attachments: [image] })} />)
    expect(view.getByAltText('待发送图片')).toBeTruthy()
    fireEvent.click(view.getByTitle('查看原图'))
    expect(view.getByAltText('原图')).toBeTruthy()
  })

  it('annotates a PNG preview, refuses an animated GIF, and closes the editor', () => {
    const png = attachment('png', 'shot.png')
    const gif = {
      ...attachment('gif', 'animated.gif'),
      file: new File([Uint8Array.of(1)], 'animated.gif', { type: 'image/gif' }),
    }
    const onPlace = vi.fn()
    const onSelect = vi.fn()
    const onCloseEditor = vi.fn()
    const pinOverlayFor = (item: ComposerAttachment) => ({
      pins: item.id === png.id ? [{ id: 'pin-1', x: 20, y: 30, index: 1 }] : [],
      modeLabel: '标注图片',
      exitLabel: '退出标注',
      onPlace,
      onSelect,
      onCloseEditor,
      editor: item.id === png.id ? <span>note editor</span> : undefined,
    })
    const view = render(<ComposerAttachments {...props({ attachments: [png, gif], pinOverlayFor })} />)

    fireEvent.click(view.getAllByTitle('查看原图')[0]!)
    expect(view.getByText('note editor')).toBeTruthy()
    expect(view.queryByRole('alert')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '标注图片' }))
    expect(view.getByRole('button', { name: '退出标注' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Pin 1' }))
    expect(onSelect).toHaveBeenCalledWith('pin-1')
    const preview = view.getByRole('dialog', { name: '原图预览' })
    const image = within(preview).getByRole('img', { name: 'shot.png' })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent.click(image, { clientX: 25, clientY: 40 })
    expect(onPlace).toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '退出标注' }))
    expect(view.getByRole('button', { name: '标注图片' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseEditor).toHaveBeenCalled()
    expect(view.queryByRole('dialog', { name: '原图预览' })).toBeNull()

    fireEvent.click(view.getAllByTitle('查看原图')[1]!)
    fireEvent.click(view.getByRole('button', { name: '标注图片' }))
    expect(view.getByRole('alert').textContent).toBe('动画 GIF 不能放置标注点')
    expect(view.getByRole('button', { name: '标注图片' })).toBeTruthy()
    fireEvent.click(within(view.getByRole('dialog', { name: '原图预览' })).getByRole('img', { name: 'animated.gif' }))
    expect(onPlace).toHaveBeenCalledTimes(1)
  })

  it('omits the annotate control when the overlay factory returns nothing', () => {
    const image = attachment('draft-1', 'pixel.png')
    const view = render(<ComposerAttachments {...props({
      attachments: [image],
      pinOverlayFor: () => undefined,
    })} />)
    fireEvent.click(view.getByTitle('查看原图'))
    expect(view.getByRole('dialog', { name: '原图预览' })).toBeTruthy()
    expect(view.queryByRole('button', { name: '标注图片' })).toBeNull()
  })
})
