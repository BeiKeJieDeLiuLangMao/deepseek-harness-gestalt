---
description: "The Platform package group: Account Sessions, Project Membership, Personal Pairing, Remote Relay, encrypted attachments, and their clients and transports."
kind: "package-group"
---

# Platform

English | [中文](README.zh.md)

## Summary

Platform packages own installation-independent identity and session behavior used by DeepSeek Gestalt Desktop and Mobile. The group separates Service Definitions, providers, public HTTP Consumers, installation clients, codecs, and coordination adapters. Deployment persistence, shared invalidation transport, secrets, and observability adapters belong to the Platform composition root; these packages define and exercise their required interfaces without embedding deployment credentials.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Sixteen packages cover account identity, cloud-project membership, encrypted pairing and Relay transport, and attachment delivery.

| Package | npm name | Role | `ctx` key |
|---|---|---|---|
| [`platform-account/`](platform-account/README.md) | `@deepseek-ai/dsh-platform-account` | Account Service Definition and public types | `ctx.platformAccount` |
| [`platform-account-core/`](platform-account-core/README.md) | `@deepseek-ai/dsh-platform-account-core` | GitHub identity and current-installation Account Session provider | provides `ctx.platformAccount` |
| [`platform-account-http/`](platform-account-http/README.md) | `@deepseek-ai/dsh-platform-account-http` | Fixed callback and installation-session HTTP routes | Consumer |
| [`platform-account-client/`](platform-account-client/README.md) | `@deepseek-ai/dsh-platform-account-client` | Desktop/Mobile proof, protected storage, and account-scoped namespace client | Consumer library |
| [`project-membership/`](project-membership/README.md) | `@deepseek-ai/dsh-project-membership` | Project Membership Service Definition and public types | `ctx.projectMembership` |
| [`project-membership-core/`](project-membership-core/README.md) | `@deepseek-ai/dsh-project-membership-core` | Durable membership, invitation, and role Provider | provides `ctx.projectMembership` |
| [`project-membership-http/`](project-membership-http/README.md) | `@deepseek-ai/dsh-project-membership-http` | Project registry, roster, invitation, and member-administration HTTP routes | Consumer |
| [`project-membership-client/`](project-membership-client/README.md) | `@deepseek-ai/dsh-project-membership-client` | Browser transport for project membership and administration | Consumer library |
| [`project-membership-desktop/`](project-membership-desktop/README.md) | `@deepseek-ai/dsh-project-membership-desktop` | Desktop-authenticated read provider for agent presets | `ctx.desktopProjectMembership` |
| [`noise-channel/`](noise-channel/README.md) | `@deepseek-ai/dsh-noise-channel` | Snow XKpsk3 pairing, attachment-bound IK, and encrypted Companion message channel | Endpoint library |
| [`remote-access/`](remote-access/README.md) | `@deepseek-ai/dsh-remote-access` | Mobile Access and Personal Pairing lifecycle, crypto adapter, and Companion-only Device Principals | `ctx.remoteAccess` |
| [`remote-access-client/`](remote-access-client/README.md) | `@deepseek-ai/dsh-remote-access-client` | Pairing HTTP transport and reconnecting Mobile/Desktop Relay lifecycle | Consumer library |
| [`remote-access-http/`](remote-access-http/README.md) | `@deepseek-ai/dsh-remote-access-http` | Pairing HTTP and Relay WSS Consumers | Consumer |
| [`remote-access-redis/`](remote-access-redis/README.md) | `@deepseek-ai/dsh-remote-access-redis` | Expiring Relay directory, invalidation, and direct ciphertext Pub/Sub | Coordination adapter |
| [`remote-protocol/`](remote-protocol/README.md) | `@deepseek-ai/dsh-remote-protocol` | Relay and encrypted Companion codecs, negotiation, errors, and limits | Pure protocol module |
| [`remote-attachments/`](remote-attachments/README.md) | `@deepseek-ai/dsh-remote-attachments` | Pairing-scoped encrypted attachment blob store and HTTPS Consumer | `ctx.remoteAttachments` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Platform Account subsystem](../../docs/subsystems/platform-account.md) — Account identity, authorization, installation proof, and routes.
- [Project Membership subsystem](../../docs/subsystems/project-membership.md) — cloud projects, roles, invitations, presence, and member questions.
- [Remote Protocol subsystem](../../docs/subsystems/remote-protocol.md) — Personal Pairing, Relay transport, encrypted Companion messages, and attachments.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
