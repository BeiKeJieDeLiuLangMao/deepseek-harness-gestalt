# @deepseek-ai/dsh-im-core

English | [中文](README.zh.md)

IM domain configuration, accounts, and routing core service for DeepSeek Harness.

## Summary

`im-core` manages external IM accounts, workspace route rules, group trigger criteria, and simulation target bindings over `StorageDomain`. It separates credential references from secrets, prioritizes specific conversation rules over global rules, preserves disabled bindings without fallback, and ensures unconfigured conversations are never routed to sensitive workspaces.

## Service

Mounted at `ctx.imConfig` for configuration and routing, `ctx.imDelivery` for message history, cursor progress, and outbound lifecycle tracking, `ctx.imExecution` for execution coordination and trigger admission, and `ctx.imSimulation` for local simulation transport.

### Public Methods: imConfig

- `getAccount(id: ImAccountId): Promise<ImAccountMetadata | undefined>`
- `listAccounts(): Promise<ImAccountMetadata[]>`
- `upsertAccount(options: CreateImAccountOptions): Promise<ImAccountMetadata>`
- `pauseAccount(id: ImAccountId, paused: boolean): Promise<ImAccountMetadata>`
- `deleteAccount(id: ImAccountId): Promise<boolean>`
- `getRouteRule(id: ImRouteRuleId): Promise<ImRouteRule | undefined>`
- `listRouteRules(workspaceId?: WorkspaceId): Promise<ImRouteRule[]>` — GUI Remote `listRouteRules` is the unfiltered export; workspace filtering stays local
- `createRouteRule(options: CreateImRouteRuleOptions): Promise<ImRouteRule>` — same id replaces target, trigger, and enabled while keeping `createdAt`
- `updateRouteRule(id: ImRouteRuleId, updates: UpdateImRouteRuleOptions): Promise<ImRouteRule>`
- `deleteRouteRule(id: ImRouteRuleId): Promise<boolean>`
- `resolveRoute(request: ImResolveRouteRequest): Promise<ImResolveRouteResult>`
- `getSimulationConfig(workspaceId: WorkspaceId): Promise<ImWorkspaceSimulationConfig | undefined>`
- `listSimulationConfigs(): Promise<ImWorkspaceSimulationConfig[]>`
- `setSimulationConfig(options: SetWorkspaceSimulationTargetOptions): Promise<ImWorkspaceSimulationConfig>`
- `deleteSimulationConfig(workspaceId: WorkspaceId): Promise<boolean>`

### Public Methods: imDelivery

- `receiveInbound(options: ReceiveInboundOptions): Promise<ReceiveInboundResult>`
- `markSubmitted(options: MarkSubmittedOptions): Promise<ImConversationCursor>`
- `getCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined>`
- `queryHistory(options: ImHistoryQueryOptions): Promise<InboundMessageRecord[]>` — GUI Remote `queryHistory` returns `ImGuiInboundView[]`
- `registerOutbound(options: RegisterOutboundOptions): Promise<OutboundMessageRecord>` — GUI Remote `registerManualOutbound` queues `human_manual` and never flushes adapters
- `settleOutbound(options: SettleOutboundOptions): Promise<OutboundMessageRecord>`
- `getOutbound(requestId: ImOutboundRequestId): Promise<OutboundMessageRecord | undefined>`
- `listOutbound(options: ListImOutboundOptions): Promise<OutboundMessageRecord[]>` — GUI Remote `listOutbound` returns `ImGuiOutboundView[]` and does not flush adapters
- `cancelPendingAiOutbound(scopeId: ImScopeId, reason: string): Promise<OutboundMessageRecord[]>` — GUI Remote `cancelPendingAiOutbound` takes `{ scope, reason }`

### Public Methods: imExecution

- `admitInbound(options: AdmitInboundOptions): Promise<AdmitInboundResult>`
- `resetIntervalTracker(scopeId: ImScopeId, nowMs?: number): void`

### Public Methods: imSimulation

- `getInstance(instanceId: ImSimulationInstanceId): ImSimulationInstance | undefined`
- `listInstances(): ImSimulationInstance[]` — GUI Remote `listInstances` is the unfiltered export
- `createInstance(options: CreateSimulationInstanceOptions): Promise<ImSimulationInstance>` — GUI Remote `createInstance` takes `{ workspaceId }` and fills the conversation id from the workspace target
- `stopInstance(instanceId: ImSimulationInstanceId): Promise<ImSimulationInstance>`
- `injectMemberMessage(options: InjectMemberMessageOptions): Promise<InboundMessageRecord>`
- `injectManagedHumanMessage(options: InjectManagedHumanMessageOptions): Promise<InboundMessageRecord>`
- `importJsonlHistory(options: ImportJsonlHistoryOptions): Promise<{ importedCount: number; messageIds: ImMessageId[] }>`
- `handleSimOutbound(outbound: OutboundMessageRecord, instanceId: string, conversationId: string): Promise<OutboundMessageRecord>`

