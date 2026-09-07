---
description: "Browser client for Project Membership cloud-project creation, roster, presence heartbeat and close, invitations, and member administration over the /v1/projects routes."
kind: "package-reference"
---

# `@deepseek-ai/dsh-project-membership-client`

English | [中文](README.zh.md)

## Summary

Browser client for Project Membership over the HTTP consumer's `/v1/projects` routes. `ProjectMembershipHttpTransport` maps cloud-project creation, current-Account Project recovery by normalized remote, presence-decorated roster reads, presence heartbeat and last-window close, GitHub-login invitation issue with a granted role, decision, retraction, trusted invitee cards that include that role, and authoritative project-scoped issued-invitation reads, plus member role, function-tag, and removal administration, onto the wire contract. Creation and remote recovery return the authenticated Account id beside the Project so the Desktop composition can persist an exact local binding without exposing credentials. `projectByRemote` treats HTTP 204 and production HTTP 404 as unbound rather than a transport failure. `pendingInvitations` treats production HTTP 404 as an empty list. Every request carries caller-supplied Account session presentation headers and never exposes the installation signing key. Non-OK answers keep the stable envelope: the transport parses `{ error: { code, message } }` and rejects with a `ProjectMembershipClientError` carrying the domain code and HTTP status, so a 403 role gate surfaces as `ROLE_REQUIRED`/403; a non-JSON proxy failure falls back to `HTTP_<status>`. Every success payload is parsed from `unknown` before it reaches the UI. `ProjectMembershipClient` is the credential-free operation face that a Desktop-owned authenticated adapter provides to renderer consumers.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as the transport never contributes model-visible state.

#### KV Cache effect

None.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Local Git inspection, clone, Workspace registration, and Account/Project binding remain Host and UI composition responsibilities.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
