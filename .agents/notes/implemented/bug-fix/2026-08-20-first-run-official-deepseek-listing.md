# Agent Note: First-run official DeepSeek listing

Status: implemented

English | [中文](2026-08-20-first-run-official-deepseek-listing.zh.md)

## Problem

A whole-section provider (`settingsPath: []`) is `configured` only when its user settings layer is occupied or a `role('secret')` slot is set. Official DeepSeek's `apiKeyEnv` is a credential-ref, not a secret slot. On a fresh first run both conditions are false, so a list that paints only `configured` rows shows neither the official row nor the setup card, and the user has no path to enter an API key.

Always listing the mounted official adapter reverses the shipped delete rule: after the user clears the official section, that row must leave the list and must not reappear under Add a provider.

## Decision

`configured` keeps the occupancy-or-secret-slot rule. First-run rendering is a separate list predicate, `listedProviderRows`.

The setup card is offered only while no other joined row can serve requests **and** the official namespace has no `user` property. That absent property is a never-written section. Unsetting the section root leaves `user: {}`, which is the delete residual and stays off the list. Closing the setup card still keeps the row for the rest of the session through `dismissedSetup`. Occupied official DeepSeek remains an ordinary row.

The credential onboarding dialog stays unregistered. The Models setup card is the first-run key entry.

## Alternatives considered

**Treat a credential-ref on the resolved whole-section value as `configured`.** Rejected because the schema default still names `DEEPSEEK_API_KEY` after delete, so the official row would never leave the list.

**Always list official DeepSeek whenever it is mounted.** Rejected because that restores the row after delete even when another provider is already usable, and it is not offered under Add a provider.

**Treat leftover `user: {}` as first-run.** Rejected because that is exactly the residual unsetting the section root writes, and it is how delete hides the row.

## Consequences

A first-run user with no usable provider still reaches the official key field on Models. After delete, official DeepSeek stays off the list whether or not another provider is usable. The join still reports `configured: false` for both the never-written section and the leftover empty object.

## Testing

`packages/client/ui-settings-models/tests/store.client.spec.ts` pins an empty user layer and empty `secrets` as unconfigured while still joining `DEEPSEEK_API_KEY`. `packages/client/ui-settings-models/tests/components.client.spec.tsx` pins `listedProviderRows` for never-written first-run, leftover `{}`, another usable provider, and `dismissedSetup`, plus the matching mounted setup-card and post-delete list. The keyless `apps/web/tests/onboarding-deepseek-config.e2e.ts` and `apps/web/tests/onboarding-usable-provider.e2e.ts` lanes enter the key through that setup card.
