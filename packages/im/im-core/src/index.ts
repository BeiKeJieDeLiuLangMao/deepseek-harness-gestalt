/**
 * Main entry of `@deepseek-ai/dsh-im-core`.
 *
 * @module @deepseek-ai/dsh-im-core
 */

export * from './types.ts'
export * from './spec.ts'
export * from './service.ts'
export * from './delivery/index.ts'
export * from './coordination/index.ts'
export * from './simulation/index.ts'

import { ImConfigService } from './service.ts'
import type { ImDeliveryService } from './delivery/service.ts'
import type { ImExecutionService } from './coordination/service.ts'
import type { ImSimulationService } from './simulation/service.ts'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    imConfig: ImConfigService
    imDelivery: ImDeliveryService
    imExecution: ImExecutionService
    imSimulation: ImSimulationService
  }

  interface Events {
    /**
     * Workspace simulation target binding was set or cleared.
     * @param workspaceId - workspace whose simulation target changed.
     * @mode emit
     */
    'imConfig/simulation-target'(workspaceId: WorkspaceId): void
  }
}

export default ImConfigService
