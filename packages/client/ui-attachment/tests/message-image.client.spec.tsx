// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { MessageImagesProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ImageGallery, MessageImage } from '../src/MessageImage.tsx'
import type { MessageImageLabels } from '../src/MessageImage.tsx'
import { MessageImages } from '../src/client/MessageImages.tsx'

afterEach(cleanup)

const labels: MessageImageLabels = {
  image: '图片',
  open: '查看原图',
  openNamed: label => `${label}，点击查看原图`,
  loading: '图片加载中…',
  loadFailed: '图片加载失败，点击重试',
  lightbox: { dialog: '原图预览', close: '关闭原图预览' },
}

const attachment = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png' as const,
  bytes: 68,
  width: 640,
  height: 320,
  name: 'history.png',
}

describe('MessageImage', () => {
  it('loads a session-authorized URL, bounds the thumbnail, and clicks into the original', async () => {
    const load = vi.fn().mockResolvedValue('blob:history')
    const view = render(<MessageImage attachment={attachment} load={load} variant="single" labels={labels} />)
    const frame = view.getByRole('button', { name: 'history.png，点击查看原图' })
    expect(frame.getAttribute('style')).toContain('width: 240px')
    expect(frame.getAttribute('style')).toContain('height: 120px')
    expect(frame.getAttribute('title')).toBe('查看原图')
    await waitFor(() => { expect(view.getByAltText('history.png')).toBeTruthy() })
    expect(load).toHaveBeenCalledWith(attachment)
    fireEvent.click(frame)
    expect(view.getByRole('dialog', { name: '原图预览' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '关闭原图预览' }))
    expect(view.queryByRole('dialog', { name: '原图预览' })).toBeNull()
  })

  it('ignores a click while the thumbnail is still loading', () => {
    const load = vi.fn(() => new Promise<string>(() => {}))
    const view = render(<MessageImage attachment={attachment} load={load} variant="single" labels={labels} />)
    const frame = view.getByRole('button', { name: 'history.png，点击查看原图' })
    expect(view.getByText('图片加载中…')).toBeTruthy()
    fireEvent.click(frame)
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('falls back to the image label for an unnamed attachment', async () => {
    const { name: _named, ...unnamed } = attachment
    const load = vi.fn().mockResolvedValue('blob:unnamed')
    const view = render(<MessageImage attachment={unnamed} load={load} variant="single" labels={labels} />)
    await waitFor(() => { expect(view.getByAltText('图片')).toBeTruthy() })
    expect(view.getByRole('button', { name: '图片，点击查看原图' })).toBeTruthy()
  })

  it('surfaces a retry control when durable bytes cannot be read, including a failed retry', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce('blob:retry')
    const view = render(<MessageImage attachment={attachment} load={load} variant="single" labels={labels} />)
    const retry = await view.findByRole('button', { name: '图片加载失败，点击重试' })
    fireEvent.click(retry)
    const retryAgain = await view.findByRole('button', { name: '图片加载失败，点击重试' })
    fireEvent.click(retryAgain)
    await waitFor(() => { expect(view.getByAltText('history.png')).toBeTruthy() })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('clamps extreme aspect ratios and anchors the crop toward the informative edge', async () => {
    const load = vi.fn().mockResolvedValue('blob:ratio')
    const tall = render(
      <MessageImage attachment={{ ...attachment, width: 100, height: 2000 }} load={load} variant="single" labels={labels} />,
    )
    const tallFrame = tall.getByRole('button', { name: 'history.png，点击查看原图' })
    expect(tallFrame.getAttribute('style')).toContain('width: 60px')
    expect(tallFrame.getAttribute('style')).toContain('height: 240px')
    await waitFor(() => { expect(tall.getByAltText('history.png')).toBeTruthy() })
    expect(tall.getByAltText('history.png').style.objectPosition).toBe('center top')
    tall.unmount()
    const wide = render(
      <MessageImage attachment={{ ...attachment, width: 4000, height: 100 }} load={load} variant="single" labels={labels} />,
    )
    const wideFrame = wide.getByRole('button', { name: 'history.png，点击查看原图' })
    expect(wideFrame.getAttribute('style')).toContain('width: 240px')
    expect(wideFrame.getAttribute('style')).toContain('height: 60px')
    await waitFor(() => { expect(wide.getByAltText('history.png')).toBeTruthy() })
    expect(wide.getByAltText('history.png').style.objectPosition).toBe('left center')
    wide.unmount()
    const small = render(
      <MessageImage attachment={{ ...attachment, width: 100, height: 100 }} load={load} variant="single" labels={labels} />,
    )
    const smallFrame = small.getByRole('button', { name: 'history.png，点击查看原图' })
    expect(smallFrame.getAttribute('style')).toContain('width: 100px')
    expect(smallFrame.getAttribute('style')).toContain('height: 100px')
  })

  it('renders a tile at the fixed square without inline sizing', () => {
    const load = vi.fn(() => new Promise<string>(() => {}))
    const view = render(<MessageImage attachment={attachment} load={load} variant="tile" labels={labels} />)
    const frame = view.getByRole('button', { name: 'history.png，点击查看原图' })
    expect(frame.getAttribute('data-variant')).toBe('tile')
    expect(frame.getAttribute('style')).toBeNull()
  })

  it('keeps the tile variant on the failed-load retry control', async () => {
    const load = vi.fn().mockRejectedValue(new Error('offline'))
    const view = render(<MessageImage attachment={attachment} load={load} variant="tile" labels={labels} />)
    const retry = await view.findByRole('button', { name: '图片加载失败，点击重试' })
    expect(retry.getAttribute('data-variant')).toBe('tile')
  })

  it('ignores a load settling after unmount', async () => {
    let resolve: ((url: string) => void) | undefined
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r }))
    const view = render(<MessageImage attachment={attachment} load={load} variant="single" labels={labels} />)
    view.unmount()
    resolve?.('blob:late')
    await Promise.resolve()
    let reject: ((error: Error) => void) | undefined
    const failing = vi.fn(() => new Promise<string>((_r, rej) => { reject = rej }))
    const second = render(<MessageImage attachment={attachment} load={failing} variant="single" labels={labels} />)
    second.unmount()
    reject?.(new Error('late failure'))
    await Promise.resolve()
  })

  it('forwards a pin overlay into the original-image preview', async () => {
    const onPlace = vi.fn()
    const onSelect = vi.fn()
    const onCloseEditor = vi.fn()
    const load = vi.fn().mockResolvedValue('blob:pinned')
    const view = render(
      <MessageImage
        attachment={attachment}
        load={load}
        variant="single"
        labels={labels}
        pinOverlay={{
          pins: [{ id: 'pin-1', x: 20, y: 30, index: 1 }],
          modeLabel: '标注图片',
          exitLabel: '退出标注',
          refuse: '动画 GIF 不能放置标注点',
          onPlace,
          onSelect,
          onCloseEditor,
          editor: <span>note editor</span>,
        }}
      />,
    )
    await waitFor(() => { expect(view.getByAltText('history.png')).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: 'history.png，点击查看原图' }))
    expect(view.getByText('note editor')).toBeTruthy()
    expect(view.getByRole('alert').textContent).toBe('动画 GIF 不能放置标注点')
    fireEvent.click(view.getByRole('button', { name: '标注图片' }))
    expect(view.getByRole('button', { name: '退出标注' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Pin 1' }))
    expect(onSelect).toHaveBeenCalledWith('pin-1')
    fireEvent.click(view.getByRole('button', { name: '关闭原图预览' }))
    expect(onCloseEditor).toHaveBeenCalled()
  })

  it('places a pin when annotate mode is on and no refuse is set', async () => {
    const onPlace = vi.fn()
    const load = vi.fn().mockResolvedValue('blob:place')
    const view = render(
      <MessageImage
        attachment={attachment}
        load={load}
        variant="single"
        labels={labels}
        pinOverlay={{
          pins: [],
          modeLabel: '标注图片',
          exitLabel: '退出标注',
          onPlace,
          onSelect: vi.fn(),
        }}
      />,
    )
    await waitFor(() => { expect(view.getByAltText('history.png')).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: 'history.png，点击查看原图' }))
    fireEvent.click(view.getByRole('button', { name: '标注图片' }))
    const preview = view.getByRole('dialog', { name: '原图预览' })
    const image = within(preview).getByRole('img', { name: 'history.png' })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent.click(image, { clientX: 25, clientY: 40 })
    expect(onPlace).toHaveBeenCalled()
  })
})

describe('ImageGallery', () => {
  it('renders nothing without images and an aligned wrapping group with them', async () => {
    const load = vi.fn().mockResolvedValue('blob:gallery')
    const empty = render(<ImageGallery images={[]} load={load} align="start" labels={labels} />)
    expect(empty.container.firstChild).toBeNull()
    const view = render(
      <ImageGallery images={[{ attachment }, { attachment }]} load={load} align="end" labels={labels} />,
    )
    expect(view.container.querySelector('[data-align="end"]')).not.toBeNull()
    await waitFor(() => { expect(view.getAllByAltText('history.png')).toHaveLength(2) })
  })

  it('renders a lone image large and several images as square tiles', () => {
    const load = vi.fn(() => new Promise<string>(() => {}))
    const lone = render(<ImageGallery images={[{ attachment }]} load={load} align="start" labels={labels} />)
    expect(lone.container.querySelectorAll('[data-variant="single"]')).toHaveLength(1)
    lone.unmount()
    const several = render(
      <ImageGallery images={[{ attachment }, { attachment }, { attachment }]} load={load} align="end" labels={labels} />,
    )
    expect(several.container.querySelectorAll('[data-variant="tile"]')).toHaveLength(3)
  })

  it('forwards a pin overlay only for images that have one', async () => {
    const load = vi.fn().mockResolvedValue('blob:gallery-pin')
    const other = { ...attachment, name: 'other.png' }
    const view = render(
      <ImageGallery
        images={[{ attachment }, { attachment: other }]}
        load={load}
        align="start"
        labels={labels}
        pinOverlayFor={item => (
          item.name === 'history.png'
            ? {
              pins: [],
              modeLabel: '标注图片',
              exitLabel: '退出标注',
              onPlace: () => {},
              onSelect: () => {},
            }
            : undefined
        )}
      />,
    )
    await waitFor(() => { expect(view.getAllByAltText(/png$/)).toHaveLength(2) })
    fireEvent.click(view.getByRole('button', { name: 'history.png，点击查看原图' }))
    expect(view.getByRole('button', { name: '标注图片' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '关闭原图预览' }))
    fireEvent.click(view.getByRole('button', { name: 'other.png，点击查看原图' }))
    expect(view.queryByRole('button', { name: '标注图片' })).toBeNull()
  })

  it('renders the conversation slot entry with translated labels', async () => {
    const t = ((key: string, params?: Readonly<Record<string, unknown>>) => {
      const translated: Record<string, string> = {
        'image.label': '图片',
        'image.openOriginal': '查看原图',
        'image.loading': '图片加载中…',
        'image.loadFailed': '图片加载失败，点击重试',
        'image.preview': '原图预览',
        'image.closePreview': '关闭原图预览',
      }
      if (key === 'image.openOriginalLabel') {
        const label = params?.label
        return `${typeof label === 'string' ? label : ''}，点击查看原图`
      }
      return translated[key] ?? key
    }) as MessageImagesProps['t']
    const loadImage = vi.fn().mockResolvedValue('blob:slot-image')
    const useSession: MessageImagesProps['useSession'] = () => {
      throw new Error('MessageImages does not read the session snapshot')
    }
    const useInput: MessageImagesProps['useInput'] = () => {
      throw new Error('MessageImages does not read the input snapshot')
    }
    const useSessions: MessageImagesProps['useSessions'] = () => {
      throw new Error('MessageImages does not read the session list snapshot')
    }
    const useWorkspaces: MessageImagesProps['useWorkspaces'] = () => {
      throw new Error('MessageImages does not read the workspace list snapshot')
    }
    const props: MessageImagesProps = {
      sessionId: 'message-images-test' as MessageImagesProps['sessionId'],
      useSession,
      useSessions,
      useWorkspaces,
      useProjection: () => undefined,
      useInput,
      inputActions: {
        setDraft: vi.fn(),
        addImages: vi.fn(() => true),
        removeImage: vi.fn(),
        pruneImages: vi.fn(),
        addTextAnnotation: vi.fn(),
        updateTextAnnotation: vi.fn(),
        removeTextAnnotation: vi.fn(),
        discardTextAnnotations: vi.fn(),
        addImagePin: vi.fn(),
        updateImagePin: vi.fn(),
        removeImagePin: vi.fn(),
        submit: vi.fn(),
      },
      images: [{ attachment }],
      loadImage,
      align: 'end',
      t,
    }
    const view = render(<MessageImages {...props} />)
    await waitFor(() => { expect(view.getByAltText('history.png')).toBeTruthy() })
    expect(view.getByRole('button', { name: 'history.png，点击查看原图' })).toBeTruthy()
    expect(view.container.querySelector('[data-align="end"]')).not.toBeNull()
    view.unmount()
    const withOverlay = render(
      <MessageImages
        {...props}
        pinOverlayFor={() => ({
          pins: [],
          modeLabel: '标注图片',
          exitLabel: '退出标注',
          onPlace: () => {},
          onSelect: () => {},
        })}
      />,
    )
    await waitFor(() => { expect(withOverlay.getByAltText('history.png')).toBeTruthy() })
    fireEvent.click(withOverlay.getByRole('button', { name: 'history.png，点击查看原图' }))
    expect(withOverlay.getByRole('button', { name: '标注图片' })).toBeTruthy()
  })
})
