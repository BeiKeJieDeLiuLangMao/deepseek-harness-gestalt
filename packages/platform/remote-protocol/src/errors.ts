/** Stable failure codes shared by Remote Protocol codecs and negotiators. */
export type RemoteProtocolErrorCode =
  | 'COMPANION_SECURITY_CAPABILITY_MISSING'
  | 'COMPANION_UPDATE_REQUIRED'
  | 'COMPANION_VERSION_NOT_NEGOTIATED'
  | 'RELAY_TRANSPORT_INCOMPATIBLE'
  | 'REMOTE_PROTOCOL_INVALID_MESSAGE'
  | 'REMOTE_PROTOCOL_LIMIT_EXCEEDED'

/** Error whose code and update direction are safe to expose across protocol endpoints. */
export class RemoteProtocolError extends Error {
  /**
   * @param code - stable machine-readable failure code.
   * @param message - diagnostic without application plaintext.
   * @param updateEndpoint - endpoint that must update before application data may be sent.
   */
  constructor(
    readonly code: RemoteProtocolErrorCode,
    message: string,
    readonly updateEndpoint?: 'mobile' | 'desktop',
  ) {
    super(message)
    this.name = 'RemoteProtocolError'
  }
}
