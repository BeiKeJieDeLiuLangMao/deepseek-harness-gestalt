import { describe, expect, it } from 'vitest'
import {
  parseIcoFrames,
  verifyWindowsExecutableIcon,
} from '../scripts/verify-windows-icon.mjs'

function ico(frames: Array<{ width: number; height: number; image: Buffer }>): Buffer {
  const directory = Buffer.alloc(6 + frames.length * 16)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(frames.length, 4)
  let offset = directory.length
  for (const [index, frame] of frames.entries()) {
    const entry = 6 + index * 16
    directory[entry] = frame.width === 256 ? 0 : frame.width
    directory[entry + 1] = frame.height === 256 ? 0 : frame.height
    directory.writeUInt32LE(frame.image.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += frame.image.length
  }
  return Buffer.concat([directory, ...frames.map(frame => frame.image)])
}

function pe(...payloads: Buffer[]): Buffer {
  const header = Buffer.alloc(68)
  header.write('MZ')
  header.writeUInt32LE(64, 0x3c)
  header.writeUInt32LE(0x00004550, 64)
  return Buffer.concat([header, ...payloads])
}

describe('Windows executable icon verification', () => {
  it('parses ICO frames and requires every largest frame payload in the executable', () => {
    const small = Buffer.from('small-icon')
    const largestA = Buffer.from('largest-icon-a')
    const largestB = Buffer.from('largest-icon-b')
    const source = ico([
      { width: 32, height: 32, image: small },
      { width: 256, height: 256, image: largestA },
      { width: 256, height: 256, image: largestB },
    ])

    expect(parseIcoFrames(source).map(frame => [frame.width, frame.height, frame.image])).toEqual([
      [32, 32, small],
      [256, 256, largestA],
      [256, 256, largestB],
    ])
    expect(() => {
      verifyWindowsExecutableIcon(pe(largestA, largestB), source)
    }).not.toThrow()
    expect(() => {
      verifyWindowsExecutableIcon(pe(small, largestA), source)
    }).toThrow('largest ICO frame 3')
  })

  it('rejects invalid ICO directories and non-PE executables', () => {
    expect(() => parseIcoFrames(Buffer.from('invalid'))).toThrow('ICO header')
    expect(() => {
      verifyWindowsExecutableIcon(
        Buffer.from('not-pe'),
        ico([{ width: 256, height: 256, image: Buffer.from('frame') }]),
      )
    }).toThrow('PE executable')
  })
})
