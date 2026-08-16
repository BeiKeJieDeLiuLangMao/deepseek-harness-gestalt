import { describe, expect, it } from 'vitest'
import { launchDirectory } from '../src/launch-directory.ts'

describe('launchDirectory', () => {
  it('uses Application Support on macOS and APPDATA on Windows', () => {
    expect(launchDirectory('/Users/ada', 'darwin')).toBe(
      '/Users/ada/Library/Application Support/DeepSeek Gestalt/defaultWorkspace',
    )
    expect(launchDirectory('/Users/ada', 'win32', 'C:\\Users\\ada\\AppData\\Roaming')).toBe(
      'C:\\Users\\ada\\AppData\\Roaming\\DeepSeek Gestalt\\defaultWorkspace',
    )
  })
})
