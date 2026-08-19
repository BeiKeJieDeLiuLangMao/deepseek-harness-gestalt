import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseCompanionOperationId, type CompanionConfirmedResult } from '@deepseek-ai/dsh-remote-protocol'
import {
  clearCompanionDesktopCache,
  companionCacheAdmits,
  companionMutationAllowed,
  CompanionCache,
  CompanionUncertainOperationSettlement,
  IndexedDbCompanionCacheStore,
  InMemoryCompanionCacheStore,
  parseCompanionDesktopId,
  WebCryptoCompanionCacheCipher,
  type CompanionCacheKeySource,
  type CompanionCacheRecord,
  type CompanionMutationOutcome,
  type CompanionMutationRequest,
  type CompanionMutationTransport,
  type CompanionStatusAnswer,
} from '../src/companion-cache.ts'

const desktopA = parseCompanionDesktopId('desktop-a')
const desktopB = parseCompanionDesktopId('desktop-b')

async function cipherFor(keys: Record<string, CryptoKey>): Promise<WebCryptoCompanionCacheCipher> {
  const derived = { ...keys }
  return new WebCryptoCompanionCacheCipher({
    keyFor: async desktopId => derived[desktopId] ??= await freshKey(),
  } satisfies CompanionCacheKeySource)
}

async function freshKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function confirmed(operationId: string): CompanionConfirmedResult {
  return { type: 'confirmed', operationId: parseCompanionOperationId(operationId), committedAt: 1_787_027_200_000, outcome: 'accepted' }
}

