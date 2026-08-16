import { readFile } from 'node:fs/promises'

/**
 * Read the image payloads described by an ICO directory.
 * @param {Buffer} ico complete ICO file bytes
 * @returns {Array<{ width: number, height: number, image: Buffer }>}
 */
export function parseIcoFrames(ico) {
  if (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new Error('invalid ICO header')
  }
  const count = ico.readUInt16LE(4)
  const directoryEnd = 6 + count * 16
  if (count === 0 || directoryEnd > ico.length) throw new Error('invalid ICO directory')

  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + index * 16
    const size = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    if (size === 0 || offset < directoryEnd || offset + size > ico.length) {
      throw new Error(`invalid ICO frame ${index + 1}`)
    }
    return {
      width: ico[entry] === 0 ? 256 : ico[entry],
      height: ico[entry + 1] === 0 ? 256 : ico[entry + 1],
      image: ico.subarray(offset, offset + size),
    }
  })
}

/**
 * Require a PE executable to contain every maximum-resolution source ICO payload.
 * @param {Buffer} executable complete Windows executable bytes
 * @param {Buffer} ico complete source ICO file bytes
 * @returns {void}
 */
export function verifyWindowsExecutableIcon(executable, ico) {
  if (executable.length < 64 || executable.subarray(0, 2).toString('ascii') !== 'MZ') {
    throw new Error('invalid PE executable header')
  }
  const peOffset = executable.readUInt32LE(0x3c)
  if (peOffset + 4 > executable.length || executable.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('invalid PE executable signature')
  }

  const frames = parseIcoFrames(ico)
  const largestArea = Math.max(...frames.map(frame => frame.width * frame.height))
  for (const [index, frame] of frames.entries()) {
    if (frame.width * frame.height === largestArea && executable.indexOf(frame.image) === -1) {
      throw new Error(`packaged executable is missing largest ICO frame ${index + 1}`)
    }
  }
}

/**
 * Verify a packaged Windows executable against its source ICO file.
 * @param {string} executablePath packaged executable path
 * @param {string} icoPath source ICO path
 * @returns {Promise<void>}
 */
export async function verifyWindowsExecutableIconFiles(executablePath, icoPath) {
  const [executable, ico] = await Promise.all([readFile(executablePath), readFile(icoPath)])
  verifyWindowsExecutableIcon(executable, ico)
}

if (process.argv[1]?.endsWith('verify-windows-icon.mjs') === true) {
  const [executablePath, icoPath] = process.argv.slice(2)
  if (executablePath === undefined || icoPath === undefined) {
    throw new Error('usage: verify-windows-icon.mjs <executable> <source.ico>')
  }
  await verifyWindowsExecutableIconFiles(executablePath, icoPath)
}
