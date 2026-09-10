# Agent Note: Production Platform mounts Project Membership HTTP

Status: implemented

English | [中文](2026-09-04-platform-membership-http.zh.md)

## Problem

Desktop Cloud Projects call create and presence heartbeat on the production origin. The operated image already mounted Account HTTP, Personal Pairing, Relay, and attachments, but not Project Membership, so those routes 405 on gestaltrun.com.

## Decision

`launchOperatedPlatform` mounts `@deepseek-ai/dsh-project-membership-core` immediately after Account HTTP, then `@deepseek-ai/dsh-project-membership-http` with the same product origins as Account (`environment.origin`, `https://localhost`, `capacitor://localhost`). In `PLATFORM_MEMBERSHIP_BACKEND=file` mode, the file-backed provider uses `environment: 'production'` from the operated identity and `storagePath` from `PLATFORM_MEMBERSHIP_STORAGE`, defaulting to `/var/lib/dsh/projects`. A whitespace-only override fails loud. Durable state is `<storagePath>/production/project-membership.json`. The image creates that directory for uid 10001 and declares it as a `VOLUME`; the host script mounts named volume `dsh-platform-membership` on the long-running `dsh-platform` container only, so a loopback candidate does not share the writer. `PLATFORM_MEMBERSHIP_STORAGE` stays optional because the default path is writable in the image.

Placement and role checks remain those of [the membership authority note](2026-08-27-project-membership-core.md). The [deletion decision](2026-09-09-mobile-account-deletion.md) selects shared PostgreSQL authority after an explicit cutover; the HTTP Consumer is the same in either mode.

## Alternatives considered

**Keep membership HTTP on Desktop-only keyless compositions until a shared backend exists.** Rejected because production already 405s on create and heartbeat; Desktop Cloud Projects need the routes on gestaltrun.com now.

**Require `PLATFORM_MEMBERSHIP_STORAGE` as a deploy secret.** Rejected because the image can write `/var/lib/dsh/projects`; an extra secret would only be needed if that path were unwritable.

**Mount the named volume on the loopback candidate as well.** Rejected because two processes on one file have no cross-process lock; the candidate is a readiness probe, not the serving writer.

**Swap the file provider for PostgreSQL in this ticket.** Rejected because the Service Definition already allows a later backend swap; this ticket only mounts the existing file provider.

## Consequences

Unauthenticated `POST /v1/projects` and `POST /v1/projects/presence/heartbeat` answer Account `401 AUTH_REQUIRED` instead of 404/405. Presence stays process-local until a shared `PresenceStore` exists, matching [the HTTP consumer](../../../../packages/platform/project-membership-http/README.md). File mode does not share membership writes across ECS instances; PostgreSQL mode requires the explicit all-instance cutover. Keyless coverage boots `launchOperatedPlatform` with fake PostgreSQL/Redis adapters and temp storage; it does not hit live ECS.
