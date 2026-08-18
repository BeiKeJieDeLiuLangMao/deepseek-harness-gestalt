# Agent Note: Reconstructable deferred tool search

Status: implemented

English | [中文](2026-08-18-reconstructable-deferred-tool-search.zh.md)

## Problem

Large dynamic tool catalogs spend request tokens before the model knows which capability it needs. Omitting schemas reduces that cost, but an execution-local search result would make the next request depend on transient registry state and would fail after Session resume. Treating search as activation would also create a second visible registry state beside the allow-only eligibility resolved by `dsh-tools`.

## Decision

`ToolDefinition.deferLoading` marks a registered definition whose schema is omitted from the initial request. The shipped base bundle enables `dsh-tools.toolSearch`, which contributes the reserved `tool_search` infrastructure schema. The search index is rebuilt from the calling Agent's current resolved view and contains only eligible deferred definitions. Its canonical result is the exact matched `ToolSchema[]`; it never registers, enables, or otherwise activates a tool.

The agent loop stores matched schemas on the durable `tool-result` block. Each prompt assembly reads those results from `Session.deriveMessages()`, deduplicates by tool name, and retains a stored schema only while the current resolved view still contains an eligible deferred definition with that name. The next request therefore carries the exact schema returned by search, while removal or a narrower allow-only contribution prevents stale history from restoring or dispatching it. `request/header` continues to record the complete assembled request tools, so replay has one authoritative request snapshot.

`schemas()` represents the initial model request and omits deferred definitions. `catalogSchemas()` represents the complete current eligible end-tool catalog for Host and inspection surfaces. MCP instances opt in per server with `deferLoading`; their complete live generation remains registered throughout discovery. Code Mode carries schemas from nested `tool_search` sub-dispatches onto the outer `run_code` result, then adds those definitions to its generated SDK on the next assembly.

Provider-neutral adapters receive the ordinary `tool_search` call, its JSON schema result, and the expanded next-request tool list. The pi-ai bridge additionally maps the durable result to `addedToolNames`; OpenAI Responses models that support native tool search receive equivalent `tool_search_call` and `tool_search_output` history with `defer_loading` schemas. Both paths derive from the same provider-neutral Session log.

## Verification

Registry tests prove initial omission, eligible catalog retention, exact schema results, durable next-request and resume reconstruction, and rejection after allow-only eligibility changes. MCP tests prove per-server deferral. Pi-ai tests prove provider-neutral metadata conversion and the native OpenAI Responses request payload. The keyless headless example runs the real Agent, Session, system-prompt, tool registry, and agent-loop composition through search, continuation, deferred execution, final result, request-header changes, and resume reconstruction.

## Alternatives considered

**Mutate a per-Agent active-tool set.** Rejected because discovery is evidence returned to the model, not an authorization or registration transition. A mutable active set would duplicate eligibility and require a new durable state machine.

**Recompute matched schemas from the current registry after search.** Rejected because schema changes between search and continuation would make the request differ from the result the model read. The log stores the returned schemas and uses the current registry only to recheck continued eligibility.

**Persist only matched names.** Rejected because names cannot reconstruct the exact model-visible schema and would make resume depend on current provider output.

## Consequences

Deployments can keep large MCP generations registered and executable without paying their full initial schema cost. Search results add schema JSON to history and change later request tools, so discovery still has a token cost. A model that guesses a registered eligible name may call it without a prior search; this is intentional because search does not activate tools. Eligibility remains the sole authority over discovery and dispatch.
