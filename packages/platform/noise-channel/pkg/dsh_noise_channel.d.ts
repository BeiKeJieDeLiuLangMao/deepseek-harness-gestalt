/* tslint:disable */
/* eslint-disable */

/**
 * Generate one X25519 static or ephemeral keypair as `private || public`.
 */
export function generate_keypair(): Uint8Array;

/**
 * Initiator message 1.
 */
export function xkpsk3_initiator_msg1(mobile_static_private: Uint8Array, mobile_ephemeral_private: Uint8Array, desktop_public: Uint8Array, psk: Uint8Array): Uint8Array;

/**
 * Initiator message 3 plus the finished handshake hash: `message3 || hash`.
 */
export function xkpsk3_initiator_msg3(mobile_static_private: Uint8Array, mobile_ephemeral_private: Uint8Array, desktop_public: Uint8Array, psk: Uint8Array, message2: Uint8Array): Uint8Array;

/**
 * Responder finish after message 3. Returns the finished handshake hash.
 */
export function xkpsk3_responder_finish(desktop_static_private: Uint8Array, desktop_ephemeral_private: Uint8Array, psk: Uint8Array, message1: Uint8Array, message3: Uint8Array): Uint8Array;

/**
 * Responder message 2 plus the handshake hash after that write: `message2 || hash`.
 */
export function xkpsk3_responder_msg2(desktop_static_private: Uint8Array, desktop_ephemeral_private: Uint8Array, psk: Uint8Array, message1: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly generate_keypair: (a: number) => void;
    readonly xkpsk3_initiator_msg1: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly xkpsk3_responder_msg2: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly xkpsk3_initiator_msg3: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly xkpsk3_responder_finish: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export3: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
