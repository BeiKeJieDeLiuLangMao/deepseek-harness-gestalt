//! Thin Snow 0.10.0 adapter for Personal Pairing. Handshake tokens stay inside Snow.

use snow::{Builder, HandshakeState, params::NoiseParams};
use wasm_bindgen::prelude::*;

const PAIRING_PROTOCOL: &str = "Noise_XKpsk3_25519_ChaChaPoly_SHA256";
const PROLOGUE: &[u8] = b"dsh-mobile-companion-v1";
const MAX_NOISE_MESSAGE_BYTES: usize = 65_535;
const KEY_BYTES: usize = 32;

type ChannelResult<T> = Result<T, JsError>;

fn pairing_params() -> ChannelResult<NoiseParams> {
    PAIRING_PROTOCOL
        .parse()
        .map_err(|error| JsError::new(&format!("invalid Noise protocol: {error:?}")))
}

fn require_key(name: &str, value: &[u8]) -> ChannelResult<()> {
    if value.len() != KEY_BYTES {
        return Err(JsError::new(&format!("{name} must contain exactly {KEY_BYTES} bytes")));
    }
    Ok(())
}

fn psk32(psk: &[u8]) -> ChannelResult<[u8; KEY_BYTES]> {
    require_key("psk", psk)?;
    psk.try_into().map_err(|_| JsError::new("psk must contain exactly 32 bytes"))
}

/// Generate one X25519 static or ephemeral keypair as `private || public`.
#[wasm_bindgen]
pub fn generate_keypair() -> ChannelResult<Vec<u8>> {
    let pair = Builder::new(pairing_params()?)
        .generate_keypair()
        .map_err(|error| JsError::new(&format!("generate keypair: {error:?}")))?;
    let mut out = Vec::with_capacity(KEY_BYTES * 2);
    out.extend_from_slice(&pair.private);
    out.extend_from_slice(&pair.public);
    Ok(out)
}

fn initiator(
    mobile_static_private: &[u8],
    mobile_ephemeral_private: &[u8],
    desktop_public: &[u8],
    psk: &[u8],
) -> ChannelResult<HandshakeState> {
    require_key("mobile static", mobile_static_private)?;
    require_key("mobile ephemeral", mobile_ephemeral_private)?;
    require_key("desktop public", desktop_public)?;
    let key = psk32(psk)?;
    Ok(Builder::new(pairing_params()?)
        .local_private_key(mobile_static_private)
        .map_err(|error| JsError::new(&format!("set mobile static: {error:?}")))?
        .remote_public_key(desktop_public)
        .map_err(|error| JsError::new(&format!("set desktop public: {error:?}")))?
        .fixed_ephemeral_key_for_testing_only(mobile_ephemeral_private)
        .prologue(PROLOGUE)
        .map_err(|error| JsError::new(&format!("set initiator prologue: {error:?}")))?
        .psk(3, &key)
        .map_err(|error| JsError::new(&format!("set initiator psk: {error:?}")))?
        .build_initiator()
        .map_err(|error| JsError::new(&format!("build initiator: {error:?}")))?)
}

fn responder(
    desktop_static_private: &[u8],
    desktop_ephemeral_private: &[u8],
    psk: &[u8],
) -> ChannelResult<HandshakeState> {
    require_key("desktop static", desktop_static_private)?;
    require_key("desktop ephemeral", desktop_ephemeral_private)?;
    let key = psk32(psk)?;
    Ok(Builder::new(pairing_params()?)
        .local_private_key(desktop_static_private)
        .map_err(|error| JsError::new(&format!("set desktop static: {error:?}")))?
        .fixed_ephemeral_key_for_testing_only(desktop_ephemeral_private)
        .prologue(PROLOGUE)
        .map_err(|error| JsError::new(&format!("set responder prologue: {error:?}")))?
        .psk(3, &key)
        .map_err(|error| JsError::new(&format!("set responder psk: {error:?}")))?
        .build_responder()
        .map_err(|error| JsError::new(&format!("build responder: {error:?}")))?)
}

fn write_empty(state: &mut HandshakeState) -> ChannelResult<Vec<u8>> {
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let length = state
        .write_message(&[], &mut message)
        .map_err(|error| JsError::new(&format!("handshake write: {error:?}")))?;
    Ok(message[..length].to_vec())
}

fn read_empty(state: &mut HandshakeState, message: &[u8]) -> ChannelResult<()> {
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let length = state
        .read_message(message, &mut payload)
        .map_err(|error| JsError::new(&format!("handshake read: {error:?}")))?;
    if length != 0 {
        return Err(JsError::new("pairing handshake payload must be empty"));
    }
    Ok(())
}

/// Initiator message 1.
#[wasm_bindgen]
pub fn xkpsk3_initiator_msg1(
    mobile_static_private: &[u8],
    mobile_ephemeral_private: &[u8],
    desktop_public: &[u8],
    psk: &[u8],
) -> ChannelResult<Vec<u8>> {
    let mut state = initiator(mobile_static_private, mobile_ephemeral_private, desktop_public, psk)?;
    write_empty(&mut state)
}

/// Responder message 2 plus the handshake hash after that write: `message2 || hash`.
#[wasm_bindgen]
pub fn xkpsk3_responder_msg2(
    desktop_static_private: &[u8],
    desktop_ephemeral_private: &[u8],
    psk: &[u8],
    message1: &[u8],
) -> ChannelResult<Vec<u8>> {
    let mut state = responder(desktop_static_private, desktop_ephemeral_private, psk)?;
    read_empty(&mut state, message1)?;
    let message2 = write_empty(&mut state)?;
    let mut out = Vec::with_capacity(message2.len() + KEY_BYTES);
    out.extend_from_slice(&message2);
    out.extend_from_slice(state.get_handshake_hash());
    Ok(out)
}

/// Initiator message 3 plus the finished handshake hash: `message3 || hash`.
#[wasm_bindgen]
pub fn xkpsk3_initiator_msg3(
    mobile_static_private: &[u8],
    mobile_ephemeral_private: &[u8],
    desktop_public: &[u8],
    psk: &[u8],
    message2: &[u8],
) -> ChannelResult<Vec<u8>> {
    let mut state = initiator(mobile_static_private, mobile_ephemeral_private, desktop_public, psk)?;
    let _message1 = write_empty(&mut state)?;
    read_empty(&mut state, message2)?;
    let message3 = write_empty(&mut state)?;
    if !state.is_handshake_finished() {
        return Err(JsError::new("initiator handshake did not finish after message 3"));
    }
    let mut out = Vec::with_capacity(message3.len() + KEY_BYTES);
    out.extend_from_slice(&message3);
    out.extend_from_slice(state.get_handshake_hash());
    Ok(out)
}

/// Responder finish after message 3. Returns the finished handshake hash.
#[wasm_bindgen]
pub fn xkpsk3_responder_finish(
    desktop_static_private: &[u8],
    desktop_ephemeral_private: &[u8],
    psk: &[u8],
    message1: &[u8],
    message3: &[u8],
) -> ChannelResult<Vec<u8>> {
    let mut state = responder(desktop_static_private, desktop_ephemeral_private, psk)?;
    read_empty(&mut state, message1)?;
    let _message2 = write_empty(&mut state)?;
    read_empty(&mut state, message3)?;
    if !state.is_handshake_finished() {
        return Err(JsError::new("responder handshake did not finish after message 3"));
    }
    Ok(state.get_handshake_hash().to_vec())
}
