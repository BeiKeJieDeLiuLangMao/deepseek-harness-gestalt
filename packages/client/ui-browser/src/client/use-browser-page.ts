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
 * Observe and capture one tab whenever its identity changes.
 * @param target - Complete tab identity, or undefined while none is selected.
 * @param observe - Session-bound observe remote.
 * @param screenshot - Session-bound screenshot remote.
 * @returns the latest open page and screenshot, if any.
 */
export function useBrowserPage(
  target: BrowserTarget | undefined,
  observe: (target: BrowserTarget) => Promise<BrowserRuntimeState>,
  screenshot: (target: BrowserTarget) => Promise<BrowserScreenshot>,
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
      const state = await observe(target)
      if (wasCancelled()) return
      const nextPage = openPageOf(state)
      const nextShot = nextPage === undefined ? undefined : await screenshot(target)
      if (wasCancelled()) return
      setPage(nextPage)
      setShot(nextShot)
    }
    void load()
    return () => { cancelled = true }
  }, [observe, screenshot, tabKey])

  return { page, screenshot: shot }
}
