/**
 * Public export for IM delivery and history module.
 *
 * @module @deepseek-ai/dsh-im-core/delivery
 */

export * from './types.ts'
export * from './spec.ts'
export * from './service.ts'

import { ImDeliveryService } from './service.ts'
export default ImDeliveryService
