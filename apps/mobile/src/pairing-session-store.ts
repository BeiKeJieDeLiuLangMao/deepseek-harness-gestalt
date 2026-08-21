/** Durable Mobile Relay grant so a refresh can restore Personal Pairing. */

import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import type { RelayCredentialGrant } from '@deepseek-ai/dsh-remote-access'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'

/** Account-scoped store for a confirmed Mobile Relay grant. */
export interface MobilePairingSessionStore {
  /**
   * Read the grant last saved for this Account, if any.
   * @param accountId - signed-in Platform Account.
   */
  load(accountId: PlatformAccountId): RelayCredentialGrant | undefined
  /**
   * Replace the grant for this Account.
   * @param accountId - signed-in Platform Account.
   * @param grant - Mobile Relay authority opened after Desktop confirmation.
   */
  save(accountId: PlatformAccountId, grant: RelayCredentialGrant): void
  /**
   * Drop the grant for this Account. Pairing-key records are not stored here.
   * @param accountId - signed-in Platform Account.
   */
  clear(accountId: PlatformAccountId): void
}

/**
 * Persist one Mobile Relay grant in `localStorage` for the selected identity namespace.
 * @param identityNamespace - selected Platform identity namespace.
 * @param storage - `localStorage` or an in-memory Map for tests.
 */
export function createLocalStoragePairingSessionStore(
  identityNamespace: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): MobilePairingSessionStore {
  const prefix = `deepseek-gestalt:${identityNamespace}:mobile-pairing-grant:`
  return {
    load(accountId) {
      const raw = storage.getItem(prefix + accountId)
      if (raw === null) return undefined
      try {
        return parseGrant(JSON.parse(raw) as unknown)
      } catch {
        storage.removeItem(prefix + accountId)
        return undefined
      }
    },
    save(accountId, grant) {
      storage.setItem(prefix + accountId, JSON.stringify({
        endpoint: grant.endpoint,
        routeId: grant.routeId,
        credential: grant.credential,
        revision: grant.revision,
      }))
    },
    clear(accountId) {
      storage.removeItem(prefix + accountId)
    },
  }
}

function parseGrant(value: unknown): RelayCredentialGrant {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Mobile pairing grant must be an object')
  }
  const record = value as Record<string, unknown>
  if (record.endpoint !== 'mobile') throw new TypeError('Mobile pairing grant endpoint must be mobile')
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) <= 0) {
    throw new TypeError('Mobile pairing grant revision must be positive')
  }
  return {
    endpoint: 'mobile',
    routeId: parseRelayRouteId(record.routeId),
    credential: parseRelayCredential(record.credential),
    revision: record.revision as number,
  }
}
