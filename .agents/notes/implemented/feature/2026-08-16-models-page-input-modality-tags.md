# Agent Note: Models-page `input` / `defaultInput` / `reasoningEfforts` tags

Status: implemented

English | [中文](2026-08-16-models-page-input-modality-tags.zh.md)

## Problem

A hand-declared pi-ai model is text-only until its profile names `image`, and offers no thinking levels until its profile names `reasoningEfforts`. The adapter already accepts those claims as `input` / `defaultInput` and as a per-model `reasoningEfforts` dict, and `$DSH_HOME/settings.yaml` already stores them. The Models page did not expose those fields, so attaching an image failed before send and the composer hid thinking levels, and the only correction was a YAML edit the page otherwise existed to avoid.

Nothing can ask an endpoint which modalities or thinking levels it accepts, so the page cannot infer either list from **Fetch available models**. A checkbox labelled "vision" or a provider-scoped effort switch would also invent a second spelling for fields the settings file already names.

## Decision

The Models page writes the same arrays and dicts the adapter already reads.

Each pi-ai model row's disclosure carries Text and Image tags for that model's `input`, and Off / Minimal / Low / Medium / High / Extra high / Max tags for that model's `reasoningEfforts`. The create card and the editor card carry the input tags for the route's `defaultInput`. Visible labels are localized; the stored values stay the YAML spellings, so a saved card and a hand-edited file stay interchangeable. Selecting both input tags stores `[text, image]` in that order; selecting one stores that one item; selecting none omits the field rather than writing `[]`, because an empty model list already means "no answer here" and an empty route list is refused at load.

Selecting thinking levels stores a dict: `off` writes `null` (YAML `off:`), every other selected level writes itself as the wire value (`high: high`). A custom wire spelling already stored survives a toggle of another level. Selecting none omits the field rather than writing `{}` or `false`; a hand-declared model then offers no thinking levels. Off alone, or an empty dict, is refused before write because the adapter rejects both.

Unknown input entries already stored survive a toggle. DeepSeek's catalog stays text-only and gets no input or thinking tags: that adapter rejects image content on the wire and owns its own effort catalog.

## Alternatives considered

**A single "Supports images" switch.** Shorter, but it cannot express `input: [image]` or a route that falls back to `[text]` while one model opts into images, and it hides the settings-file field names the rest of this card already shows (`baseURL`, `api`).

**A schema-driven multi-select for every array on the profile.** Would also expose `headers`. Those remain YAML-owned because they are not what a person adding a vision or thinking model needs, and the page already rejected a generic schema dump.

**A provider-scoped thinking-level control.** Effort is a per-model capability, and the models under one provider disagree about it. A route-level switch could only be set to a value some of them reject, which would take those models out of the picker. The composer already offers each model its own levels; the card only declares which levels exist.

**Infer modalities from `GET /models`.** The OpenAI-compatible listing does not report them. Treating silence as vision would send images a text-only gateway then rejects.

## Consequences

A custom vision or thinking model is configurable without leaving the browser. Catalog providers still inherit modalities and efforts from the installed catalog; `defaultInput` still only answers for models the catalog does not describe. Custom wire spellings (`max: ultra`) and `false` (strip reasoning from a catalog model) remain YAML-only. `modelOverrides` for a catalog id remains YAML-only, because a catalog route has no `models` list to hang a per-id tag on.

## Testing

`packages/client/ui-settings-models/tests/input-modality.client.spec.ts` pins omit-vs-empty, toggle order, and unknown-entry preservation. `packages/client/ui-settings-models/tests/reasoning-effort.client.spec.ts` pins omit-vs-empty, `off: null`, custom wire spellings, and the Off-only refusal. `packages/client/ui-settings-models/tests/provider-form.client.spec.tsx` writes `input: [text, image]`, `defaultInput: [image]`, and `reasoningEfforts: { off: null, high: high, max: max }` through the editor, omits a cleared model list, keeps an unknown stored modality and a custom effort spelling across a toggle, and refuses Off alone.
