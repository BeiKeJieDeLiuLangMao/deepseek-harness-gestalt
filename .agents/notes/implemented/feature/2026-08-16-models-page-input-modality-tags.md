# Agent Note: Models-page `input` / `defaultInput` tags

Status: implemented

English | [中文](2026-08-16-models-page-input-modality-tags.zh.md)

## Problem

A hand-declared pi-ai model is text-only until its profile names `image`. The adapter already accepts that claim as `input` on the model and `defaultInput` on the route, and `$DSH_HOME/settings.yaml` already stores those arrays. The Models page did not expose either field, so attaching an image to a custom vision model failed before send, and the only correction was a YAML edit the page otherwise existed to avoid.

Nothing can ask an endpoint which modalities it accepts, so the page cannot infer the list from **Fetch available models**. A checkbox labelled "vision" would also invent a second spelling for a field the settings file already names.

## Decision

The Models page writes the same arrays the adapter already reads.

Each pi-ai model row's disclosure carries Text and Image tags for that model's `input`. The create card and the editor card carry the same tags for the route's `defaultInput`. Visible labels are localized; the stored values stay the YAML spellings, so a saved card and a hand-edited file stay interchangeable. Selecting both stores `[text, image]` in that order; selecting one stores that one item; selecting none omits the field rather than writing `[]`, because an empty model list already means "no answer here" and an empty route list is refused at load.

Unknown entries already stored (a future modality, or a hand-written value this card does not offer) survive a toggle. DeepSeek's catalog stays text-only and gets no tags: that adapter rejects image content on the wire.

## Alternatives considered

**A single "Supports images" switch.** Shorter, but it cannot express `input: [image]` or a route that falls back to `[text]` while one model opts into images, and it hides the settings-file field names the rest of this card already shows (`baseURL`, `api`).

**A schema-driven multi-select for every array on the profile.** Would also expose `headers` and `reasoningEfforts`. Those remain YAML-owned because they are not what a person adding a vision model needs, and the page already rejected a generic schema dump.

**Infer modalities from `GET /models`.** The OpenAI-compatible listing does not report them. Treating silence as vision would send images a text-only gateway then rejects.

## Consequences

A custom vision model is configurable without leaving the browser. Catalog providers still inherit modalities from the installed catalog; `defaultInput` still only answers for models the catalog does not describe. `modelOverrides` for a catalog id remains YAML-only, because a catalog route has no `models` list to hang a per-id tag on.

## Testing

`packages/client/ui-settings-models/tests/input-modality.client.spec.ts` pins omit-vs-empty, toggle order, and unknown-entry preservation. `packages/client/ui-settings-models/tests/provider-form.client.spec.tsx` writes `input: [text, image]` and `defaultInput: [image]` through both the editor and the create card, omits a cleared model list, and keeps an unknown stored modality across a toggle.
