import { createCipheriv, createDecipheriv } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import {
  createCompanionVersionOffer,
  decodeCompanionMessage,
  decodeCompanionVersionOffer,
  decodeRelayMessage,
  encodeCompanionMessage,
  encodeCompanionVersionOffer,
  encodeRelayMessage,
  negotiateCompanionProtocol,
  negotiateRelayTransportVersion,
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseRelayAttachmentId,
  parseRelayRouteId,
  RemoteProtocolError,
  type RelayAttachmentId,
} from '@deepseek-ai/dsh-remote-protocol'

/** Cordis name for the keyless Remote Protocol acceptance composition. */
export const name = 'remote-protocol-keyless-scenario'

/** Run one encrypted Mobile request and Desktop-confirmed response through an opaque Relay. */
export function apply(_ctx: Context): void {
  const transportVersion = negotiateRelayTransportVersion([1], [1])
  console.log(`TRANSPORT version=${String(transportVersion)}`)

  const cipher = new KeylessHarnessCipher()
  const routeId = parseRelayRouteId('route-keyless')
  const mobileAttachment = parseRelayAttachmentId('mobile-keyless')
  const desktopAttachment = parseRelayAttachmentId('desktop-keyless')
  const mobileOffer = createCompanionVersionOffer('mobile')
  const desktopOffer = createCompanionVersionOffer('desktop')
  const mobileOfferAtDesktop = decodeCompanionVersionOffer(cipher.open(forward(
    routeId,
    mobileAttachment,
    desktopAttachment,
    cipher.seal(encodeCompanionVersionOffer(mobileOffer)),
  )))
  const desktopOfferAtMobile = decodeCompanionVersionOffer(cipher.open(forward(
    routeId,
    desktopAttachment,
    mobileAttachment,
    cipher.seal(encodeCompanionVersionOffer(desktopOffer)),
  )))
  const mobileProtocol = negotiateCompanionProtocol(mobileOffer, desktopOfferAtMobile)
  const desktopProtocol = negotiateCompanionProtocol(mobileOfferAtDesktop, desktopOffer)
  console.log(`COMPANION version=${String(mobileProtocol.major)} security=preserved`)

  const operation = {
    type: 'operation',
    operation: {
      type: 'submit-prompt',
      operationId: parseCompanionOperationId('operation-keyless'),
      sessionId: parseCompanionSessionId('session-keyless'),
      text: 'continue from Mobile',
    },
  } as const
  const operationPlaintext = encodeCompanionMessage(mobileProtocol, operation)
  const relayOperation = forward(
    routeId,
    mobileAttachment,
    desktopAttachment,
    cipher.seal(operationPlaintext),
  )
  const received = decodeCompanionMessage(desktopProtocol, cipher.open(relayOperation))
  if (received.type !== 'operation') throw new Error('Desktop did not receive the Mobile operation')
  const relayPlaintext = new TextDecoder().decode(encodeRelayMessage({
    type: 'ciphertext',
    transportVersion,
    routeId,
    sourceAttachmentId: mobileAttachment,
    targetAttachmentId: desktopAttachment,
    ciphertext: relayOperation,
  })).includes(received.operation.text)
  console.log(`MOBILE_REQUEST encrypted=${String(!bytesEqual(operationPlaintext, relayOperation))} relayPlaintext=${String(relayPlaintext)} type=${received.operation.type}`)

  const confirmed = {
    type: 'result',
    result: {
      type: 'confirmed',
      operationId: received.operation.operationId,
      committedAt: 1_787_027_200_000,
      outcome: 'accepted',
    },
  } as const
  const mobileResult = decodeCompanionMessage(mobileProtocol, cipher.open(forward(
    routeId,
    desktopAttachment,
    mobileAttachment,
    cipher.seal(encodeCompanionMessage(desktopProtocol, confirmed)),
  )))
  if (mobileResult.type !== 'result') throw new Error('Mobile did not receive the Desktop result')
  console.log(`DESKTOP_RESPONSE confirmed=true outcome=${mobileResult.result.outcome}`)

  let applicationPlaintextSent = false
  try {
    negotiateCompanionProtocol(
      createCompanionVersionOffer('mobile', [1]),
      createCompanionVersionOffer('desktop', [2]),
    )
  } catch (error) {
    if (!(error instanceof RemoteProtocolError)) throw error
    console.log(`NEGOTIATION mismatch=${error.code} update=${error.updateEndpoint ?? 'unknown'} applicationPlaintextSent=${String(applicationPlaintextSent)}`)
    return
  }
  applicationPlaintextSent = true
  throw new Error('incompatible Companion majors unexpectedly negotiated')
}

function forward(
  routeId: ReturnType<typeof parseRelayRouteId>,
  sourceAttachmentId: RelayAttachmentId,
  targetAttachmentId: RelayAttachmentId,
  ciphertext: Uint8Array,
): Uint8Array {
  const forwarded = decodeRelayMessage(encodeRelayMessage({
    type: 'ciphertext',
    transportVersion: 1,
    routeId,
    sourceAttachmentId,
    targetAttachmentId,
    ciphertext,
  }))
  if (forwarded.type !== 'ciphertext') throw new Error('Relay did not forward ciphertext')
  return forwarded.ciphertext
}

/** Example-only authenticated cipher used by the assembled acceptance path. */
export class KeylessHarnessCipher {
  private readonly key = Buffer.alloc(32, 29)
  private counter = 0

  /**
   * Encrypt one Companion message with the example-only key.
   * @param plaintext - encoded Companion application bytes.
   * @returns nonce-prefixed authenticated ciphertext.
   */
  seal(plaintext: Uint8Array): Uint8Array {
    this.counter += 1
    const nonce = Buffer.alloc(12)
    nonce.writeUInt32BE(this.counter, 8)
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return new Uint8Array(Buffer.concat([nonce, encrypted, cipher.getAuthTag()]))
  }

  /**
   * Decrypt one ciphertext produced by this example instance.
   * @param sealed - nonce-prefixed authenticated ciphertext.
   * @returns encoded Companion application bytes.
   */
  open(sealed: Uint8Array): Uint8Array {
    const nonce = sealed.slice(0, 12)
    const tag = sealed.slice(sealed.byteLength - 16)
    const encrypted = sealed.slice(12, sealed.byteLength - 16)
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce)
    decipher.setAuthTag(tag)
    return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]))
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}
