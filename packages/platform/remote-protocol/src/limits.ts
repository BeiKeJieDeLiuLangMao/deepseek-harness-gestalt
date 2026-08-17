/** Fixed limits enforced by both Remote Protocol codecs. */
export const REMOTE_PROTOCOL_LIMITS = {
  /** Maximum nested object/array levels accepted after bounded JSON decoding. */
  parserDepth: 16,
  /** Maximum members in one encoded object or array. */
  containerValues: 256,
  /** Maximum primitive and container values in one encoded message. */
  totalEncodedValues: 4_096,
  /** Maximum UTF-8 bytes in one encoded string. */
  stringBytes: 90_000,
  /** Maximum complete Relay JSON frame bytes, including base64url overhead. */
  relayMessageBytes: 98_304,
  /** Maximum opaque ciphertext bytes forwarded by one Relay frame. */
  ciphertextBytes: 65_535,
  /** Maximum Encrypted Companion plaintext bytes before endpoint encryption. */
  companionMessageBytes: 65_519,
  /** Maximum transcript entries in one approved Companion projection. */
  transcriptPageEntries: 200,
} as const
