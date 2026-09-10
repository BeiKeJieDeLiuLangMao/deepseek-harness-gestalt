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

declare module '@deepseek-ai/cordis' {
  interface Context {
    imConfig: ImConfigService
    imDelivery: ImDeliveryService
    imExecution: ImExecutionService
    imSimulation: ImSimulationService
  }
}

export default ImConfigService
