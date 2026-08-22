# Agent Note: Bind paired-device presentation to Mobile Installation identity

Status: implemented

English | [中文](2026-08-22-authenticated-mobile-installation-camera-pairing.zh.md)

## Problem

Personal Pairing accepted a phone name and platform in the completion request even though Platform authenticated only the Installation id and kind. A Mobile caller could therefore choose the device presentation shown by Desktop Settings independently of its Account Session. The Mobile page also delegated QR capture to an optional window hook, so the shipped Web entry had no camera flow and could not distinguish unsupported camera APIs from denied permission.

## Decision

Mobile begins a Login Attempt with a bounded name and iOS or Android platform read from the Capacitor Device adapter. Platform persists that presentation with the Login Attempt and Account Session, and `currentInstallation()` returns it only for an authenticated Mobile Installation. Personal Pairing removes device metadata from its completion request and copies the authenticated Installation presentation into pending and confirmed pairing records. A Mobile Relay credential is bound to that pairing by a content-free fingerprint; authenticated attach, heartbeat, and ciphertext access update durable `online` and `lastAccessAt` state, while attachment cleanup sets only `online` to false. Desktop Settings reads those authoritative fields and renders the name, platform, pairing time, current presence, and last access. Two Mobile Installations keep separate records and either pairing can be revoked without changing the other.

The Mobile page scans QR codes through browser `getUserMedia` and the maintained ZXing browser decoder. It displays the live camera preview, prefers the environment-facing camera, and owns ZXing scanner controls so success, failure, cancellation, or unmount stops both the decoder retry scheduler and every media track before the scan settles. Unsupported APIs, permission denial, missing cameras, empty QR results, and malformed complete links become visible pairing errors. Camera and paste values both enter `parsePairingInvitationLink()` before the same handshake path; no short code or QR-specific invitation parser exists.

## Alternatives considered

**Keep device metadata in the pairing request and sign it with the Installation key.** Rejected because the Account provider already owns authenticated Installation projection. Repeating identity fields in a later operation creates two authorities and permits them to drift.

**Keep a native scanner hook.** Rejected because the bundled Web entry could render a scan button without any implementation. Browser media capture plus a browser QR decoder gives the product page one observable permission and cleanup lifecycle across Capacitor WebViews and ordinary secure browser contexts.

**Use `BarcodeDetector` without a decoder dependency.** Rejected because that experimental API is unavailable in major browsers used by the Mobile product. ZXing uses the established browser media APIs while retaining one bounded decoding dependency.

## Consequences

Mobile sign-in now fails before OAuth traffic when Device information cannot identify an iOS or Android Installation or when its name is invalid. Existing Mobile Account Sessions without persisted presentation must sign in again before Remote Access can authenticate them; PostgreSQL quota admission checks their stale-row existence without decoding the missing presentation, so that forced re-login can atomically replace them. Product Mobile adds `@capacitor/device` and `@zxing/browser`; camera access requires a secure context and user permission. The keyless Loader snapshots prove two authenticated Mobile Installation projections, independent revocation, and Relay activity transitions, but remain development evidence and are not product-path acceptance.
