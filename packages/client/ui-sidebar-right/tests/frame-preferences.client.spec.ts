// @vitest-environment jsdom
/** Official frame settings and read-only legacy width adoption. */
import { afterEach, describe, expect, it } from 'vitest'
import {
  applySidebarRightFramePreferences,
  LEGACY_SIDEBAR_RIGHT_WIDTH_KEY,
  readSidebarRightDesktopEnvironment,
  resolveSidebarRightFramePreferences,
  resolveSidebarRightInitialWidth,
} from '../src/client/frame-preferences.ts'
import { SIDEBAR_RIGHT_PREFERENCES_DEFAULTS } from '../src/client/preferences.ts'

afterEach(() => {
  localStorage.clear()
  document.body.removeAttribute('data-dsh-title-bar-compat')
  document.documentElement.style.removeProperty('--dsh-title-bar-strip')
  document.querySelectorAll('[data-dsh-sidebar-right-custom-css]').forEach((node) => { node.remove() })
})

describe('official Sidebar frame preferences', () => {
  it('resolves standard geometry before shell choices and lets explicit web mode disable it', () => {
    const environment = readSidebarRightDesktopEnvironment(
      '?dsh-desktop-mode=advanced&dsh-desktop-platform=darwin&dsh-desktop-titlebar-inset=24',
    )
    expect(resolveSidebarRightFramePreferences(
      SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
      environment,
      { present: true, height: 31 },
    ).titlebarStrip).toBe(31)
    expect(resolveSidebarRightFramePreferences(
      { ...SIDEBAR_RIGHT_PREFERENCES_DEFAULTS, titleBarScheme: 'web' },
      environment,
      { present: true, height: 31 },
    ).titlebarStrip).toBe(0)
  })

  it('uses the URL inset, then the selected preset or custom inset when standard geometry is absent', () => {
    const none = { present: false, height: 0 }
    expect(resolveSidebarRightFramePreferences(
      SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
      readSidebarRightDesktopEnvironment('?dsh-desktop-titlebar-inset=28'),
      none,
    ).titlebarStrip).toBe(28)
    expect(resolveSidebarRightFramePreferences(
      { ...SIDEBAR_RIGHT_PREFERENCES_DEFAULTS, titleBarScheme: 'preset', titleBarPresetId: 'dsh-desktop' },
      readSidebarRightDesktopEnvironment('?dsh-desktop-mode=advanced&dsh-desktop-platform=darwin'),
      none,
    ).titlebarStrip).toBe(20)
    expect(resolveSidebarRightFramePreferences(
      { ...SIDEBAR_RIGHT_PREFERENCES_DEFAULTS, titleBarScheme: 'custom', titleBarStripPx: 52 },
      readSidebarRightDesktopEnvironment(''),
      none,
    ).titlebarStrip).toBe(52)
  })

  it('owns and removes the frame marker, CSS variable, and custom stylesheet', () => {
    const release = applySidebarRightFramePreferences({ titlebarStrip: 30, customCss: 'html { color: red; }' })
    expect(document.body.hasAttribute('data-dsh-title-bar-compat')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--dsh-title-bar-strip')).toBe('30px')
    expect(document.querySelector('[data-dsh-sidebar-right-custom-css]')?.textContent).toBe('html { color: red; }')
    release()
    expect(document.body.hasAttribute('data-dsh-title-bar-compat')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--dsh-title-bar-strip')).toBe('')
    expect(document.querySelector('[data-dsh-sidebar-right-custom-css]')).toBeNull()
  })

  it('reads the legacy dragged width without changing its rollback key', () => {
    localStorage.setItem(LEGACY_SIDEBAR_RIGHT_WIDTH_KEY, '488')
    expect(resolveSidebarRightInitialWidth(1000, 35)).toBe(488)
    expect(localStorage.getItem(LEGACY_SIDEBAR_RIGHT_WIDTH_KEY)).toBe('488')
    localStorage.setItem(LEGACY_SIDEBAR_RIGHT_WIDTH_KEY, 'invalid')
    expect(resolveSidebarRightInitialWidth(1000, 35)).toBe(350)
  })
})
