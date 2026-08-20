import { useEffect, useState } from 'react'
import type {
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { openPageOf } from './model.ts'

/** Live observe and screenshot pair for one Session-owned tab. */
export interface BrowserPageFacts {
  readonly page: BrowserPageState | undefined
  readonly screenshot: BrowserScreenshot | undefined
}

/**
 * Observe and capture one tab whenever its identity or listed revision changes.
 * @param target - Complete tab identity, or undefined while none is selected.
 * @param observe - Session-bound observe remote.
 * @param screenshot - Session-bound screenshot remote.
 * @param listedRevision - Binder-committed revision for this tab, or undefined
 *   while none is selected. A later revision re-observes the same tab.
 * @returns the latest open page and screenshot, if any.
 */
export function useBrowserPage(
  target: BrowserTarget | undefined,
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>,
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>,
  listedRevision?: number,
): BrowserPageFacts {
  const [page, setPage] = useState<BrowserPageState | undefined>()
  const [shot, setShot] = useState<BrowserScreenshot | undefined>()
  const tabKey = target === undefined
    ? ''
    : `${target.profileId}/${target.workspaceId}/${target.browserId}/${target.tabId}`

  useEffect(() => {
    if (target === undefined) {
      setPage(undefined)
      setShot(undefined)
      return
    }
    let cancelled = false
    const wasCancelled = (): boolean => cancelled
    const load = async (): Promise<void> => {
      try {
        const state = await observe(target)
        if (wasCancelled()) return
        const nextPage = openPageOf(state)
        const nextShot = nextPage === undefined ? undefined : await screenshot(target)
        if (wasCancelled()) return
        setPage(nextPage)
        setShot(nextShot)
      } catch {
        // Observe/screenshot can reject when the Session binding is not yet
        // on the Remote (fixture restore, or a closed Session). The collapsed
        // layer stays Untitled until the next tab-identity or listed-revision
        // change retries.
      }
    }
    void load()
    return () => { cancelled = true }
  }, [observe, screenshot, tabKey, listedRevision])

  return { page, screenshot: shot }
}
