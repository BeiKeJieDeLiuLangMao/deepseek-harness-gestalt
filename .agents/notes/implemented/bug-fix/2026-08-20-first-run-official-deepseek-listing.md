# Agent Note: First-run official DeepSeek listing

Status: implemented

English | [中文](2026-08-20-first-run-official-deepseek-listing.zh.md)

## Problem

A whole-section provider (`settingsPath: []`) is `configured` only when its user settings layer is occupied or a `role('secret')` slot is set. Official DeepSeek's `apiKeyEnv` is a credential-ref, not a secret slot. On a fresh first run both conditions are false, so a list that paints only `configured` rows shows neither the official row nor the setup card, and the user has no path to enter an API key.

Always listing the mounted official adapter reverses the shipped delete rule: after the user clears the official section, that row must leave the list and must not reappear under Add a provider.

## Decision

`configured` keeps the occupancy-or-secret-slot rule. First-run rendering is a separate list predicate, `listedProviderRows`.

The list includes a whole-section official row when occupancy or a described `credential.configured === true` holds. Unsetting the section root leaves `user: {}`, which is the delete residual and stays off the list unless a credential is already stored. First-run no longer lists a never-written official row; that reversal lives in [First-run does not mint official DeepSeek](2026-08-22-first-run-does-not-mint-official-deepseek.md).

The setup card is offered only while a listed official row has no stored credential **and** no other joined row can serve requests. Delete folds the `settings.mutate` answer into the shared describe mirror before the page rejoins, because `ensure` will not re-read a mirror that is already ready.

Official DeepSeek removal clears the writable credential named by its profile before unsetting the whole user section. A refused credential removal preserves the settings; a later failure leaves the operation retryable. Environment-owned credentials remain read-only. The catalog DeepSeek route remains available through Add provider, and sharing its credential does not occupy the official row.

The direct adapter applies the same durable deletion marker to routing. A never-written user section keeps `deepseek-official` available for first-run credential setup. A non-empty user section or configured credential occupies it. An explicit empty user section with no configured credential atomically withdraws its adapter route while its configurable-provider directory entry remains available. Settings-document and credential-reference commits trigger this decision; asynchronous credential descriptions use a generation fence and a failed description retains the last topology.

## Alternatives considered

**Treat a credential-ref on the resolved whole-section value as `configured`.** Rejected because the schema default still names `DEEPSEEK_API_KEY` after delete, so the official row would never leave the list.

**Always list official DeepSeek whenever it is mounted.** Rejected because that restores the row after delete even when another provider is already usable, and it is not offered under Add a provider.

**Treat leftover `user: {}` as first-run.** Rejected because that is exactly the residual unsetting the section root writes, and it is how delete hides the row.

## Consequences

After delete with no stored credential, official DeepSeek stays off the list in the same session. The join still reports `configured: false` for both the never-written section and the leftover empty object.

Session model catalogs stop advertising deleted DeepSeek models. Existing durable selections and the default for a new Session remain unchanged, appear as the raw `provider/model` fallback, and are reported unroutable until the user configures a provider.

## Testing

`packages/client/ui-settings-models/tests/store.client.spec.ts` pins an empty user layer and empty `secrets` as unconfigured while still joining `DEEPSEEK_API_KEY`, and folding a mutate answer into the describe mirror before the next join. `packages/client/ui-settings-models/tests/components.client.spec.tsx` pins leftover `{}` staying off the list and delete hiding the row in the same visit. `packages/llm/llm-deepseek/tests/dynamic-config.spec.ts` exercises route withdrawal, credential-only restoration, and stale asynchronous descriptions through the real settings and credential providers. `packages/client/ui-model-selection/tests/browser-plugin.client.spec.ts` and `apps/web/tests/onboarding-deepseek-config.e2e.ts` cover existing and new Session selectors after deletion.
