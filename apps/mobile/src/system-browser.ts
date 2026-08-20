import { Browser } from '@capacitor/browser'
import type { SystemBrowser } from '@deepseek-ai/dsh-platform-account-client'

/**
 * Capacitor adapter that opens the native system-provided browser surface.
 * When that plugin is unavailable, the current browsing context navigates to
 * the prepared authorization URL so a later `load()` can resume polling.
 */
export const mobileSystemBrowser: SystemBrowser = {
  open(url) {
    return Promise.resolve(Browser.open({ url })).catch(() => {
      window.location.assign(url)
    })
  },
}
