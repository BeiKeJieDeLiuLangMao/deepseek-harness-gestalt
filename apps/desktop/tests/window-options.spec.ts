import { describe, expect, it } from 'vitest'
import { windowChromeOptions } from '../src/window-options.ts'

describe('windowChromeOptions', () => {
  it('keeps macOS traffic-light options off Windows', () => {
    expect(windowChromeOptions('darwin')).toEqual({
      frame: false,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 8 },
    })
    expect(windowChromeOptions('win32')).toEqual({ frame: false })
  })

  it('keeps a system frame on unsupported desktop platforms', () => {
    expect(windowChromeOptions('linux')).toEqual({ frame: true })
  })
})
