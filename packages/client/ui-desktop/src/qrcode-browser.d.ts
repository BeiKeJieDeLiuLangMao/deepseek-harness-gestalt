declare module 'qrcode/lib/browser.js' {
  import type { QRCode, QRCodeOptions, QRCodeSegment } from 'qrcode'

  /** Create a QR matrix through the dependency's browser-only entry point. */
  export function create(text: string | QRCodeSegment[], options?: QRCodeOptions): QRCode
}
