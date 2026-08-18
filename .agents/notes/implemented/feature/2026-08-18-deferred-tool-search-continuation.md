# Agent Note: Deferred tool search is durable discovery

Status: implemented

English | [中文](2026-08-18-deferred-tool-search-continuation.zh.md)

## Problem

Sending every eligible tool schema on every model request makes the request cost grow with the complete catalog. Omitting large or rarely used schemas needs a continuation mechanism: after the model finds a relevant definition, the next request must include it, and a resumed Session must reconstruct that decision from the event log. Discovery must not weaken the live eligibility rules that already decide which registered tools an agent may see and execute.

## Decision

A registered `ToolDefinition` may declare `deferLoading: true`. It remains visible through the Host catalog, but request assembly and generated Code Mode bindings omit it until the durable Session event log contains a successful tool result whose `discoveredTools` includes the same name. When the live eligible view contains at least one deferred definition, the registry contributes the reserved `tool_search` transport. Its deterministic bounded search runs only over that view and returns matched `ToolSchema` values as ordinary tool-result content plus the structured `discoveredTools` field.

Discovery is recorded state, not registry activation. The result preserves the exact schemas the model saw, while each later request reloads names from the current registry view. A removed, shadowed, restricted, or no-longer-eligible definition therefore disappears even when an older result discovered it, and direct execution continues to use the same live allow-only authority. The search transport itself is presentation infrastructure and remains available when eligible deferred candidates exist.

`ToolResultBlock.discoveredTools` is the provider-neutral durable representation. The agent loop copies successful execution discoveries into the logged result. The pi-ai adapter maps their names to `addedToolNames`, which lets provider-native client-side tool-search history mark the same discovery point. Code Mode forwards discoveries from nested calls to the outer successful result and regenerates bindings from the request-visible definition set.

## Verification

Tool registry tests pin deferred omission, deterministic bounded search, lack of registry mutation, reserved-name handling, and disposal of the final deferred registration. Loop reconstruction tests pin search → continuation → call and prove that revoking allow-only eligibility after discovery removes the schema and prevents execution. LLM message and pi-ai context tests pin durable freezing and native continuation metadata, while the adapter test captures the real locked dependency's Responses request. A keyless Loader snapshot boots the assembled headless application and records the initial search-only request, durable discovered schema, continued request, tool call, result, and final reconstructed request.

## Alternatives considered

**Activate a registry entry when search returns it.** Rejected because search answers a schema-discovery question; mutating registration or eligibility would let historical model behavior change current execution authority.

**Persist only discovered names.** Rejected because the tool result must preserve the loadable schemas returned to the model and provider-native continuation needs to associate those names with schemas supplied on the next request. Later assembly still uses the current definition rather than trusting the stored copy for execution.

**Depend only on a provider-native search tool.** Rejected because Session reconstruction, non-native providers, and Code Mode need one provider-neutral history representation. Adapters may translate that representation without owning registry state.

**Remove a deferred schema permanently after one search.** Rejected because later steps may search for another capability, and a bounded result does not mean the eligible deferred catalog has been exhausted.

## Consequences

Compositions can defer expensive schemas without hiding them from Host discovery. The request grows only when durable history discovers a definition, and every continuation remains reconstructable. Search results add log bytes proportional to returned schemas, while `maxToolSearchResults` bounds one call. Renaming or withdrawing a definition invalidates an old discovery by design; the model must search the current catalog again. Compaction may shadow the result's model-visible content, but the append-only event remains the authority for loaded names.
