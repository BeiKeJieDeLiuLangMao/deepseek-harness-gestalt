// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { BrowserCameraPairingQrScanner } from '../src/personal-pairing.ts'

describe('BrowserCameraPairingQrScanner', () => {
  it('reads one complete QR payload from the browser camera and releases every track', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    const link = 'https://platform.example/pair?challenge=complete-high-entropy-payload'
    const decodeOnceFromStream = vi.fn(async () => ({ getText: () => link }))
    const scanner = new BrowserCameraPairingQrScanner({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      reader: { decodeOnceFromStream },
    })
    const video = document.createElement('video')

    await expect(scanner.scan(video)).resolves.toBe(link)

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    expect(decodeOnceFromStream).toHaveBeenCalledWith(stream, video)
    expect(stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
  })

  it('fails explicitly when browser camera APIs are unavailable', async () => {
    const scanner = new BrowserCameraPairingQrScanner({
      reader: { decodeOnceFromStream: vi.fn() },
    })

    await expect(scanner.scan(document.createElement('video')))
      .rejects.toThrow('Camera scanning is not supported by this browser')
  })

  it('reports camera denial without starting the QR decoder', async () => {
    const denial = new DOMException('denied', 'NotAllowedError')
    const decodeOnceFromStream = vi.fn()
    const scanner = new BrowserCameraPairingQrScanner({
      mediaDevices: {
        getUserMedia: vi.fn(async () => await Promise.reject(denial)),
      } as unknown as MediaDevices,
      reader: { decodeOnceFromStream },
    })

    await expect(scanner.scan(document.createElement('video')))
      .rejects.toThrow('Camera permission was denied')
    expect(decodeOnceFromStream).not.toHaveBeenCalled()
  })

  it('rejects an empty decoded QR value and releases the camera', async () => {
    const stop = vi.fn()
    const scanner = new BrowserCameraPairingQrScanner({
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] } as unknown as MediaStream)),
      } as unknown as MediaDevices,
      reader: { decodeOnceFromStream: vi.fn(async () => ({ getText: () => '' })) },
    })

    await expect(scanner.scan(document.createElement('video')))
      .rejects.toThrow('QR payload must be non-empty')
    expect(stop).toHaveBeenCalledOnce()
  })

  it('settles cancellation even when the decoder is still waiting for a QR value', async () => {
    const stop = vi.fn()
    const controller = new AbortController()
    const scanner = new BrowserCameraPairingQrScanner({
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] } as unknown as MediaStream)),
      } as unknown as MediaDevices,
      reader: {
        decodeOnceFromStream: vi.fn(async () => await new Promise<{ getText(): string }>(() => {})),
      },
    })
    const scanning = scanner.scan(document.createElement('video'), controller.signal)

    controller.abort()

    await expect(scanning).rejects.toThrow('camera scan was cancelled')
    expect(stop).toHaveBeenCalled()
  })
})
