//! Bounded cross-runtime proof for the Mobile Companion Noise dependency decision.

use serde::{Deserialize, Serialize};
use snow::{Builder, HandshakeState, Keypair, TransportState, params::NoiseParams};
use wasm_bindgen::prelude::*;

const PAIRING_PROTOCOL: &str = "Noise_XKpsk3_25519_ChaChaPoly_SHA256";
const RECONNECT_PROTOCOL: &str = "Noise_IK_25519_ChaChaPoly_SHA256";
const PROLOGUE: &[u8] = b"dsh-mobile-companion-v1";
const MAX_NOISE_MESSAGE_BYTES: usize = 65_535;
const MAX_TRANSPORT_PAYLOAD_BYTES: usize = MAX_NOISE_MESSAGE_BYTES - 16;
const RESOURCE_REJECTION_ATTEMPTS: usize = 16;

type ProofResult<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofReport<'a> {
    schema_version: u8,
    runtime: &'a str,
    engine: &'static str,
    all_pass: bool,
    protocols: [&'static str; 2],
    official_vectors: [&'static str; 2],
    target_flows: TargetFlows,
    attacks: AttackChecks,
    resources: ResourceChecks,
    key_storage: KeyStorageClaim,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlows {
    pairing_xkpsk3: &'static str,
    reconnect_ik: &'static str,
    fresh_ephemeral_keys: bool,
    bidirectional_transport: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttackChecks {
    tamper_rejected: bool,
    pairing_stale_transcript_rejected: bool,
    transport_replay_rejected: bool,
    ordering_rejected: bool,
    cross_pairing_rejected: bool,
    downgrade_rejected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResourceChecks {
    maximum_noise_message_bytes: usize,
    maximum_transport_payload_bytes: usize,
    maximum_size_round_trip: bool,
    oversize_attempts_rejected: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeyStorageClaim {
    private_material_at_rest: &'static str,
    x25519_execution: &'static str,
}

struct StaticPair {
    mobile: Keypair,
    desktop: Keypair,
}

struct CompletedFlow {
    first_ephemeral: [u8; 32],
    initiator: TransportState,
    responder: TransportState,
}

struct PairingStaleTranscriptCheck {
    first_message_accepted: bool,
    authenticated_message_rejected: bool,
}

#[derive(Deserialize)]
struct VectorSet {
    vectors: Vec<TestVector>,
}

#[derive(Deserialize)]
struct TestVector {
    protocol_name: String,
    init_prologue: String,
    #[serde(default)]
    init_psks: Vec<String>,
    init_static: String,
    init_ephemeral: String,
    init_remote_static: String,
    resp_prologue: String,
    #[serde(default)]
    resp_psks: Vec<String>,
    resp_static: String,
    resp_ephemeral: String,
    handshake_hash: String,
    messages: Vec<TestMessage>,
}

#[derive(Deserialize)]
struct TestMessage {
    payload: String,
    ciphertext: String,
}

fn params(protocol: &str) -> ProofResult<NoiseParams> {
    if protocol != PAIRING_PROTOCOL && protocol != RECONNECT_PROTOCOL {
        return Err(format!("Noise protocol is not allowlisted: {protocol}"));
    }
    protocol
        .parse()
        .map_err(|error| format!("invalid Noise protocol {protocol}: {error:?}"))
}

fn generate_static_pair() -> ProofResult<StaticPair> {
    let builder = Builder::new(params(PAIRING_PROTOCOL)?);
    let mobile = builder
        .generate_keypair()
        .map_err(|error| format!("generate mobile static key: {error:?}"))?;
    let desktop = builder
        .generate_keypair()
        .map_err(|error| format!("generate desktop static key: {error:?}"))?;
    Ok(StaticPair { mobile, desktop })
}

fn new_handshakes(
    protocol: &str,
    statics: &StaticPair,
    psk: Option<&[u8; 32]>,
) -> ProofResult<(HandshakeState, HandshakeState)> {
    let protocol_params = params(protocol)?;
    let mut initiator = Builder::new(protocol_params.clone())
        .local_private_key(&statics.mobile.private)
        .map_err(|error| format!("set mobile static key: {error:?}"))?
        .remote_public_key(&statics.desktop.public)
        .map_err(|error| format!("set expected desktop static key: {error:?}"))?
        .prologue(PROLOGUE)
        .map_err(|error| format!("set mobile prologue: {error:?}"))?;
    let mut responder = Builder::new(protocol_params)
        .local_private_key(&statics.desktop.private)
        .map_err(|error| format!("set desktop static key: {error:?}"))?
        .prologue(PROLOGUE)
        .map_err(|error| format!("set desktop prologue: {error:?}"))?;
    if let Some(key) = psk {
        initiator = initiator
            .psk(3, key)
            .map_err(|error| format!("set mobile PSK: {error:?}"))?;
        responder = responder
            .psk(3, key)
            .map_err(|error| format!("set desktop PSK: {error:?}"))?;
    }
    Ok((
        initiator
            .build_initiator()
            .map_err(|error| format!("build initiator: {error:?}"))?,
        responder
            .build_responder()
            .map_err(|error| format!("build responder: {error:?}"))?,
    ))
}

fn exchange_handshake(
    mut initiator: HandshakeState,
    mut responder: HandshakeState,
    expected_mobile: &[u8],
    expected_desktop: &[u8],
) -> ProofResult<CompletedFlow> {
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut first_ephemeral = None;

    while !initiator.is_handshake_finished() {
        if initiator.is_my_turn() {
            let length = initiator
                .write_message(&[], &mut message)
                .map_err(|error| format!("initiator handshake write: {error:?}"))?;
            if first_ephemeral.is_none() {
                first_ephemeral = Some(message[..32].try_into().map_err(|_| {
                    "first handshake message has no 32-byte ephemeral key".to_owned()
                })?);
            }
            responder
                .read_message(&message[..length], &mut payload)
                .map_err(|error| format!("responder handshake read: {error:?}"))?;
        } else {
            let length = responder
                .write_message(&[], &mut message)
                .map_err(|error| format!("responder handshake write: {error:?}"))?;
            initiator
                .read_message(&message[..length], &mut payload)
                .map_err(|error| format!("initiator handshake read: {error:?}"))?;
        }
    }

    if !responder.is_handshake_finished() {
        return Err("responder did not finish with initiator".to_owned());
    }
    if initiator.get_handshake_hash() != responder.get_handshake_hash() {
        return Err("handshake hashes differ".to_owned());
    }
    if initiator.get_remote_static() != Some(expected_desktop) {
        return Err("initiator authenticated a different Desktop static key".to_owned());
    }
    if responder.get_remote_static() != Some(expected_mobile) {
        return Err("responder authenticated a different Mobile static key".to_owned());
    }

    Ok(CompletedFlow {
        first_ephemeral: first_ephemeral
            .ok_or_else(|| "handshake emitted no ephemeral key".to_owned())?,
        initiator: initiator
            .into_transport_mode()
            .map_err(|error| format!("split initiator transport: {error:?}"))?,
        responder: responder
            .into_transport_mode()
            .map_err(|error| format!("split responder transport: {error:?}"))?,
    })
}

fn run_flow(
    protocol: &str,
    statics: &StaticPair,
    psk: Option<&[u8; 32]>,
) -> ProofResult<CompletedFlow> {
    let (initiator, responder) = new_handshakes(protocol, statics, psk)?;
    exchange_handshake(
        initiator,
        responder,
        &statics.mobile.public,
        &statics.desktop.public,
    )
}

fn assert_bidirectional_transport(flow: &mut CompletedFlow) -> ProofResult<()> {
    let mut ciphertext = [0_u8; 128];
    let mut plaintext = [0_u8; 128];
    let mobile_payload = b"mobile-to-desktop";
    let length = flow
        .initiator
        .write_message(mobile_payload, &mut ciphertext)
        .map_err(|error| format!("mobile transport write: {error:?}"))?;
    let decoded = flow
        .responder
        .read_message(&ciphertext[..length], &mut plaintext)
        .map_err(|error| format!("desktop transport read: {error:?}"))?;
    if &plaintext[..decoded] != mobile_payload {
        return Err("Desktop received different transport plaintext".to_owned());
    }

    let desktop_payload = b"desktop-to-mobile";
    let length = flow
        .responder
        .write_message(desktop_payload, &mut ciphertext)
        .map_err(|error| format!("desktop transport write: {error:?}"))?;
    let decoded = flow
        .initiator
        .read_message(&ciphertext[..length], &mut plaintext)
        .map_err(|error| format!("mobile transport read: {error:?}"))?;
    if &plaintext[..decoded] != desktop_payload {
        return Err("Mobile received different transport plaintext".to_owned());
    }
    Ok(())
}

fn vector_bytes(value: &str, field: &str) -> ProofResult<Vec<u8>> {
    hex::decode(value).map_err(|error| format!("invalid {field} hex: {error}"))
}

fn run_official_vector(vector: &TestVector) -> ProofResult<()> {
    let protocol_params = params(&vector.protocol_name)?;
    let init_static = vector_bytes(&vector.init_static, "init_static")?;
    let init_ephemeral = vector_bytes(&vector.init_ephemeral, "init_ephemeral")?;
    let init_remote_static = vector_bytes(&vector.init_remote_static, "init_remote_static")?;
    let resp_static = vector_bytes(&vector.resp_static, "resp_static")?;
    let resp_ephemeral = vector_bytes(&vector.resp_ephemeral, "resp_ephemeral")?;
    let init_prologue = vector_bytes(&vector.init_prologue, "init_prologue")?;
    let resp_prologue = vector_bytes(&vector.resp_prologue, "resp_prologue")?;

    let mut init_builder = Builder::new(protocol_params.clone())
        .local_private_key(&init_static)
        .map_err(|error| format!("vector initiator static: {error:?}"))?
        .remote_public_key(&init_remote_static)
        .map_err(|error| format!("vector initiator remote static: {error:?}"))?
        .fixed_ephemeral_key_for_testing_only(&init_ephemeral)
        .prologue(&init_prologue)
        .map_err(|error| format!("vector initiator prologue: {error:?}"))?;
    let mut resp_builder = Builder::new(protocol_params)
        .local_private_key(&resp_static)
        .map_err(|error| format!("vector responder static: {error:?}"))?
        .fixed_ephemeral_key_for_testing_only(&resp_ephemeral)
        .prologue(&resp_prologue)
        .map_err(|error| format!("vector responder prologue: {error:?}"))?;

    let vector_psks = if !vector.init_psks.is_empty() || !vector.resp_psks.is_empty() {
        if vector.init_psks.len() != 1 || vector.resp_psks.len() != 1 {
            return Err("target vector must contain exactly one PSK per peer".to_owned());
        }
        let init_psk: [u8; 32] = vector_bytes(&vector.init_psks[0], "init_psk")?
            .try_into()
            .map_err(|_| "init_psk is not 32 bytes".to_owned())?;
        let resp_psk: [u8; 32] = vector_bytes(&vector.resp_psks[0], "resp_psk")?
            .try_into()
            .map_err(|_| "resp_psk is not 32 bytes".to_owned())?;
        Some((init_psk, resp_psk))
    } else {
        None
    };
    if let Some((init_psk, resp_psk)) = &vector_psks {
        init_builder = init_builder
            .psk(3, init_psk)
            .map_err(|error| format!("vector initiator PSK: {error:?}"))?;
        resp_builder = resp_builder
            .psk(3, resp_psk)
            .map_err(|error| format!("vector responder PSK: {error:?}"))?;
    }

    let mut initiator = init_builder
        .build_initiator()
        .map_err(|error| format!("vector initiator: {error:?}"))?;
    let mut responder = resp_builder
        .build_responder()
        .map_err(|error| format!("vector responder: {error:?}"))?;
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut message_index = 0;

    while !initiator.is_handshake_finished() {
        let expected = vector
            .messages
            .get(message_index)
            .ok_or_else(|| "vector ends during handshake".to_owned())?;
        let expected_payload = vector_bytes(&expected.payload, "vector payload")?;
        let expected_ciphertext = vector_bytes(&expected.ciphertext, "vector ciphertext")?;
        let (sender, receiver) = if initiator.is_my_turn() {
            (&mut initiator, &mut responder)
        } else {
            (&mut responder, &mut initiator)
        };
        let length = sender
            .write_message(&expected_payload, &mut message)
            .map_err(|error| format!("vector handshake write {message_index}: {error:?}"))?;
        if message[..length] != expected_ciphertext {
            return Err(format!(
                "vector ciphertext differs at message {message_index}"
            ));
        }
        let decoded = receiver
            .read_message(&message[..length], &mut payload)
            .map_err(|error| format!("vector handshake read {message_index}: {error:?}"))?;
        if payload[..decoded] != expected_payload {
            return Err(format!("vector payload differs at message {message_index}"));
        }
        message_index += 1;
    }

    let expected_hash = vector_bytes(&vector.handshake_hash, "handshake_hash")?;
    if initiator.get_handshake_hash() != expected_hash
        || responder.get_handshake_hash() != expected_hash
    {
        return Err("vector handshake hash differs".to_owned());
    }
    let mut init_transport = initiator
        .into_transport_mode()
        .map_err(|error| format!("vector initiator split: {error:?}"))?;
    let mut resp_transport = responder
        .into_transport_mode()
        .map_err(|error| format!("vector responder split: {error:?}"))?;
    while let Some(expected) = vector.messages.get(message_index) {
        let expected_payload = vector_bytes(&expected.payload, "vector transport payload")?;
        let expected_ciphertext =
            vector_bytes(&expected.ciphertext, "vector transport ciphertext")?;
        let (sender, receiver) = if message_index % 2 == 0 {
            (&mut init_transport, &mut resp_transport)
        } else {
            (&mut resp_transport, &mut init_transport)
        };
        let length = sender
            .write_message(&expected_payload, &mut message)
            .map_err(|error| format!("vector transport write {message_index}: {error:?}"))?;
        if message[..length] != expected_ciphertext {
            return Err(format!(
                "vector transport ciphertext differs at message {message_index}"
            ));
        }
        let decoded = receiver
            .read_message(&message[..length], &mut payload)
            .map_err(|error| format!("vector transport read {message_index}: {error:?}"))?;
        if payload[..decoded] != expected_payload {
            return Err(format!(
                "vector transport payload differs at message {message_index}"
            ));
        }
        message_index += 1;
    }
    Ok(())
}

fn run_official_vectors() -> ProofResult<()> {
    let vectors: VectorSet =
        serde_json::from_str(include_str!("../vectors/official-noise-v34.json"))
            .map_err(|error| format!("parse official vectors: {error}"))?;
    if vectors.vectors.len() != 2 {
        return Err("proof requires exactly the two target vectors".to_owned());
    }
    for protocol in [PAIRING_PROTOCOL, RECONNECT_PROTOCOL] {
        if vectors
            .vectors
            .iter()
            .filter(|vector| vector.protocol_name == protocol)
            .count()
            != 1
        {
            return Err(format!("proof requires exactly one {protocol} vector"));
        }
    }
    for vector in &vectors.vectors {
        if vector.messages.len() != 6 {
            return Err(format!(
                "official {} vector must contain all six upstream messages",
                vector.protocol_name
            ));
        }
        run_official_vector(vector)?;
    }
    Ok(())
}

fn tamper_is_rejected(statics: &StaticPair, psk: &[u8; 32]) -> ProofResult<bool> {
    let (mut initiator, mut responder) = new_handshakes(PAIRING_PROTOCOL, statics, Some(psk))?;
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let length = initiator
        .write_message(&[], &mut message)
        .map_err(|error| format!("tamper first write: {error:?}"))?;
    responder
        .read_message(&message[..length], &mut payload)
        .map_err(|error| format!("tamper first read: {error:?}"))?;
    let length = responder
        .write_message(&[], &mut message)
        .map_err(|error| format!("tamper response write: {error:?}"))?;
    message[length - 1] ^= 1;
    Ok(initiator
        .read_message(&message[..length], &mut payload)
        .is_err())
}

fn completed_handshake_transcript(
    protocol: &str,
    statics: &StaticPair,
    psk: Option<&[u8; 32]>,
) -> ProofResult<Vec<Vec<u8>>> {
    let (mut initiator, mut responder) = new_handshakes(protocol, statics, psk)?;
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut transcript = Vec::new();

    while !initiator.is_handshake_finished() {
        let (sender, receiver) = if initiator.is_my_turn() {
            (&mut initiator, &mut responder)
        } else {
            (&mut responder, &mut initiator)
        };
        let length = sender
            .write_message(&[], &mut message)
            .map_err(|error| format!("transcript handshake write: {error:?}"))?;
        let captured = message[..length].to_vec();
        receiver
            .read_message(&captured, &mut payload)
            .map_err(|error| format!("transcript handshake read: {error:?}"))?;
        transcript.push(captured);
    }
    if !responder.is_handshake_finished() {
        return Err("transcript responder did not finish with initiator".to_owned());
    }
    Ok(transcript)
}

fn pairing_stale_transcript_is_rejected(
    statics: &StaticPair,
    psk: &[u8; 32],
) -> ProofResult<PairingStaleTranscriptCheck> {
    let transcript = completed_handshake_transcript(PAIRING_PROTOCOL, statics, Some(psk))?;
    if transcript.len() != 3 {
        return Err("XKpsk3 transcript must contain three handshake messages".to_owned());
    }

    let (_, mut fresh_responder) = new_handshakes(PAIRING_PROTOCOL, statics, Some(psk))?;
    let mut fresh_response = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let first_message_accepted = fresh_responder
        .read_message(&transcript[0], &mut payload)
        .is_ok();
    if !first_message_accepted {
        return Ok(PairingStaleTranscriptCheck {
            first_message_accepted,
            authenticated_message_rejected: false,
        });
    }
    if !fresh_responder.is_my_turn() {
        return Err("fresh pairing responder did not reach its response turn".to_owned());
    }
    fresh_responder
        .write_message(&[], &mut fresh_response)
        .map_err(|error| format!("fresh pairing response write: {error:?}"))?;
    if fresh_responder.is_my_turn() {
        return Err("fresh pairing responder did not reach authenticated read turn".to_owned());
    }
    let authenticated_message_rejected = fresh_responder
        .read_message(&transcript[2], &mut payload)
        .is_err();
    Ok(PairingStaleTranscriptCheck {
        first_message_accepted,
        authenticated_message_rejected,
    })
}

fn transport_replay_is_rejected(mut flow: CompletedFlow) -> ProofResult<bool> {
    let mut message = [0_u8; 64];
    let mut payload = [0_u8; 64];
    let length = flow
        .initiator
        .write_message(b"once", &mut message)
        .map_err(|error| format!("transport replay write: {error:?}"))?;
    flow.responder
        .read_message(&message[..length], &mut payload)
        .map_err(|error| format!("transport replay first read: {error:?}"))?;
    Ok(flow
        .responder
        .read_message(&message[..length], &mut payload)
        .is_err())
}

fn ordering_is_rejected(mut flow: CompletedFlow) -> ProofResult<bool> {
    let mut first = [0_u8; 64];
    let mut second = [0_u8; 64];
    let mut payload = [0_u8; 64];
    flow.initiator
        .write_message(b"first", &mut first)
        .map_err(|error| format!("ordering first write: {error:?}"))?;
    let second_length = flow
        .initiator
        .write_message(b"second", &mut second)
        .map_err(|error| format!("ordering second write: {error:?}"))?;
    Ok(flow
        .responder
        .read_message(&second[..second_length], &mut payload)
        .is_err())
}

fn cross_pairing_is_rejected(statics: &StaticPair, psk: &[u8; 32]) -> ProofResult<bool> {
    let other = generate_static_pair()?;
    let protocol_params = params(PAIRING_PROTOCOL)?;
    let mut initiator = Builder::new(protocol_params.clone())
        .local_private_key(&statics.mobile.private)
        .map_err(|error| format!("cross-pairing mobile static: {error:?}"))?
        .remote_public_key(&statics.desktop.public)
        .map_err(|error| format!("cross-pairing expected Desktop: {error:?}"))?
        .psk(3, psk)
        .map_err(|error| format!("cross-pairing mobile PSK: {error:?}"))?
        .prologue(PROLOGUE)
        .map_err(|error| format!("cross-pairing mobile prologue: {error:?}"))?
        .build_initiator()
        .map_err(|error| format!("cross-pairing initiator: {error:?}"))?;
    let mut wrong_responder = Builder::new(protocol_params)
        .local_private_key(&other.desktop.private)
        .map_err(|error| format!("cross-pairing wrong Desktop: {error:?}"))?
        .psk(3, psk)
        .map_err(|error| format!("cross-pairing Desktop PSK: {error:?}"))?
        .prologue(PROLOGUE)
        .map_err(|error| format!("cross-pairing Desktop prologue: {error:?}"))?
        .build_responder()
        .map_err(|error| format!("cross-pairing responder: {error:?}"))?;
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut payload = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let length = initiator
        .write_message(&[], &mut message)
        .map_err(|error| format!("cross-pairing write: {error:?}"))?;
    Ok(wrong_responder
        .read_message(&message[..length], &mut payload)
        .is_err())
}

fn downgrade_is_rejected() -> bool {
    let offered = [
        "Noise_XK_25519_ChaChaPoly_SHA256",
        "Noise_XKpsk3_25519_AESGCM_SHA256",
        "Noise_IK_25519_AESGCM_SHA256",
        "Noise_IK_25519_ChaChaPoly_BLAKE2s",
    ];
    offered.iter().all(|candidate| params(candidate).is_err())
}

fn resource_limits_hold(mut flow: CompletedFlow) -> ProofResult<ResourceChecks> {
    let payload = vec![0xa5; MAX_TRANSPORT_PAYLOAD_BYTES];
    let mut message = vec![0_u8; MAX_NOISE_MESSAGE_BYTES];
    let mut decoded = vec![0_u8; MAX_TRANSPORT_PAYLOAD_BYTES];
    let length = flow
        .initiator
        .write_message(&payload, &mut message)
        .map_err(|error| format!("maximum transport write: {error:?}"))?;
    let decoded_length = flow
        .responder
        .read_message(&message[..length], &mut decoded)
        .map_err(|error| format!("maximum transport read: {error:?}"))?;
    let maximum_size_round_trip = length == MAX_NOISE_MESSAGE_BYTES
        && decoded_length == MAX_TRANSPORT_PAYLOAD_BYTES
        && decoded == payload;

    let oversized = vec![0_u8; MAX_NOISE_MESSAGE_BYTES + 1];
    let mut rejected = 0;
    for _ in 0..RESOURCE_REJECTION_ATTEMPTS {
        if flow
            .responder
            .read_message(&oversized, &mut decoded)
            .is_err()
        {
            rejected += 1;
        }
    }
    Ok(ResourceChecks {
        maximum_noise_message_bytes: MAX_NOISE_MESSAGE_BYTES,
        maximum_transport_payload_bytes: MAX_TRANSPORT_PAYLOAD_BYTES,
        maximum_size_round_trip,
        oversize_attempts_rejected: rejected,
    })
}

fn proof_report(runtime: &str) -> ProofResult<ProofReport<'_>> {
    run_official_vectors()?;
    let statics = generate_static_pair()?;
    let psk = [0x5a; 32];

    let mut first_pairing = run_flow(PAIRING_PROTOCOL, &statics, Some(&psk))?;
    let second_pairing = run_flow(PAIRING_PROTOCOL, &statics, Some(&psk))?;
    let mut first_reconnect = run_flow(RECONNECT_PROTOCOL, &statics, None)?;
    let second_reconnect = run_flow(RECONNECT_PROTOCOL, &statics, None)?;
    let fresh_ephemeral_keys = first_pairing.first_ephemeral != second_pairing.first_ephemeral
        && first_reconnect.first_ephemeral != second_reconnect.first_ephemeral;
    assert_bidirectional_transport(&mut first_pairing)?;
    assert_bidirectional_transport(&mut first_reconnect)?;

    let tamper_rejected = tamper_is_rejected(&statics, &psk)?;
    let stale_pairing = pairing_stale_transcript_is_rejected(&statics, &psk)?;
    let pairing_stale_transcript_rejected =
        stale_pairing.first_message_accepted && stale_pairing.authenticated_message_rejected;
    let transport_replay_rejected =
        transport_replay_is_rejected(run_flow(RECONNECT_PROTOCOL, &statics, None)?)?;
    let ordering_rejected = ordering_is_rejected(run_flow(RECONNECT_PROTOCOL, &statics, None)?)?;
    let cross_pairing_rejected = cross_pairing_is_rejected(&statics, &psk)?;
    let downgrade_rejected = downgrade_is_rejected();
    let resources = resource_limits_hold(run_flow(RECONNECT_PROTOCOL, &statics, None)?)?;

    let all_pass = fresh_ephemeral_keys
        && tamper_rejected
        && pairing_stale_transcript_rejected
        && transport_replay_rejected
        && ordering_rejected
        && cross_pairing_rejected
        && downgrade_rejected
        && resources.maximum_size_round_trip
        && resources.oversize_attempts_rejected == RESOURCE_REJECTION_ATTEMPTS;
    if !all_pass {
        return Err("one or more Noise security checks failed".to_owned());
    }

    Ok(ProofReport {
        schema_version: 2,
        runtime,
        engine: "snow 0.10.0 compiled to WebAssembly",
        all_pass,
        protocols: [PAIRING_PROTOCOL, RECONNECT_PROTOCOL],
        official_vectors: [PAIRING_PROTOCOL, RECONNECT_PROTOCOL],
        target_flows: TargetFlows {
            pairing_xkpsk3: "pass",
            reconnect_ik: "pass",
            fresh_ephemeral_keys,
            bidirectional_transport: true,
        },
        attacks: AttackChecks {
            tamper_rejected,
            pairing_stale_transcript_rejected,
            transport_replay_rejected,
            ordering_rejected,
            cross_pairing_rejected,
            downgrade_rejected,
        },
        resources,
        key_storage: KeyStorageClaim {
            private_material_at_rest: "native OS hardware-backed wrapping where available",
            x25519_execution: "snow WASM process memory; not claimed hardware-backed",
        },
    })
}

/// Run the complete proof and return a stable JSON report.
#[wasm_bindgen]
pub fn run_proof_json(runtime: &str) -> Result<String, JsError> {
    serde_json::to_string_pretty(&proof_report(runtime).map_err(|error| JsError::new(&error))?)
        .map_err(|error| JsError::new(&format!("serialize proof report: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_security_path_passes() {
        let report = proof_report("rust-test").expect("proof must pass");
        assert!(report.target_flows.fresh_ephemeral_keys);
        assert_eq!(
            report.resources.oversize_attempts_rejected,
            RESOURCE_REJECTION_ATTEMPTS
        );
    }

    #[test]
    fn official_vectors_include_every_upstream_message() {
        let vectors: VectorSet =
            serde_json::from_str(include_str!("../vectors/official-noise-v34.json"))
                .expect("official vectors must parse");
        assert!(
            vectors
                .vectors
                .iter()
                .all(|vector| vector.messages.len() == 6)
        );
    }

    #[test]
    fn completed_pairing_transcript_fails_at_fresh_session_authentication() {
        let statics = generate_static_pair().expect("static keys must generate");
        let result = pairing_stale_transcript_is_rejected(&statics, &[0x5a; 32])
            .expect("stale transcript check must execute");
        assert!(result.first_message_accepted);
        assert!(result.authenticated_message_rejected);
    }
}
