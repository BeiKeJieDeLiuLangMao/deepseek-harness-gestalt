/** Client-only Cordis context augmentation for the Better Sidebar registry. */

import type { BetterSidebarService } from './service.ts'

export type { BetterSidebarService } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * The Better Sidebar registry: tab types, file viewers, and open/focus
     * operations published by this Client package.
     */
    betterSidebar: BetterSidebarService
  }
}
