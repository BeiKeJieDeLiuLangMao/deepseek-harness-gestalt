/** Mobile Snow handshake client for the product pairing HTTP flow. */

import {
  parsePairingCompletionId,
  parsePairingInvitationLink,
  type PairingCompletionId,
  type RelayCredentialGrant,
} from '@deepseek-ai/dsh-remote-access'
import { openSnowRelayAuthority } from './handshake.ts'
import {
  generateSnowKeypair,
  writeInitiatorMessage1,
  writeInitiatorMessage3,
} from './wasm.ts'

/** Mobile half of `Noise_XKpsk3_25519_ChaChaPoly_SHA256`. */
export class SnowMobileHandshakeClient {
  private mobileStatic: Uint8Array | undefined
  private mobileEphemeral: Uint8Array | undefined
  private desktopPublic: Uint8Array | undefined
  private psk: Uint8Array | undefined
  private pairingKey: Uint8Array | undefined
  private finishMessage: Uint8Array | undefined

  /**
   * Prepare message 1 from the one-time invitation.
   * @param oneTimeLink - complete HTTPS invitation including `spk`.
   * @returns completion id and Mobile message 1.
   */
  async begin(oneTimeLink: string): Promise<{ completionId: PairingCompletionId; mobileHandshake: Uint8Array }> {
    this.wipe()
    const invitation = parsePairingInvitationLink(oneTimeLink)
    try {
      if (invitation.desktopStaticPublicKey === undefined) {
        throw new TypeError('Snow Mobile Pairing requires the Desktop static public key')
      }
      const mobile = await generateSnowKeypair()
      const ephemeral = await generateSnowKeypair()
      this.mobileStatic = mobile.privateKey
      this.mobileEphemeral = ephemeral.privateKey
      this.desktopPublic = invitation.desktopStaticPublicKey.slice()
      this.psk = invitation.invitationSecret.slice()
      ephemeral.publicKey.fill(0)
      return {
        completionId: parsePairingCompletionId(`snow-${crypto.randomUUID()}`),
        mobileHandshake: await writeInitiatorMessage1({
          mobileStaticPrivate: mobile.privateKey,
          mobileEphemeralPrivate: ephemeral.privateKey,
          desktopPublic: this.desktopPublic,
          psk: this.psk,
        }),
      }
    } finally {
      invitation.invitationSecret.fill(0)
    }
  }

  /**
   * Read Desktop message 2 and retain message 3 for `finish-challenge`.
   * @param desktopHandshake - Noise message 2.
   */
  async acceptDesktopHandshake(desktopHandshake: Uint8Array): Promise<void> {
    const mobileStatic = this.mobileStatic
    const mobileEphemeral = this.mobileEphemeral
    const desktopPublic = this.desktopPublic
    const psk = this.psk
    if (
      mobileStatic === undefined
      || mobileEphemeral === undefined
      || desktopPublic === undefined
      || psk === undefined
    ) {
      throw new Error('Snow Mobile Pairing has no prepared invitation')
    }
    const finished = await writeInitiatorMessage3({
      mobileStaticPrivate: mobileStatic,
      mobileEphemeralPrivate: mobileEphemeral,
      desktopPublic,
      psk,
      message2: desktopHandshake,
    })
    this.finishMessage = finished.message3
    this.pairingKey = finished.handshakeHash
    mobileStatic.fill(0)
    mobileEphemeral.fill(0)
    desktopPublic.fill(0)
    psk.fill(0)
    this.mobileStatic = undefined
    this.mobileEphemeral = undefined
    this.desktopPublic = undefined
    this.psk = undefined
  }

  /**
   * Export message 3 after {@link acceptDesktopHandshake}.
   * @returns Noise message 3.
   */
  exportFinishMessage(): Uint8Array {
    if (this.finishMessage === undefined) throw new Error('Snow Mobile Pairing has no finish message')
    return this.finishMessage.slice()
  }

  /**
   * Export the finished handshake hash after message 3.
   * @returns copy of the finished handshake hash, or undefined before message 3.
   */
  exportPairingKeyMaterial(): Uint8Array | undefined {
    return this.pairingKey?.slice()
  }

  /** Zero retained handshake material. */
  wipe(): void {
    this.mobileStatic?.fill(0)
    this.mobileEphemeral?.fill(0)
    this.desktopPublic?.fill(0)
    this.psk?.fill(0)
    this.pairingKey?.fill(0)
    this.finishMessage?.fill(0)
    this.mobileStatic = undefined
    this.mobileEphemeral = undefined
    this.desktopPublic = undefined
    this.psk = undefined
    this.pairingKey = undefined
    this.finishMessage = undefined
  }

  /**
   * Open the sealed Mobile Relay grant with the finished pairing key.
   * @param sealedAuthority - AES-GCM sealed grant.
   * @returns Mobile-only Relay credential.
   */
  openRelayAuthority(sealedAuthority: Uint8Array): Promise<RelayCredentialGrant> {
    if (this.pairingKey === undefined) throw new Error('Snow Mobile Pairing has no pairing key')
    return openSnowRelayAuthority(this.pairingKey, sealedAuthority)
  }
}
