/**
 * Scope-id encoding for real and simulation IM conversations.
 *
 * @module @deepseek-ai/dsh-im-core/delivery/scope
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ImDeliveryScope, ImScopeId } from './types.ts'

/**
 * Escape `%` and `:` so scope components cannot collide on the delimiter.
 * @param part - one platform, account, instance, or conversation fragment.
 * @returns the escaped fragment.
 */
export function escapeScopeComponent(part: string): string {
  return part.replace(/%/g, '%25').replace(/:/g, '%3A')
}

/**
 * Reverse {@link escapeScopeComponent}.
 * @param part - escaped fragment.
 * @returns the original fragment.
 */
export function unescapeScopeComponent(part: string): string {
  return part.replace(/%3A/g, ':').replace(/%25/g, '%')
}

/**
 * Encode a delivery scope into a branded scope id.
 * @param scope - real platform conversation or simulation instance.
 * @returns `real:…` or `sim:…` scope id.
 */
export function encodeScopeId(scope: ImDeliveryScope): ImScopeId {
  if (scope.kind === 'real') {
    const raw = `real:${escapeScopeComponent(scope.platform)}:${escapeScopeComponent(scope.accountId)}:${escapeScopeComponent(scope.conversationId)}`
    return brandString<ImScopeId>(raw)
  }
  const raw = `sim:${escapeScopeComponent(scope.instanceId)}:${escapeScopeComponent(scope.conversationId)}`
  return brandString<ImScopeId>(raw)
}

/**
 * Encode an external message id inside one scope for inbound deduplication.
 * @param scopeId - branded conversation scope.
 * @param externalMessageId - platform message id.
 * @returns the durable dedup key.
 */
export function encodeExternalMessageKey(scopeId: ImScopeId, externalMessageId: string): string {
  return `${scopeId}::${escapeScopeComponent(externalMessageId)}`
}
