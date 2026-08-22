# Agent Note: First-run official DeepSeek listing

Status: implemented

English | [中文](2026-08-20-first-run-official-deepseek-listing.zh.md)

## Problem

A whole-section provider (`settingsPath: []`) is `configured` only when its user settings layer is occupied or a `role('secret')` slot is set. Official DeepSeek's `apiKeyEnv` is a credential-ref, not a secret slot. On a fresh first run both conditions are false, so a list that paints only `configured` rows shows neither the official row nor the setup card, and the user has no path to enter an API key.

Always listing the mounted official adapter reverses the shipped delete rule: after the user clears the official section, that row must leave the list and must not reappear under Add a provider.

## Decision

`configured` keeps the occupancy-or-secret-slot rule. First-run rendering is a separate list predicate, `listedProviderRows`.

The list includes a whole-section official row when any of these hold: occupancy, a described `credential.configured === true`, or a never-written section (`user` absent). Unsetting the section root leaves `user: {}`, which is the delete residual and stays off the list unless a credential is already stored. Closing the setup card does not keep a leftover `{}` row on the list; it only switches a never-written row from the setup card to an ordinary Edit row for the rest of the session.

The setup card is offered only while no other joined row can serve requests **and** the official credential is not yet stored. A never-written official row on an already-usable page is an ordinary Edit row, not a hidden row and not an auto-opened card. Delete folds the `settings.mutate` answer into the shared describe mirror before the page rejoins, because `ensure` will not re-read a mirror that is already ready.

The credential onboarding dialog stays registered. It writes the credential-ref only, so listing must treat the described credential as enough to keep the official row.

## Alternatives considered

**Treat a credential-ref on the resolved whole-section value as `configured`.** Rejected because the schema default still names `DEEPSEEK_API_KEY` after delete, so the official row would never leave the list.

**Always list official DeepSeek whenever it is mounted.** Rejected because that restores the row after delete even when another provider is already usable, and it is not offered under Add a provider.

**Treat leftover `user: {}` as first-run.** Rejected because that is exactly the residual unsetting the section root writes, and it is how delete hides the row.

## Consequences

A first-run user with no usable provider still reaches the official key field on Models, through the onboarding dialog or the setup card. After the dialog stores `DEEPSEEK_API_KEY`, Models shows the official Edit row without a user-layer write. After delete with no stored credential, official DeepSeek stays off the list in the same session, whether or not the setup card was closed first and whether or not another provider is usable. The join still reports `configured: false` for both the never-written section and the leftover empty object.

## Testing

`packages/client/ui-settings-models/tests/store.client.spec.ts` pins an empty user layer and empty `secrets` as unconfigured while still joining `DEEPSEEK_API_KEY`. `packages/client/ui-settings-models/tests/components.client.spec.tsx` pins `listedProviderRows` for never-written first-run, leftover `{}`, a stored credential on leftover `{}`, leftover `{}` after the setup card was closed, plus the matching mounted setup-card, post-delete list after dismissing setup, and never-written official row beside another usable provider. `packages/client/ui-settings-models/tests/store.client.spec.ts` pins folding a mutate answer into the describe mirror before the next join. The keyless `apps/web/tests/onboarding-deepseek-config.e2e.ts` and `apps/web/tests/onboarding-usable-provider.e2e.ts` lanes enter the key through the onboarding dialog and then assert the Models row.
