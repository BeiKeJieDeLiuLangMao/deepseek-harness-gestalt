# Agent Note: phone-stream device listing route and the ui-phone listing source

Status: implemented

English | [中文](2026-08-28-phone-device-listing-route.zh.md)

## Problem

The mobile device dock reached ticket #407 with the Host exposing only `POST /phone/session`: nothing served the fleet listing, so `ui-phone` shipped the no-op `NULL_PHONE_BADGE_SOURCE` and the picker rows, the connected dropdown, and the strip badge count stayed dark. The listing route had to feed a browser tab without tokens, without changing `phone-runtime` or `tool-phone` public semantics, and without letting one Consumer dictate the service contract.

## Decision

`phone-stream` serves `GET /phone/devices` behind the same `/api` trust fence as session minting (GET-only, exact path): the handler calls `ctx.phoneDevices.listDevices()` and projects each ref onto the documented `id` / `name` / `kind` / `state` / `online` response fields — the upstream state verbatim per the #421 wire, `online` derived, and the GUI's unauthorized arm keyed on `state === 'unauthorized'` — grouped as `android` / `ios.simulators` / `ios.reals`. Projection is explicit because the runtime's `PhoneDeviceRef` keeps the validated `platform` field for entry-level classification while the response communicates platform through group membership; forwarding verbatim would duplicate that fact and expand the response fields. Host types retain `DeviceId` for each projected `id`, which JSON serializes as a string.

`ui-phone` replaces the null source with `PhoneListingSource` (`getBadge`, `snapshot`, `refresh`, `subscribe`), consumed from the route by `createHttpPhoneListingSource`. A refresh validates the response fields, brands every non-empty id before publishing listing views, and maps emulator and simulator kinds onto the 模拟器 group and real handsets onto USB 真机. Persisted tab metadata, Desktop overlay selections, environment snapshots, stream sessions, agent status, and gateway calls retain `DeviceId` after the corresponding JSON parser validates the string. The source commits only on success — `snapshot()` keeps one frozen reference between commits, so both tab bodies seat it in `useSyncExternalStore` (the same owning-observable precedent as the per-tab connection controller; better-sidebar tab hosts have no slot hook channel). The picker pulls on mount only while the enable gate is on (a disabled deployment still discovers nothing) and re-pulls from the now-enabled 重新检测环境 control; a connected tab pulls on mount so a layout-restored dropdown lights up without a picker visit.

## Alternatives considered

**Signing the listing URL like capture URLs.** Rejected: tokens protect cross-origin frame loads, while the listing feeds same-origin render code that the `/api` fence already gates; a signature would add mint round trips for no threat the fence does not cover.

**Forwarding `listDevices()` verbatim.** Rejected: the grouped runtime entries include the validated `platform` field for direct entry inspection; the route already communicates that fact through its groups, so repeating it would expand the response fields without a consumer need.

**Keeping the synchronous `listDevices(platform)` face and a local refresh counter in `PhoneTab`.** Rejected: an async fleet needs a commit notification anyway; a tick counter would leave the connected dropdown stale until an unrelated re-render, and split one listing across two update paths.

## Consequences

The picker rows (meta OS·state, unauthorized warn arm), 打开 actions, connected dropdown, and badge online count read real fleet data with no new dependency and no `phone-runtime` change. Refresh failures keep the committed listing and re-arm the control; the badge value still updates only when the strip re-renders (the documented better-sidebar pill limitation). The Plugins-tab environment card still reads `PhoneEnvironmentSource` — the environment wizard and the fleet listing are separate seams.
