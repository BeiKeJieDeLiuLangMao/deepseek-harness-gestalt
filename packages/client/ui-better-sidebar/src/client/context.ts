/** Client-only Cordis context augmentation for the Better Sidebar registry. */

import type { BetterSidebarService } from './service.ts'

export type { BetterSidebarService } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterSidebar: BetterSidebarService
  }
}
