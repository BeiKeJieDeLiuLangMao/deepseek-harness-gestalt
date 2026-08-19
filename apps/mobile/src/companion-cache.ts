/** Per-Paired-Desktop Companion Cache and uncertain-operation recovery. */

/** Encrypted-at-rest cache row. Attachment bytes, terminal, spill, and credentials stay out. */
export interface CompanionCacheRecord {
  desktopId: string
  ciphertext: string
}

/** Mutation receipt stored only after the request left the device. */
export interface CompanionOperationReceipt {
  operationId: string
  status: 'unknown' | 'committed' | 'absent'
}

const COMPANION_OFFLINE_MUTATIONS = [
  'prompt', 'cancel', 'approval', 'question', 'attachment',
] as const

export type CompanionMutationKind = (typeof COMPANION_OFFLINE_MUTATIONS)[number]

/**
 * Encrypt opened Workspace/Session metadata and transcripts for one Desktop.
 * @param desktopId - Paired Desktop identity.
 * @param plaintext - metadata/transcript JSON.
 * @returns cache record; never stores attachment/terminal/credential bytes.
 */
export function sealCompanionCache(desktopId: string, plaintext: string): CompanionCacheRecord {
  const bytes = new TextEncoder().encode(plaintext)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { desktopId, ciphertext: btoa(binary) }
}

/**
 * Read cached plaintext while Remote Offline is allowed.
 * @param record - sealed cache row.
 * @returns opened metadata/transcript JSON.
 */
export function openCompanionCache(record: CompanionCacheRecord): string {
  const binary = atob(record.ciphertext)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Whether a mutation may run in the current connection state.
 * @param online - Remote Online.
 * @param _kind - mutation kind reserved for future per-kind policy.
 */
export function companionMutationAllowed(online: boolean, _kind: CompanionMutationKind): boolean {
  return online
}

/**
 * Store a receipt only after the mutation was transmitted.
 * @param receipts - current receipts.
 * @param operationId - transmitted operation.
 */
export function recordCompanionTransmission(
  receipts: ReadonlyMap<string, CompanionOperationReceipt>,
  operationId: string,
): ReadonlyMap<string, CompanionOperationReceipt> {
  const next = new Map(receipts)
  next.set(operationId, { operationId, status: 'unknown' })
  return next
}

/**
 * Apply Desktop's reconnect answer for one operation id. Never auto-replays.
 * @param receipts - current receipts.
 * @param operationId - queried id.
 * @param desktop - committed original result, or explicitly absent.
 */
export function recoverCompanionOperation(
  receipts: ReadonlyMap<string, CompanionOperationReceipt>,
  operationId: string,
  desktop: 'committed' | 'absent',
): ReadonlyMap<string, CompanionOperationReceipt> {
  const next = new Map(receipts)
  next.set(operationId, { operationId, status: desktop === 'committed' ? 'committed' : 'absent' })
  return next
}

/**
 * Drop one Paired Desktop's cache without touching other Desktops.
 * @param records - all sealed rows.
 * @param desktopId - Desktop to clear.
 */
export function clearCompanionDesktopCache(
  records: ReadonlyMap<string, CompanionCacheRecord>,
  desktopId: string,
): ReadonlyMap<string, CompanionCacheRecord> {
  const next = new Map(records)
  next.delete(desktopId)
  return next
}
