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

import { ImConfigService } from './service.ts'
export default ImConfigService
