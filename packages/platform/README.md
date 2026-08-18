# Platform

English | [中文](README.zh.md)

Platform packages own installation-independent identity and session behavior used by DeepSeek Gestalt Desktop and Mobile. The group separates the Account Service Definition, its provider, public HTTP Consumer, and installation client.

| Package | npm name | Role | `ctx` key |
|---|---|---|---|
| [`platform-account/`](platform-account/README.md) | `@deepseek-ai/dsh-platform-account` | Account Service Definition and public types | `ctx.platformAccount` |
| [`platform-account-core/`](platform-account-core/README.md) | `@deepseek-ai/dsh-platform-account-core` | GitHub identity and current-installation Account Session provider | provides `ctx.platformAccount` |
| [`platform-account-http/`](platform-account-http/README.md) | `@deepseek-ai/dsh-platform-account-http` | Fixed callback and installation-session HTTP routes | Consumer |
| [`platform-account-client/`](platform-account-client/README.md) | `@deepseek-ai/dsh-platform-account-client` | Desktop/Mobile proof, protected storage, and account-scoped namespace client | Consumer library |
| [`remote-access/`](remote-access/README.md) | `@deepseek-ai/dsh-remote-access` | Mobile Access and Personal Pairing lifecycle, crypto adapter, and Companion-only Device Principals | `ctx.remoteAccess` |
| [`remote-protocol/`](remote-protocol/README.md) | `@deepseek-ai/dsh-remote-protocol` | Relay and encrypted Companion codecs, negotiation, errors, and limits | Pure protocol module |

Deployment persistence, shared invalidation transport, secrets, and observability adapters belong to the Platform composition root. The packages here define and exercise their required interfaces without embedding deployment credentials.