### Registered Tools

- `im_send_message`: Send an outbound reply message to an IM conversation scope. Real scopes use adapters; simulation scopes settle locally.
- `im_query_history`: Query historical messages within an IM conversation scope.
- `im_sim_create`: Create a simulation instance against the workspace's configured target. Host registers these tools on Agents whose workspace has a simulation target.
- `im_sim_stop`: Stop a simulation instance. Stop is terminal.
- `im_sim_send_as_member`: Inject a speaking-member message into a simulation instance.
- `im_sim_send_as_managed_human`: Inject a managed-account human (`human_dsh`) message into a simulation instance.

## Invariants

- **Credential Reference**: Only opaque nominal `CredentialRef` is stored; secrets are kept behind the credential seam.
- **Specific Precedence**: A specific conversation rule always overrides an `all` rule.
- **Disabled Binding Retention**: Disabling a specific rule retains its workspace binding; resolution returns `disabled` and never falls back to an `all` rule.
- **Single Workspace per Conversation**: A specific conversation ID cannot be bound to multiple workspaces simultaneously without an explicit rebind.
- **Unconfigured No-Trigger**: Unmatched conversations resolve to `unconfigured` to prevent accidental access.
- **Group Trigger Invariant**: Group routes require at least one trigger condition (mention, everyN, or fixedIntervalSeconds) with positive numbers.
- **Simulation Target Restriction**: Workspace simulation targets must reference existing configured accounts and match a configured route rule for that target conversation. Route rules may belong to another workspace, and paused accounts or disabled rules still permit simulation.
- **Simulation Tool Gate**: Simulation tools appear only after a workspace selects a configured target. Host mounts them on that workspace's Agents through `agent.ctx`; unconfigured workspaces and tested-agent workspaces do not receive them. An instance freezes that target at creation; later `setSimulationConfig` changes do not retarget it.
- **Simulation Isolation And Stop**: Independent instances never share conversation state. Explicit stop is terminal. Simulated outbound settles locally and never calls DingTalk or Wangwang adapters. JSONL import is query-only background history and does not admit inbound. Account pause does not block simulation delivery.
- **Delivery Stages & Cursor Ordering**: Distinct stages (`received` != `submitted` != `sent`). Inbound messages are written to domain storage before advancing cursor sequence numbers.
- **Deduplication & Scope Isolation**: Messages are deduplicated on `(scopeId, externalMessageId)`. Colon-safe encoding prevents collision between real scopes and simulation scopes.
- **Outbound Safety & Result-Unknown**: Ambiguous receipts resolve to `result_unknown` and are never blindly retried automatically. Disabling a conversation cancels pending AI outbound messages without batch flushing on re-enable.
- **Group Trigger OR & Single-Batch Steer**: Group conversations evaluate mention, everyN, and fixedInterval under OR logic. Overlapping conditions steer exactly once per batch with message deduplication and sequenceNumber ordering.
- **Steer & Flush Transactional Progression**: `agent.steer` and session flush must succeed before `markSubmitted` advances cursor progress. Failures prevent progression.
- **AI Outbound & External Authority**: AI outbound messages never trigger steering and do not count toward everyN. External IM text is never granted execution authority.
- **No Invariant Companion Needed**: `im-core` manages state through `StorageDomain`, which owns atomic record and change guarantees. There are no divergent observations or separate process bridges requiring an independent `./invariant` companion.

## Assembled acceptance

`tests/assembled-acceptance.spec.tsx` is the keyless assembled scenario: a real Loader `cordis.yml` of im-core and the DingTalk fixture adapter, a production tested Agent, a simulated-user workspace, sender classification, real/sim outbound parity, stop isolation, and Sidebar presentation of the same records. It names live DingTalk login, live Wangwang reads, live outbound, real model calls, and native Desktop GUI computer-use as separately authorized lanes.

`@deepseek-ai/dsh-base` mounts `im-config`, `im-delivery`, `im-execution`, `im-simulation`, and idle DingTalk. Wangwang stays an overlay because its adapter fails loud without an admitted merchant directory.
