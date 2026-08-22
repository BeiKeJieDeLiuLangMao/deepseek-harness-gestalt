# Agent Note: Bind paired-device presentation to Mobile Installation identity

Status: implemented

English | [中文](2026-08-22-authenticated-mobile-installation-camera-pairing.zh.md)

## Problem

Personal Pairing accepted a phone name and platform in the completion request even though Platform authenticated only the Installation id and kind. A Mobile caller could therefore choose the device presentation shown by Desktop Settings independently of its Account Session. The Mobile page also delegated QR capture to an optional window hook, so the shipped Web entry had no camera flow and could not distinguish unsupported camera APIs from denied permission.

## Decision

Mobile begins a Login Attempt with a bounded name and iOS or Android platform read from the Capacitor Device adapter. Platform persists that presentation with the Login Attempt and Account Session, and `currentInstallation()` returns it only for an authenticated Mobile Installation. Personal Pairing removes device metadata from its completion request and copies the authenticated Installation presentation into pending and confirmed pairing records. Pairing time, last authenticated access, online state, and the independent Device Principal remain Desktop-authoritative projections; two Mobile Installations keep separate records and either pairing can be revoked without changing the other.

The Mobile page scans QR codes through browser `getUserMedia` and the maintained ZXing browser decoder. It displays the live camera preview, prefers the environment-facing camera, stops every media track after success, failure, cancellation, or unmount, and reports unsupported APIs, permission denial, missing cameras, empty QR results, and malformed complete links as visible pairing errors. Camera and paste values both enter `parsePairingInvitationLink()` before the same handshake path; no short code or QR-specific invitation parser exists.

## Alternatives considered

**Keep device metadata in the pairing request and sign it with the Installation key.** Rejected because the Account provider already owns authenticated Installation projection. Repeating identity fields in a later operation creates two authorities and permits them to drift.

**Keep a native scanner hook.** Rejected because the bundled Web entry could render a scan button without any implementation. Browser media capture plus a browser QR decoder gives the product page one observable permission and cleanup lifecycle across Capacitor WebViews and ordinary secure browser contexts.

**Use `BarcodeDetector` without a decoder dependency.** Rejected because that experimental API is unavailable in major browsers used by the Mobile product. ZXing uses the established browser media APIs while retaining one bounded decoding dependency.

## Consequences

Mobile sign-in now fails before OAuth traffic when Device information cannot identify an iOS or Android Installation or when its name is invalid. Existing Mobile Account Sessions without persisted presentation must sign in again before Remote Access can authenticate them. Product Mobile adds `@capacitor/device` and `@zxing/browser`; camera access requires a secure context and user permission. The keyless Loader snapshot proves two authenticated Mobile Installation projections and independent revocation, but remains development evidence and is not product-path acceptance.
