import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePairingChallengeId, parsePendingPairingId, parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { initializeSnowChannel } from '@deepseek-ai/dsh-noise-channel'
import {
  DesktopSnowPairingVault,
  EncryptedDesktopSnowPairingStore,
} from '../src/snow-pairing-vault.ts'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true }))) })

describe('DesktopSnowPairingVault', () => {
  it('atomically persists only protected active reconnect state and restores by selector', async () => {
    initializeSnowChannel(readFileSync(new URL(
      '../../../packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm', import.meta.url,
    )))
    const directory = await mkdtemp(join(tmpdir(), 'dsh-snow-vault-'))
    directories.push(directory)
    const path = join(directory, 'pairings.bin')
    const protection = {
      encrypt: (value: string) => new TextEncoder().encode(`protected:${value}`),
      decrypt: (value: Uint8Array) => new TextDecoder().decode(value).replace(/^protected:/u, ''),
    }
    const vault = await DesktopSnowPairingVault.load(new EncryptedDesktopSnowPairingStore(path, protection))
    const owner = (await vault.createInvitation(Date.now() + 60_000)).owner
    const challengeId = parsePairingChallengeId('challenge-persist')
    const pendingPairingId = parsePendingPairingId('pending-persist')
    const pairingId = parsePersonalPairingId('pairing-persist')
    vault.retainChallenge(challengeId, owner)
    vault.bindPending(challengeId, pendingPairingId)
    const state = new Uint8Array(96).fill(73)
    vault.activate(pendingPairingId, pairingId, state)
    await vault.flush()

    const disk = await readFile(path, 'utf8')
    expect(disk).not.toContain('pairing-persist')
    const restored = await DesktopSnowPairingVault.load(new EncryptedDesktopSnowPairingStore(path, protection))
    expect(restored.reconnectState('pairing-persist' as never)).toEqual(state)
    restored.release(pairingId)
    await restored.flush()
    expect((await DesktopSnowPairingVault.load(new EncryptedDesktopSnowPairingStore(path, protection)))
      .reconnectState('pairing-persist' as never)).toBeUndefined()
  })
})
