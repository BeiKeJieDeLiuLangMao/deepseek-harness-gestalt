# Agent Note: Foreground-only Companion synchronization

Status: implemented

English | [中文](2026-08-22-foreground-only-companion-synchronization.zh.md)

## Problem

A background alert could tell a person that a Desktop approval, question, completion, or failure needs attention, but the repository had only protocol records, token lifecycle, provider adapters, quotas, and tests rather than a shipped native delivery path. Keeping that dormant capability imposed credential, persistence, privacy, revocation, compatibility, and operational obligations. Notification state could also become stale before a person acted, so it could never authorize a Desktop mutation.

## Decision

Mobile Companion learns current state only after the user opens or foregrounds the application. Backgrounding stops the Relay WSS connection. Foregrounding reconnects with the selected Paired Desktop, and Desktop-authoritative synchronization completes before `companionMayMutate` enables any prompt, cancellation, approval, or human-question mutation.

The product contains no push-delivery capability. APNs and FCM adapters, payload records, registration tokens, persistence, revocation cleanup, quotas, metrics categories, deployment secrets, native dependencies, HTTP operations, and notification deep links are absent from shipped source and configuration. Pairing links remain because they carry one short-lived Pairing Challenge and no stale interaction authority.

The repository-level `verify-companion-no-push` gate scans shipped Mobile and Platform source, Platform package manifests, generated API source, Platform workflows, and the dependency lockfile. Its focused test proves that product-specific tokens fail while ordinary array `push()` calls remain valid. Mobile lifecycle tests prove background stop, serialized foreground reconnect, Desktop resynchronization before settlement, and grant removal on unpair.

This decision implements the notification-removal slice of the [real Companion product path](../../proposed/architecture/2026-08-22-real-companion-product-path.md). The earlier content-free notification decision is consolidated here because no production schema, configuration, migration, compatibility behavior, documentation promise, or supported-behavior test remains.

## Alternatives considered

**Keep dormant adapters and protocol records.** Rejected because unused schemas, token stores, quotas, provider payloads, and secret names would keep an unsupported capability and its privacy and operational obligations alive.

**Remove vendor adapters but preserve token and hint compatibility.** Rejected because no released Mobile product depends on those formats, and the pre-release repository does not promise compatibility for an unshipped path. Partial removal would preserve the broadest security-sensitive surfaces without delivering an alert.

**Keep WSS alive or run silent synchronization in the background.** Rejected because mobile operating systems do not provide a dependable background execution contract for this product. Foreground reconnection gives one explicit lifecycle owner and current Desktop authority.

**Let a notification action settle an interaction.** Rejected because an approval or question may have changed after the notification was created. Every mutation must observe current Desktop state after authenticated synchronization.

## Consequences

Mobile Companion cannot alert a backgrounded phone. A person must open or foreground the application before learning current Desktop state. In exchange, Platform stores no device notification token, requires no mobile-notification provider credential, and owns no delivery quota, payload, or failure telemetry.

Reintroducing background alerts requires a new product decision with a real iOS and Android delivery path, explicit provider privacy and retention rules, deployment-owned credentials, token revocation semantics, stale-interaction protections, native lifecycle evidence, and an update to the absence gate. Background delivery still cannot grant mutation authority.
