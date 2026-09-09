---
description: "The schedule group map: session-local durable reminders over the session log, for users and maintainers navigating the group."
kind: "package-group"
---

# schedule/ — Session-local reminders

English | [中文](README.zh.md)

## Summary

Use the schedule family for durable session-local reminders delivered as ordinary messages in the same conversation. Its Host package owns create, list, and delete tools plus optional retained-state projection; a separate browser package may display cached markers. Reminders survive restarts but never send email, SMS, or push notifications.

## Table of Contents

- [Group contract](#package-contract)
- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Group contract

The schedule group provides session-local reminders for a running conversation: ask the agent to remind you later, at an absolute time, or on a fixed interval, and each reminder arrives as an ordinary message in the same conversation when it comes due. Its host package owns the three management tools, including paused list and delete, and can publish retained records through the optional Session projection registry. The separate [`ui-schedule`](../client/ui-schedule/README.md) browser plugin is not mounted. [`ui-workspace`](../client/ui-workspace/README.md) may still mark ordinary and search rows whose best-effort list value is non-empty. That marker reports cached retained state, not a live runtime guarantee. Reminders survive restarts but stay inside the session: there is no email, SMS, or push notification. This page maps the group; each package README owns its contract.

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`schedule/`](schedule/README.md) | Session-local reminders: schedule, list, and cancel retained records including paused ones; publish an optional retained projection; deliver due reminders as conversation messages | — (tools only, in the exact agent scope) |

-----

<a id="related-documentation"></a>
## Related documentation

- [Session-local Schedule subsystem](../../docs/subsystems/schedule.md) — durable record, transition, view, and delivery contracts.
- [Generated tool catalog](../../docs/tool-catalog.md#deepseek-aidsh-schedule) — the `schedule_create`/`schedule_list`/`schedule_delete` schemas the model receives.
- [Schedule user guide](../../docs/user/guide/schedule.md) — the official configuration path for mounting the package.
- [Web Schedule catalog](../client/ui-schedule/README.md) — the optional read-only browser presentation; it is not currently mounted.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
