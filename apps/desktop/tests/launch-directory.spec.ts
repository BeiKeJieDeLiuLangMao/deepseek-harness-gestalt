import { describe, expect, it } from 'vitest'
import { launchDirectory, resolveWebHostCwd } from '../src/launch-directory.ts'

describe('launchDirectory', () => {
  it('uses Application Support on macOS and APPDATA on Windows', () => {
    expect(launchDirectory('/Users/ada', 'darwin')).toBe(
      '/Users/ada/Library/Application Support/DeepSeek Gestalt/defaultWorkspace',
    )
    expect(launchDirectory('/Users/ada', 'win32', 'C:\\Users\\ada\\AppData\\Roaming')).toBe(
      'C:\\Users\\ada\\AppData\\Roaming\\DeepSeek Gestalt\\defaultWorkspace',
    )
  })

  it('prefers DSH_DESKTOP_CWD then Launch Directory when requested', () => {
    expect(resolveWebHostCwd({
      packaged: false,
      workspaceRoot: '/repo',
      source: { DSH_DESKTOP_CWD: '/real/sessions' },
    })).toBe('/real/sessions')
    expect(resolveWebHostCwd({
      packaged: false,
      workspaceRoot: '/repo',
      source: { DSH_DESKTOP_USE_LAUNCH_DIRECTORY: '1' },
      home: '/Users/ada',
      platform: 'darwin',
    })).toBe('/Users/ada/Library/Application Support/DeepSeek Gestalt/defaultWorkspace')
    expect(resolveWebHostCwd({
      packaged: false,
      workspaceRoot: '/repo',
      source: {},
    })).toBe('/repo')
  })
})
