# Agent Note: Locale-owned Client UI copy for Phone and Desktop account pool

Status: implemented

English | [中文](2026-09-11-locale-owned-client-ui-copy.zh.md)

## Problem

`verify-client-ui-i18n` is part of `check:ci:static`. The 0.1.5 merge brought Phone tab/settings chrome and Desktop account-pool cards whose product copy still lived in TSX and helper maps. Static CI failed with 249 hard-coded strings. Coverage then failed because six event signature types (`AssistantStreamFrame`, `SessionSummary`, `GoalActivationChanged`, `PtcDispatchLog`, `ApprovalRequestEvent`, `AskUserQuestionRequestEvent`) were unclassified; those event failures had been hiding a larger service-method type-link and partition gap. Snapshot pins still described the previous subagent/tool_search header.

## Decision

Move Phone and Desktop account-pool product copy into the existing locale dictionaries (`settings.phone-devices` and `desktop`). Components receive `t` from the slot locale seat or as a prop. Protocol, diagnostic, brand, and native-menu literals stay in source under `@uiI18n`. Classify the six event types and the previously hidden service-method types in `LINK_MAP` / foundation / exemptions, and map the newly visible Host services onto `SERVICE_PAGE` and `EVENT_SCOPE_PAGE`. Pin current-writer tool schemas (`images` on in-process subagent tools, plus `tool_search`) and migrate `member-question-routed-ask` to `session.v3.jsonl`. Treat extra `*.snapshot.ts` files already on this branch as recorded-session adapters in the corpus inventory.

## Alternatives considered

**Leave the 0.1.5 copy in TSX and widen the i18n gate.** Rejected: the gate exists so Client UI copy has one owner per language, and Phone/account-pool strings are user-visible.

**Exempt Phone and account-pool from i18n.** Rejected: they are ordinary Client UI, not protocol or diagnostic text.

**Keep member-question as retained v0.** Rejected: the scenario is a current-writer pin, not a declared historical migration.

## Consequences

Switching UI language now updates Phone and account-pool chrome through the same dictionaries as the rest of Desktop Settings. Catalog generation writes the newly classified types into subsystem regions. Snapshot header pins follow the live tool list; replay of `member-question-routed-ask` uses Session format v3.
