# @deepseek-ai/dsh-im-core

English | [中文](README.zh.md)

IM domain configuration, accounts, and routing core service for DeepSeek Harness.

## Summary

`im-core` manages external IM accounts, workspace route rules, group trigger criteria, and simulation target bindings over `StorageDomain`. It separates credential references from secrets, prioritizes specific conversation rules over global rules, preserves disabled bindings without fallback, and ensures unconfigured conversations are never routed to sensitive workspaces.

## Service

Mounted at `ctx.imConfig` for configuration and routing, and `ctx.imDelivery` for message history, cursor progress, and outbound lifecycle tracking.

### Public Methods: imConfig

- `getAccount(id: ImAccountId): Promise<ImAccountMetadata | undefined>`
- `listAccounts(): Promise<ImAccountMetadata[]>`
- `upsertAccount(options: CreateImAccountOptions): Promise<ImAccountMetadata>`
- `pauseAccount(id: ImAccountId, paused: boolean): Promise<ImAccountMetadata>`
- `deleteAccount(id: ImAccountId): Promise<boolean>`
- `getRouteRule(id: ImRouteRuleId): Promise<ImRouteRule | undefined>`
- `listRouteRules(workspaceId?: WorkspaceId): Promise<ImRouteRule[]>`
- `createRouteRule(options: CreateImRouteRuleOptions): Promise<ImRouteRule>`
- `updateRouteRule(id: ImRouteRuleId, updates: Partial<Pick<ImRouteRule, 'workspaceId' | 'enabled' | 'groupTrigger'>>): Promise<ImRouteRule>`
- `deleteRouteRule(id: ImRouteRuleId): Promise<boolean>`
- `resolveRoute(request: ImResolveRouteRequest): Promise<ImResolveRouteResult>`
- `getSimulationConfig(workspaceId: WorkspaceId): Promise<ImWorkspaceSimulationConfig | undefined>`
- `setSimulationConfig(options: SetWorkspaceSimulationTargetOptions): Promise<ImWorkspaceSimulationConfig>`
- `deleteSimulationConfig(workspaceId: WorkspaceId): Promise<boolean>`

### Public Methods: imDelivery

- `receiveInbound(options: ReceiveInboundOptions): Promise<ReceiveInboundResult>`
- `markSubmitted(options: MarkSubmittedOptions): Promise<ImConversationCursor>`
- `getCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined>`
- `queryHistory(options: ImHistoryQueryOptions): Promise<InboundMessageRecord[]>`
- `registerOutbound(options: RegisterOutboundOptions): Promise<OutboundMessageRecord>`
- `settleOutbound(options: SettleOutboundOptions): Promise<OutboundMessageRecord>`
- `getOutbound(requestId: ImOutboundRequestId): Promise<OutboundMessageRecord | undefined>`
- `cancelPendingAiOutbound(scopeId: ImScopeId, reason: string): Promise<OutboundMessageRecord[]>`

## Invariants

- **Credential Reference**: Only opaque nominal `CredentialRef` is stored; secrets are kept behind the credential seam.
- **Specific Precedence**: A specific conversation rule always overrides an `all` rule.
- **Disabled Binding Retention**: Disabling a specific rule retains its workspace binding; resolution returns `disabled` and never falls back to an `all` rule.
- **Single Workspace per Conversation**: A specific conversation ID cannot be bound to multiple workspaces simultaneously without an explicit rebind.
- **Unconfigured No-Trigger**: Unmatched conversations resolve to `unconfigured` to prevent accidental access.
- **Group Trigger Invariant**: Group routes require at least one trigger condition (mention, everyN, or fixedIntervalSeconds) with positive numbers.
- **Simulation Target Restriction**: Workspace simulation targets must reference existing configured accounts and match a configured route rule for that target conversation. Route rules may belong to another workspace, and paused accounts or disabled rules still permit simulation.
- **Delivery Stages & Cursor Ordering**: Distinct stages (`received` != `submitted` != `sent`). Inbound messages are written to domain storage before advancing cursor sequence numbers.
- **Deduplication & Scope Isolation**: Messages are deduplicated on `(scopeId, externalMessageId)`. Colon-safe encoding prevents collision between real scopes and simulation scopes.
- **Outbound Safety & Result-Unknown**: Ambiguous receipts resolve to `result_unknown` and are never blindly retried automatically. Disabling a conversation cancels pending AI outbound messages without batch flushing on re-enable.
- **No Invariant Companion Needed**: `im-core` manages state through `StorageDomain`, which owns atomic record and change guarantees. There are no divergent observations or separate process bridges requiring an independent `./invariant` companion.