describe('Companion Cache', () => {
  it('encrypts opened metadata and transcripts at rest per Paired Desktop', async () => {
    const keys = { 'desktop-a': await freshKey(), 'desktop-b': await freshKey() }
    const cipher = await cipherFor(keys)
    const plaintext = JSON.stringify({ title: 'Session', transcript: ['hello'] })
    const sealed = await cipher.seal(desktopA, new TextEncoder().encode(plaintext))

    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain('Session')
    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain('hello')
    expect(new TextDecoder().decode(await cipher.open(sealed))).toBe(plaintext)

    const withA = await cipherFor({ 'desktop-a': keys['desktop-a']! })
    expect(await withA.open(sealed)).toEqual(new TextEncoder().encode(plaintext))
  })

  it('never automatically caches attachment bytes, terminal content, spill files, or credentials', () => {
    expect(companionCacheAdmits('attachment-bytes')).toBe(false)
    expect(companionCacheAdmits('terminal-content')).toBe(false)
    expect(companionCacheAdmits('spill-file')).toBe(false)
    expect(companionCacheAdmits('credential')).toBe(false)
    expect(companionCacheAdmits('some-unknown-kind')).toBe(false)
    expect(companionCacheAdmits('transcript')).toBe(true)
  })

  it('fails loud when an excluded kind reaches the cache', async () => {
    const cache = new CompanionCache(new InMemoryCompanionCacheStore(), await cipherFor({}))
    await expect(cache.saveOpenedContent(desktopA, 'credential', 'secret-token')).rejects.toThrow(
      /never automatically stores/,
    )
  })

  it('persists sealed rows through the IndexedDB store', async () => {
    const keys = { 'desktop-a': await freshKey() }
    const cache = new CompanionCache(new IndexedDbCompanionCacheStore('companion-cache-test-content'), await cipherFor(keys))
    await cache.saveOpenedContent(desktopA, 'session-metadata', JSON.stringify({ title: 'Cached' }))
    expect(await cache.loadOpenedContent(desktopA)).toContain('Cached')
    expect(await cache.loadOpenedContent(desktopB)).toBeUndefined()
  })

  it('allows cache reads offline but disables every mutation until Remote Online', async () => {
    for (const kind of ['prompt', 'cancel', 'approval', 'question', 'attachment', 'other-mutation'] as const) {
      expect(companionMutationAllowed(false, kind)).toBe(false)
    }
    expect(companionMutationAllowed(true, 'prompt')).toBe(true)

    const store = new InMemoryCompanionCacheStore()
    const cipher = await cipherFor({})
    await store.saveContent(desktopA, await cipher.seal(desktopA, new TextEncoder().encode('cached')))
    const settlement = new CompanionUncertainOperationSettlement(store, desktopA)
    let sends = 0
    const transport = recordingTransport(() => { sends += 1 }, { known: true, result: confirmed('op-offline') })
    await expect(settlement.transmit(
      { kind: 'prompt', operationId: parseCompanionOperationId('op-offline') },
      transport,
      false,
    )).rejects.toThrow(/Remote Offline disables Companion prompt mutations/)
    expect(sends).toBe(0)
    expect(await store.loadReceipts(desktopA)).toEqual([])
    const cache = new CompanionCache(store, cipher)
    await expect(cache.loadOpenedContent(desktopA)).resolves.not.toBeUndefined()
  })

  it('stores an Operation Receipt only after transmission', async () => {
    const store = new InMemoryCompanionCacheStore()
    const settlement = new CompanionUncertainOperationSettlement(store, desktopA)
    let transmitted = false
    let receiptsAtTransmission: readonly unknown[] | undefined
    const transport: CompanionMutationTransport = {
      async send(_mutation, onTransmitted) {
        onTransmitted()
        receiptsAtTransmission = await store.loadReceipts(desktopA)
        transmitted = true
        return { known: false }
      },
      async queryStatus() { return { committed: false } },
    }
    const receipt = await settlement.transmit(
      { kind: 'prompt', operationId: parseCompanionOperationId('op-uncertain') },
      transport,
      true,
    )
    expect(transmitted).toBe(true)
    expect(receipt.status).toBe('unknown')
    expect(receiptsAtTransmission).toEqual([
      { operationId: parseCompanionOperationId('op-uncertain'), status: 'unknown' },
    ])
  })

  it('reconciles committed answers to the original result and absent answers to not-submitted', async () => {
    const store = new InMemoryCompanionCacheStore()
    const settlement = new CompanionUncertainOperationSettlement(store, desktopA)
    const original = confirmed('op-reconcile')

    const committedTransport = statusTransport({ committed: true, original })
    await settlement.transmit(
      { kind: 'prompt', operationId: parseCompanionOperationId('op-reconcile') },
      outcomeTransport({ known: false }),
      true,
    )
    const settled = await settlement.reconcileUnknown(committedTransport)
    expect(settled).toEqual([{ operationId: parseCompanionOperationId('op-reconcile'), status: 'committed', original }])

    await settlement.transmit(
      { kind: 'approval', operationId: parseCompanionOperationId('op-absent') },
      outcomeTransport({ known: false }),
      true,
    )
    const absent = await settlement.reconcileUnknown(statusTransport({ committed: false }))
    expect(absent.find(row => row.operationId === parseCompanionOperationId('op-absent'))?.status).toBe('not-submitted')
  })

  it('never automatically replays an uncertain or offline operation', async () => {
    const store = new InMemoryCompanionCacheStore()
    const settlement = new CompanionUncertainOperationSettlement(store, desktopA)
    const operationId = parseCompanionOperationId('op-no-replay')
    const transport = recordingTransport(undefined, { known: false })
    await settlement.transmit({ kind: 'prompt', operationId }, transport, true)

    const replaySpy = recordingTransport(undefined, { known: true, result: confirmed('op-no-replay') })
    const settled = await settlement.reconcileUnknown(replaySpy)
    expect(replaySpy.sends).toBe(0)
    expect(settled.find(row => row.operationId === operationId)?.status).toBe('not-submitted')

    await expect(settlement.transmit({ kind: 'prompt', operationId }, replaySpy, false)).rejects.toThrow(/Remote Offline/)
    expect(replaySpy.sends).toBe(0)
  })

  it('clears one Paired Desktop cache without destroying pairing-key records', async () => {
    const keys = { 'desktop-a': await freshKey(), 'desktop-b': await freshKey() }
    const pairingKeys = new Map<string, string>([['desktop-a', 'pairing-key-a'], ['desktop-b', 'pairing-key-b']])
    const cache = new CompanionCache(new InMemoryCompanionCacheStore(), await cipherFor(keys))
    await cache.saveOpenedContent(desktopA, 'transcript', 'A transcript')
    await cache.saveOpenedContent(desktopB, 'transcript', 'B transcript')

    await cache.clearDesktopCache(desktopA)
    expect(await cache.loadOpenedContent(desktopA)).toBeUndefined()
    expect(await cache.loadOpenedContent(desktopB)).toContain('B transcript')
    expect(pairingKeys.get('desktop-a')).toBe('pairing-key-a')
    expect(pairingKeys.get('desktop-b')).toBe('pairing-key-b')

    const records = new Map<string, CompanionCacheRecord>([
      ['desktop-a', { desktopId: desktopA, iv: new Uint8Array(12), ciphertext: new Uint8Array(4) }],
    ])
    expect(clearCompanionDesktopCache(records, 'desktop-a').has('desktop-a')).toBe(false)
  })
})

function outcomeTransport(outcome: CompanionMutationOutcome): CompanionMutationTransport {
  return {
    async send(_mutation, onTransmitted) {
      onTransmitted()
      return outcome
    },
    async queryStatus() { return { committed: false } },
  }
}

function statusTransport(answer: CompanionStatusAnswer): CompanionMutationTransport {
  return {
    async send() { throw new Error('reconciliation must not send mutations') },
    async queryStatus(_operationId) { return answer },
  }
}

function recordingTransport(onSend: (() => void) | undefined, outcome: CompanionMutationOutcome) {
  const transport: CompanionMutationTransport & { sends: number } = {
    sends: 0,
    async send(_mutation: CompanionMutationRequest, onTransmitted: () => void) {
      transport.sends += 1
      onSend?.()
      onTransmitted()
      return outcome
    },
    async queryStatus() { return { committed: false } },
  }
  return transport
}
