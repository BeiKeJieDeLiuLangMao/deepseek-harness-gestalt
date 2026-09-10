---
description: "The IM group map: account takeover, workspace routing, and simulation for external messaging platforms."
kind: "package-group"
---

# packages/im

English | [中文](README.zh.md)

## Summary

The IM group provides account takeover and message routing capabilities for external messaging platforms (such as DingTalk and Wangwang) into DeepSeek Harness workspaces. It enables authorized accounts to receive messages, route them to configured workspaces, apply group trigger rules, and run simulation testing without contacting live IM platforms.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`im-core`](im-core/README.md) | Domain configuration, account metadata, route rules, and simulation target binding | `ctx.imConfig` |
| [`im-dingtalk`](im-dingtalk/README.md) | DingTalk DWS adapter for message consumption, sending, and status inquiry | `ctx.imDingtalk` |

-----

<a id="related-documentation"></a>
## Related documentation

- [IM Account Takeover Specification](../../.agents/design/im-takeover/specification.md) — canonical problem statement, architecture contracts, and user stories.
- [IM Takeover Agent Note](../../.agents/notes/proposed/feature/2026-09-07-im-account-takeover.md) — architectural invariants and B0 grounding review.
