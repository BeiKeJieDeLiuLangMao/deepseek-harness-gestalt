/** Load the committed Snow 0.10.0 WebAssembly module once per process. */

import init, {
  generate_keypair,
  xkpsk3_initiator_msg1,
  xkpsk3_initiator_msg3,
  xkpsk3_responder_finish,
  xkpsk3_responder_msg2,
} from '@deepseek-ai/dsh-noise-channel/snow-wasm'

let ready: Promise<void> | undefined

/**
 * Instantiate the committed Snow module before any handshake call.
 * @returns settled after the module is live; later calls reuse the same instance.
 */
export async function ensureSnowChannel(): Promise<void> {
  ready ??= (async () => {
    if (typeof process !== 'undefined' && process.versions?.node !== undefined) {
      const { readFile } = await import('node:fs/promises')
      const { fileURLToPath } = await import('node:url')
      await init({ module_or_path: await readFile(fileURLToPath(await resolveSnowWasmUrl())) })
      return
    }
    await init({ module_or_path: packageSnowWasmUrl() })
  })()
  await ready
}

function packageSnowWasmUrl(): URL {
  return new URL('../pkg/dsh_noise_channel_bg.wasm', import.meta.url)
}

async function resolveSnowWasmUrl(): Promise<URL> {
  const { access } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const candidates = [packageSnowWasmUrl(), new URL('./dsh_noise_channel_bg.wasm', import.meta.url)]
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      await access(fileURLToPath(candidate))
      return candidate
    } catch (error) {
      if (!isNodeEnoent(error)) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Snow WebAssembly module is missing')
}

/**
 * Generate one X25519 keypair.
 * @returns `{ privateKey, publicKey }` of 32 bytes each.
 */
export async function generateSnowKeypair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  await ensureSnowChannel()
  const pair = generate_keypair()
  if (pair.byteLength !== 64) throw new TypeError('Snow keypair must contain 64 bytes')
  return { privateKey: pair.slice(0, 32), publicKey: pair.slice(32) }
}

/**
 * Write XKpsk3 initiator message 1.
 * @param input - Mobile static and ephemeral privates, Desktop public, and invitation PSK.
 * @returns Noise message 1.
 */
export async function writeInitiatorMessage1(input: {
  mobileStaticPrivate: Uint8Array
  mobileEphemeralPrivate: Uint8Array
  desktopPublic: Uint8Array
  psk: Uint8Array
}): Promise<Uint8Array> {
  await ensureSnowChannel()
  return xkpsk3_initiator_msg1(
    input.mobileStaticPrivate,
    input.mobileEphemeralPrivate,
    input.desktopPublic,
    input.psk,
  )
}

/**
 * Write XKpsk3 initiator message 3 after reading message 2.
 * @param input - Mobile keys, Desktop public, PSK, and Desktop message 2.
 * @returns `{ message3, handshakeHash }`.
 */
export async function writeInitiatorMessage3(input: {
  mobileStaticPrivate: Uint8Array
  mobileEphemeralPrivate: Uint8Array
  desktopPublic: Uint8Array
  psk: Uint8Array
  message2: Uint8Array
}): Promise<{ message3: Uint8Array; handshakeHash: Uint8Array }> {
  await ensureSnowChannel()
  const packed = xkpsk3_initiator_msg3(
    input.mobileStaticPrivate,
    input.mobileEphemeralPrivate,
    input.desktopPublic,
    input.psk,
    input.message2,
  )
  const { message, handshakeHash } = splitMessageAndHash(packed, 'initiator message 3')
  return { message3: message, handshakeHash }
}

/**
 * Read XKpsk3 message 1 and write message 2.
 * @param input - Desktop keys, PSK, and Mobile message 1.
 * @returns `{ message2, handshakeHash }` after message 2.
 */
export async function writeResponderMessage2(input: {
  desktopStaticPrivate: Uint8Array
  desktopEphemeralPrivate: Uint8Array
  psk: Uint8Array
  message1: Uint8Array
}): Promise<{ message2: Uint8Array; handshakeHash: Uint8Array }> {
  await ensureSnowChannel()
  const packed = xkpsk3_responder_msg2(
    input.desktopStaticPrivate,
    input.desktopEphemeralPrivate,
    input.psk,
    input.message1,
  )
  const { message, handshakeHash } = splitMessageAndHash(packed, 'responder message 2')
  return { message2: message, handshakeHash }
}

/**
 * Finish the responder after message 3.
 * @param input - Desktop keys, PSK, message 1, and message 3.
 * @returns finished 32-byte handshake hash.
 */
export async function finishResponder(input: {
  desktopStaticPrivate: Uint8Array
  desktopEphemeralPrivate: Uint8Array
  psk: Uint8Array
  message1: Uint8Array
  message3: Uint8Array
}): Promise<Uint8Array> {
  await ensureSnowChannel()
  const hash = xkpsk3_responder_finish(
    input.desktopStaticPrivate,
    input.desktopEphemeralPrivate,
    input.psk,
    input.message1,
    input.message3,
  )
  if (hash.byteLength !== 32) throw new TypeError('Snow handshake hash must contain 32 bytes')
  return hash
}

function isNodeEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function splitMessageAndHash(packed: Uint8Array, name: string): { message: Uint8Array; handshakeHash: Uint8Array } {
  if (packed.byteLength <= 32) throw new TypeError(`${name} is truncated`)
  return {
    message: packed.slice(0, packed.byteLength - 32),
    handshakeHash: packed.slice(packed.byteLength - 32),
  }
}
