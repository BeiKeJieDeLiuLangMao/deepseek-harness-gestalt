/**
 * Main exports for `@deepseek-ai/dsh-im-dingtalk`.
 *
 * @module @deepseek-ai/dsh-im-dingtalk
 */

export * from './types.ts'
export * from './spec.ts'
export * from './service.ts'

import { DingTalkDwsAdapterServiceImpl } from './service.ts'
export default DingTalkDwsAdapterServiceImpl
