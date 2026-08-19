import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { parseAttachmentCapability, REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'
import {
  RemoteAttachmentStoreProvider,
  type RemoteAttachmentStoreOptions,
} from '../src/index.ts'

const now = 1_000_000
const pairingA = parsePersonalPairingId('pairing-a')
const pairingB = parsePersonalPairingId('pairing-b')

function store(overrides: Partial<RemoteAttachmentStoreOptions> = {}): RemoteAttachmentStoreProvider {
  return new RemoteAttachmentStoreProvider(new Context(), {
    maxBlobBytes: 8,
    capabilityLifetimeMs: 1_000,
    maxRetainedBlobs: 2,
    sweepIntervalMs: 60_000,
    schedule: () => ({ unref: vi.fn() }),
    ...overrides,
  })
}

describe('Remote attachment blob store', () => {
  it('retains ciphertext only and issues one single-use pairing-scoped capability', async () => {
    const service = store()
    const ciphertext = Uint8Array.of(1, 2, 3, 4)
    const grant = await service.publish({ pairingId: pairingA, ciphertext, now })
    expect(parseAttachmentCapability(grant.capability)).toBe(grant.capability)
    expect(grant.byteLength).toBe(4)
    expect(grant.expiresAt).toBe(now + 1_000)
    expect(service.observe()).toHaveLength(1)
    expect(service.observe()[0]).toMatchObject({ pairingId: pairingA, expiresAt: now + 1_000 })

    await expect(service.consume({ pairingId: pairingA, capability: grant.capability, now })).resolves.toBe(ciphertext)
    expect(service.observe()).toHaveLength(0)
    await expect(service.consume({ pairingId: pairingA, capability: grant.capability, now }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_CAPABILITY_INVALID' })
  })

  it('rejects cross-pairing use without consuming the blob', async () => {
    const service = store()
    const grant = await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now })
    await expect(service.consume({ pairingId: pairingB, capability: grant.capability, now }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_PAIRING_MISMATCH' })
    expect(service.observe()).toHaveLength(1)
  })

  it('removes the blob and capability on lazy expiry', async () => {
    const service = store()
    const grant = await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now })
    await expect(service.consume({ pairingId: pairingA, capability: grant.capability, now: now + 1_000 }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_EXPIRED' })
    expect(service.observe()).toHaveLength(0)
  })

  it('removes the blob and capability on revocation', async () => {
    const service = store()
    const grant = await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now })
    await service.revoke(grant.capability)
    expect(service.observe()).toHaveLength(0)
    await expect(service.consume({ pairingId: pairingA, capability: grant.capability, now }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_CAPABILITY_INVALID' })
    await expect(service.revoke(grant.capability)).resolves.toBeUndefined()
  })

  it('enforces the per-blob byte ceiling on the complete ciphertext', async () => {
    const service = store()
    await expect(service.publish({ pairingId: pairingA, ciphertext: new Uint8Array(0), now }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_LIMIT_EXCEEDED' })
    await expect(service.publish({ pairingId: pairingA, ciphertext: new Uint8Array(9), now }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_LIMIT_EXCEEDED' })
    await expect(service.publish({ pairingId: pairingA, ciphertext: new Uint8Array(8), now }))
      .resolves.toMatchObject({ byteLength: 8 })
  })

  it('fails explicitly at retained-blob capacity after sweeping expired entries', async () => {
    const service = store()
    await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now })
    await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(2), now })
    await expect(service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(3), now }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_CAPACITY' })
    await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(4), now: now + 2_000 })
    expect(service.observe()).toHaveLength(1)
  })

  it('sweeps expired blobs in the background', async () => {
    let sweep: (() => void) | undefined
    const service = new RemoteAttachmentStoreProvider(new Context(), {
      maxBlobBytes: 8,
      capabilityLifetimeMs: 1,
      maxRetainedBlobs: 2,
      sweepIntervalMs: 60_000,
      schedule: (handler) => {
        sweep = handler
        return { unref: vi.fn() }
      },
    })
    await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now: Date.now() })
    await new Promise(resolve => setTimeout(resolve, 2))
    sweep?.()
    expect(service.observe()).toHaveLength(0)
  })

  it('rejects misconfiguration above the accepted protocol ceilings', () => {
    expect(() => store({ maxBlobBytes: 100 * 1_024 * 1_024 + 1 })).toThrow(TypeError)
    expect(() => store({ capabilityLifetimeMs: 15 * 60 * 1000 + 1 })).toThrow(TypeError)
    expect(() => store({ sweepIntervalMs: 0 })).toThrow(TypeError)
    expect(() => store({ maxBlobBytes: 100 * 1_024 * 1_024, capabilityLifetimeMs: 15 * 60 * 1000 }))
      .not.toThrow()
  })

  it('clears retained blobs when the provider is disposed', async () => {
    const service = store()
    await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now })
    service.dispose()
    expect(service.observe()).toHaveLength(0)
  })

  it('defaults bounds to the accepted protocol ceilings and disposes with the owning fiber', async () => {
    const ctx = new Context()
    const service = new RemoteAttachmentStoreProvider(ctx, {
      maxRetainedBlobs: 2,
      sweepIntervalMs: 60_000,
    })
    expect(service.maxBlobBytes).toBe(REMOTE_PROTOCOL_LIMITS.attachmentBlobBytes)
    expect(service.capabilityLifetimeMs).toBe(REMOTE_PROTOCOL_LIMITS.attachmentCapabilityLifetimeMs)
    await service.publish({ pairingId: pairingA, ciphertext: Uint8Array.of(1), now })
    await ctx.fiber.dispose()
    expect(service.observe()).toHaveLength(0)
  })
})
