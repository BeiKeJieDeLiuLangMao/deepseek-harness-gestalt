import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import {
  CHROME_OVERLAY_SHOW, DESKTOP_OVERLAY_PARAM,
  UPDATER_CHECK_NOW, UPDATER_DOWNLOAD_NOW, UPDATER_GET_STATUS,
  UPDATER_QUIT_AND_INSTALL, UPDATER_STATUS_CHANGED,
  WINDOW_CLOSE, WINDOW_MAXIMIZE, WINDOW_MINIMIZE,
} from '../src/protocol.ts'

describe('host half and protocol', () => {
  it('exports a no-op host apply and the updater channel names', () => {
    apply()
    expect(UPDATER_GET_STATUS).toBe('updater:getStatus')
    expect(UPDATER_CHECK_NOW).toBe('updater:checkNow')
    expect(UPDATER_DOWNLOAD_NOW).toBe('updater:downloadNow')
    expect(UPDATER_QUIT_AND_INSTALL).toBe('updater:quitAndInstall')
    expect(UPDATER_STATUS_CHANGED).toBe('updater:status-changed')
    expect(WINDOW_MINIMIZE).toBe('window:minimize')
    expect(WINDOW_MAXIMIZE).toBe('window:maximize')
    expect(WINDOW_CLOSE).toBe('window:close')
    expect(CHROME_OVERLAY_SHOW).toBe('chrome:overlayShow')
    expect(DESKTOP_OVERLAY_PARAM).toBe('dsh-desktop-overlay')
  })
})
