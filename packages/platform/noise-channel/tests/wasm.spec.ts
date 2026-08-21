import { sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const nodeVersions = process.versions

afterEach(() => {
  Object.defineProperty(process, 'versions', { configurable: true, value: nodeVersions })
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('@deepseek-ai/dsh-noise-channel/snow-wasm')
  vi.doUnmock('node:fs/promises')
})

describe('Snow wasm loader', () => {
  it('rejects truncated keypairs, handshake hashes, and packed messages', async () => {
    vi.resetModules()
    vi.doMock('@deepseek-ai/dsh-noise-channel/snow-wasm', () => ({
      default: vi.fn(async () => {}),
      generate_keypair: () => new Uint8Array(63),
      xkpsk3_initiator_msg1: () => new Uint8Array(8),
      xkpsk3_initiator_msg3: () => new Uint8Array(16),
      xkpsk3_responder_msg2: () => new Uint8Array(16),
      xkpsk3_responder_finish: () => new Uint8Array(16),
    }))
    const wasm = await import('../src/wasm.ts')
    await expect(wasm.generateSnowKeypair()).rejects.toThrow('64 bytes')
    await expect(wasm.writeInitiatorMessage3({
      mobileStaticPrivate: new Uint8Array(32),
      mobileEphemeralPrivate: new Uint8Array(32),
      desktopPublic: new Uint8Array(32),
      psk: new Uint8Array(32),
      message2: new Uint8Array(8),
    })).rejects.toThrow('truncated')
    await expect(wasm.finishResponder({
      desktopStaticPrivate: new Uint8Array(32),
      desktopEphemeralPrivate: new Uint8Array(32),
      psk: new Uint8Array(32),
      message1: new Uint8Array(8),
      message3: new Uint8Array(8),
    })).rejects.toThrow('32 bytes')
  })

  it('loads the committed module from its URL when Node versions are absent', async () => {
    vi.resetModules()
    const init = vi.fn(async () => {})
    vi.doMock('@deepseek-ai/dsh-noise-channel/snow-wasm', () => ({
      default: init,
      generate_keypair: () => new Uint8Array(64),
      xkpsk3_initiator_msg1: () => new Uint8Array(8),
      xkpsk3_initiator_msg3: () => new Uint8Array(40),
      xkpsk3_responder_msg2: () => new Uint8Array(40),
      xkpsk3_responder_finish: () => new Uint8Array(32),
    }))
    Object.defineProperty(process, 'versions', { configurable: true, value: {} })
    const wasm = await import('../src/wasm.ts')
    await expect(wasm.generateSnowKeypair()).resolves.toEqual({
      privateKey: new Uint8Array(32),
      publicKey: new Uint8Array(32),
    })
    expect(init).toHaveBeenCalledWith(expect.objectContaining({
      module_or_path: expect.any(URL),
    }))
  })

  it('loads the sibling wasm when the package-relative module is absent', async () => {
    vi.resetModules()
    const init = vi.fn(async () => {})
    const access = vi.fn(async (path: string) => {
      if (path.includes(`${sep}pkg${sep}`)) {
        const error = new Error('missing package wasm') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
    })
    const readFile = vi.fn(async () => new Uint8Array([1, 2, 3]))
    vi.doMock('node:fs/promises', async () => ({
      ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
      access,
      readFile,
    }))
    vi.doMock('@deepseek-ai/dsh-noise-channel/snow-wasm', () => ({
      default: init,
      generate_keypair: () => new Uint8Array(64),
      xkpsk3_initiator_msg1: () => new Uint8Array(8),
      xkpsk3_initiator_msg3: () => new Uint8Array(40),
      xkpsk3_responder_msg2: () => new Uint8Array(40),
      xkpsk3_responder_finish: () => new Uint8Array(32),
    }))
    const wasm = await import('../src/wasm.ts')
    await expect(wasm.generateSnowKeypair()).resolves.toEqual({
      privateKey: new Uint8Array(32),
      publicKey: new Uint8Array(32),
    })
    expect(access).toHaveBeenCalled()
    expect(readFile).toHaveBeenCalled()
    expect(init).toHaveBeenCalledWith({ module_or_path: new Uint8Array([1, 2, 3]) })
  })

  it('rejects a missing wasm and a non-ENOENT access failure', async () => {
    vi.resetModules()
    const missing = new Error('missing every wasm') as NodeJS.ErrnoException
    missing.code = 'ENOENT'
    vi.doMock('node:fs/promises', async () => ({
      ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
      access: vi.fn(async () => {
        throw missing
      }),
    }))
    vi.doMock('@deepseek-ai/dsh-noise-channel/snow-wasm', () => ({
      default: vi.fn(async () => {}),
      generate_keypair: () => new Uint8Array(64),
      xkpsk3_initiator_msg1: () => new Uint8Array(8),
      xkpsk3_initiator_msg3: () => new Uint8Array(40),
      xkpsk3_responder_msg2: () => new Uint8Array(40),
      xkpsk3_responder_finish: () => new Uint8Array(32),
    }))
    const wasm = await import('../src/wasm.ts')
    await expect(wasm.generateSnowKeypair()).rejects.toThrow('missing every wasm')

    vi.resetModules()
    const denied = new Error('wasm is unreadable') as NodeJS.ErrnoException
    denied.code = 'EACCES'
    vi.doMock('node:fs/promises', async () => ({
      ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
      access: vi.fn(async () => {
        throw denied
      }),
    }))
    vi.doMock('@deepseek-ai/dsh-noise-channel/snow-wasm', () => ({
      default: vi.fn(async () => {}),
      generate_keypair: () => new Uint8Array(64),
      xkpsk3_initiator_msg1: () => new Uint8Array(8),
      xkpsk3_initiator_msg3: () => new Uint8Array(40),
      xkpsk3_responder_msg2: () => new Uint8Array(40),
      xkpsk3_responder_finish: () => new Uint8Array(32),
    }))
    const deniedWasm = await import('../src/wasm.ts')
    await expect(deniedWasm.generateSnowKeypair()).rejects.toThrow('wasm is unreadable')

    vi.resetModules()
    vi.doMock('node:fs/promises', async () => ({
      ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
      access: vi.fn(async () => {
        throw { code: 'ENOENT' }
      }),
    }))
    vi.doMock('@deepseek-ai/dsh-noise-channel/snow-wasm', () => ({
      default: vi.fn(async () => {}),
      generate_keypair: () => new Uint8Array(64),
      xkpsk3_initiator_msg1: () => new Uint8Array(8),
      xkpsk3_initiator_msg3: () => new Uint8Array(40),
      xkpsk3_responder_msg2: () => new Uint8Array(40),
      xkpsk3_responder_finish: () => new Uint8Array(32),
    }))
    const unlabeled = await import('../src/wasm.ts')
    await expect(unlabeled.generateSnowKeypair()).rejects.toThrow('Snow WebAssembly module is missing')
  })
})
