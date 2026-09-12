/** Official frame adaptation derived from global Sidebar preferences. */
import type { SidebarRightPreferences } from './preferences.ts'

/** Browser-reported Window Controls Overlay geometry. */
export interface SidebarRightWindowControlsOverlaySnapshot {
  readonly present: boolean
  readonly height: number
}

/** Desktop shell facts read from the official URL/preload markers. */
export interface SidebarRightDesktopEnvironment {
  readonly mode: 'compatibility' | 'advanced' | null
  readonly platform: string | null
  readonly titlebarInset: number
}

/** Resolved frame adaptation applied for one preference snapshot. */
export interface SidebarRightFramePreferences {
  readonly titlebarStrip: number
  readonly customCss: string
}

interface WindowControlsOverlaySource {
  readonly visible: boolean
  getTitlebarAreaRect(): { readonly height: number }
  addEventListener(type: 'geometrychange', listener: () => void): void
  removeEventListener(type: 'geometrychange', listener: () => void): void
}

const WCO_NONE: SidebarRightWindowControlsOverlaySnapshot = Object.freeze({ present: false, height: 0 })
const wcoListeners = new Set<() => void>()
let wcoSource: WindowControlsOverlaySource | undefined
let wcoListener: (() => void) | undefined
let wcoSnapshot = WCO_NONE

function readWindowControlsOverlay(): SidebarRightWindowControlsOverlaySnapshot {
  if (wcoSource === undefined || !wcoSource.visible) return WCO_NONE
  try {
    const height = Math.round(wcoSource.getTitlebarAreaRect().height)
    return { present: true, height: Number.isFinite(height) && height > 0 ? height : 0 }
  } catch {
    // A racy browser geometry provider vouches for no inset until its next event.
    return WCO_NONE
  }
}

function detachWindowControlsOverlay(): void {
  if (wcoSource !== undefined && wcoListener !== undefined) {
    wcoSource.removeEventListener('geometrychange', wcoListener)
  }
  wcoListener = undefined
  wcoSource = undefined
  wcoSnapshot = WCO_NONE
}

/**
 * Observe Window Controls Overlay geometry, attaching one native listener for
 * all official workbench renders.
 * @param listener - invalidation callback.
 * @returns disposer.
 */
export function subscribeSidebarRightWindowControlsOverlay(listener: () => void): () => void {
  wcoListeners.add(listener)
  if (wcoSource === undefined && typeof navigator !== 'undefined') {
    wcoSource = (navigator as unknown as { windowControlsOverlay?: WindowControlsOverlaySource }).windowControlsOverlay
    if (wcoSource !== undefined) {
      wcoListener = () => {
        wcoSnapshot = readWindowControlsOverlay()
        for (const notify of [...wcoListeners]) notify()
      }
      wcoSnapshot = readWindowControlsOverlay()
      wcoSource.addEventListener('geometrychange', wcoListener)
    }
  }
  return () => {
    wcoListeners.delete(listener)
    if (wcoListeners.size === 0) detachWindowControlsOverlay()
  }
}

/**
 * Read the current Window Controls Overlay geometry.
 * @returns current geometry snapshot.
 */
export function getSidebarRightWindowControlsOverlay(): SidebarRightWindowControlsOverlaySnapshot {
  return wcoSnapshot
}

/**
 * Read immutable desktop shell markers.
 * @param search - URL search string; defaults to the active page.
 * @returns normalized environment facts.
 */
export function readSidebarRightDesktopEnvironment(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): SidebarRightDesktopEnvironment {
  const params = new URLSearchParams(search.replace(/^\?/, ''))
  const modeValue = params.get('dsh-desktop-mode')
  const mode = modeValue === 'advanced' || modeValue === 'compatibility' ? modeValue : null
  const platformValue = params.get('dsh-desktop-platform')
  const insetValue = Number(params.get('dsh-desktop-titlebar-inset'))
  return {
    mode,
    platform: platformValue === null || platformValue === '' ? null : platformValue.toLowerCase(),
    titlebarInset: Number.isFinite(insetValue)
      ? Math.min(120, Math.max(0, Math.round(insetValue)))
      : 0,
  }
}

/** Built-in DSH Desktop preset inset when standard geometry is absent. */
function presetStrip(id: string, environment: SidebarRightDesktopEnvironment): number {
  if (id !== 'dsh-desktop' || environment.mode !== 'advanced') return 0
  if (environment.platform === 'darwin') return 20
  if (environment.platform === 'win32') return 32
  return 0
}

/**
 * Resolve official frame adaptation with standard geometry ahead of explicit
 * shell settings.
 * @param preferences - global Sidebar preferences.
 * @param environment - stable URL/preload shell facts.
 * @param overlay - live standard browser geometry.
 * @returns strip and user CSS applied by the official owner.
 */
export function resolveSidebarRightFramePreferences(
  preferences: SidebarRightPreferences,
  environment: SidebarRightDesktopEnvironment,
  overlay: SidebarRightWindowControlsOverlaySnapshot,
): SidebarRightFramePreferences {
  const scheme = preferences.titleBarScheme
  let titlebarStrip = 0
  if (scheme !== 'web') {
    if (overlay.present) titlebarStrip = overlay.height
    else if (environment.titlebarInset > 0) titlebarStrip = environment.titlebarInset
    else if (scheme === 'preset') titlebarStrip = presetStrip(preferences.titleBarPresetId, environment)
    else if (scheme === 'custom') titlebarStrip = preferences.titleBarStripPx
  }
  return {
    titlebarStrip,
    customCss: scheme === 'custom' ? preferences.customCss : '',
  }
}

/**
 * Apply one resolved frame snapshot, returning HMR-safe cleanup for every
 * global marker it owns.
 * @param frame - resolved strip and CSS.
 * @returns cleanup removing exactly this application.
 */
export function applySidebarRightFramePreferences(frame: SidebarRightFramePreferences): () => void {
  const root = document.documentElement
  if (frame.titlebarStrip > 0) {
    document.body.setAttribute('data-dsh-title-bar-compat', '')
    root.style.setProperty('--dsh-title-bar-strip', `${frame.titlebarStrip}px`)
  }
  let style: HTMLStyleElement | undefined
  if (frame.customCss !== '') {
    style = document.createElement('style')
    style.setAttribute('data-dsh-sidebar-right-custom-css', '')
    style.textContent = frame.customCss
    document.head.appendChild(style)
  }
  return () => {
    document.body.removeAttribute('data-dsh-title-bar-compat')
    root.style.removeProperty('--dsh-title-bar-strip')
    style?.remove()
  }
}

/** Better Sidebar's global dragged-width key retained as a read-only migration source. */
export const LEGACY_SIDEBAR_RIGHT_WIDTH_KEY = 'dsh-sidebar:v1:width'

/**
 * Resolve the official frame's first width. A valid legacy dragged width wins
 * over the configured percentage and remains untouched for rollback.
 * @param viewportWidth - current frame width.
 * @param defaultPercent - configured first-open percentage.
 * @param storage - optional browser storage.
 * @returns initial width in CSS pixels; the frame applies its own clamps.
 */
export function resolveSidebarRightInitialWidth(
  viewportWidth: number,
  defaultPercent: number,
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): number {
  if (storage !== undefined) {
    try {
      const legacy = Number(storage.getItem(LEGACY_SIDEBAR_RIGHT_WIDTH_KEY))
      if (Number.isFinite(legacy) && legacy > 0) return legacy
    } catch {
      // Unavailable browser storage contributes no migration value.
    }
  }
  return Math.max(0, viewportWidth) * defaultPercent / 100
}
