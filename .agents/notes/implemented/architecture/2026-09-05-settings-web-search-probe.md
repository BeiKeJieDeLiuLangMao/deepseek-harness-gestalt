# Agent Note: Settings Remote web-search probe

Status: implemented

English | [中文](2026-09-05-settings-web-search-probe.zh.md)

## Problem

The Host configuration page probed the selected web-search backend without opening a Session. That call lived only on the temporary ApiProxy `settings.testWebSearch` method. The settings controller already owned the generated `settings` Remote namespace, so deleting ApiProxy would drop the probe unless the same method moved onto that controller.

## Decision

`SettingsController.testWebSearch` is a `@Remote` method on the existing `settings` namespace. It reads the optional `ctx.web` capability through `ctx.get('web')`, forwards the caller AbortSignal into `web.search`, and returns `{ count, title?, url? }` from the first source. An omitted query uses `deepseek harness`. A missing web capability or a provider throw is `gateway/internal`; abort is `gateway/cancelled`. The method does not open a Session and does not add a parallel HTTP route.

## Alternatives considered

**Keep the probe on ApiProxy until the whole package is deleted.** Rejected because the configuration page already consumes the generated settings namespace; leaving the probe behind would make ApiProxy deletion drop a live Host behavior.

**Add a new `web` Remote namespace.** Rejected because the caller is a settings page probing the currently selected backend, not a general web-search Remote. The existing settings namespace is the owner.

**Import `@deepseek-ai/dsh-web` as a required Host value.** Rejected because the web seam is optional at composition time. The controller narrows `ctx.get('web')` and reports absence as a named configuration error.

## Consequences

Deployments that mount `dsh-web` keep a Session-free search probe on `ctx.remote.settings.testWebSearch`. Deployments that omit the seam fail closed at invocation. ApiProxy still carries the old method until a later ticket deletes that package.
