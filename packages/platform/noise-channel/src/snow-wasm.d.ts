declare module '@deepseek-ai/dsh-noise-channel/snow-wasm' {
  export function generate_keypair(): Uint8Array
  export function xkpsk3_initiator_msg1(
    mobile_static_private: Uint8Array,
    mobile_ephemeral_private: Uint8Array,
    desktop_public: Uint8Array,
    psk: Uint8Array,
  ): Uint8Array
  export function xkpsk3_initiator_msg3(
    mobile_static_private: Uint8Array,
    mobile_ephemeral_private: Uint8Array,
    desktop_public: Uint8Array,
    psk: Uint8Array,
    message2: Uint8Array,
  ): Uint8Array
  export function xkpsk3_responder_msg2(
    desktop_static_private: Uint8Array,
    desktop_ephemeral_private: Uint8Array,
    psk: Uint8Array,
    message1: Uint8Array,
  ): Uint8Array
  export function xkpsk3_responder_finish(
    desktop_static_private: Uint8Array,
    desktop_ephemeral_private: Uint8Array,
    psk: Uint8Array,
    message1: Uint8Array,
    message3: Uint8Array,
  ): Uint8Array
  export default function init(input?: { module_or_path: BufferSource | URL }): Promise<unknown>
}
