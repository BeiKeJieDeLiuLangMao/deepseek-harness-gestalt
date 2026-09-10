# IM 账号接管

[English](im.md) | 中文

IM 账号接管共用的类型：持久账号与路由规则、投递游标与出站回执、本地模拟实例、空闲钉钉 DWS，以及旺旺商户 overlay。[Host 组合 Agent Note](../../.agents/notes/implemented/feature/2026-09-10-im-host-base-composition.zh.md) 负责 `dsh-base` 行集；本页记录 [`packages/im/im-core/src/types.ts`](../../packages/im/im-core/src/types.ts)、[`packages/im/im-core/src/delivery/types.ts`](../../packages/im/im-core/src/delivery/types.ts)、[`packages/im/im-core/src/simulation/types.ts`](../../packages/im/im-core/src/simulation/types.ts)、[`packages/im/im-dingtalk/src/types.ts`](../../packages/im/im-dingtalk/src/types.ts) 与 [`packages/im/im-wangwang/src/types.ts`](../../packages/im/im-wangwang/src/types.ts) 中的确切字段。适配器拉起、工具注册与 live-lane 授权由各包 README 负责。

## 账号与路由

`ImAccountId` 与 `ImRouteRuleId` 是[品牌化 id](core.zh.md#branded-ids)。账号元数据只保存 `CredentialRef`，记录中绝不出现秘密。已停用的指定会话规则保留工作区绑定，且不回退到 `all` 规则。未配置的会话不得路由到工作区。

```ts type-equiv
/** Opaque branded identifier of one IM account. */
type ImAccountId = Branded<'ImAccountId'>
```

```ts type-equiv
/** Opaque branded identifier of one IM route rule. */
type ImRouteRuleId = Branded<'ImRouteRuleId'>
```

```ts type-equiv
/**
 * Metadata for a connected IM account.
 * Secrets are never stored here; only nominal credential references are kept.
 */
interface ImAccountMetadata {
  readonly id: ImAccountId
  readonly platform: ImPlatform
  /** Display name or alias for the account. */
  readonly displayName: string
  /** Reference to secret credential in credential provider. Never plaintext secrets. */
  readonly credentialRef?: CredentialRef
  /** Account connection status. */
  readonly status: ImAccountStatus
  /**
   * Account-level pause. When paused, automatic handling and routing are suspended,
   * but manual/simulated actions remain allowed.
   */
  readonly paused: boolean
  /** Optional platform-specific identity facts (e.g. merchantId, corpId). */
  readonly platformMetadata?: Readonly<Record<string, string>>
  readonly createdAt: string
  readonly updatedAt: string
}
```

```ts type-equiv
/**
 * Route rule linking an IM account and conversation target to a workspace.
 */
interface ImRouteRule {
  readonly id: ImRouteRuleId
  readonly accountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly target: ImRouteTarget
  readonly workspaceId: WorkspaceId
  /**
   * Whether automated takeover handling is enabled.
   * Disabling a rule retains its binding to the workspace and prevents fallback to 'all' rules.
   */
  readonly enabled: boolean
  /** Group trigger settings. Required for group conversationKind; undefined for direct. */
  readonly groupTrigger?: ImGroupTriggerConfig
  readonly createdAt: string
  readonly updatedAt: string
}
```

```ts type-equiv
/**
 * Outcome of resolving an IM route rule.
 */
type ImResolveRouteResult =
  | {
    readonly status: 'matched'
    readonly ruleId: ImRouteRuleId
    readonly workspaceId: WorkspaceId
    readonly enabled: boolean
    readonly groupTrigger?: ImGroupTriggerConfig
  }
  | {
    /** Specific rule matched but is disabled. Retains binding; does not fallback to 'all'. */
    readonly status: 'disabled'
    readonly ruleId: ImRouteRuleId
    readonly workspaceId: WorkspaceId
    readonly groupTrigger?: ImGroupTriggerConfig
  }
  | {
    /** Account paused; automation suspended even if route matched. */
    readonly status: 'account_paused'
    readonly accountId: ImAccountId
    readonly ruleId?: ImRouteRuleId
    readonly workspaceId?: WorkspaceId
  }
  | {
    /** No rule configured; unmatched conversations must not route to sensitive workspaces. */
    readonly status: 'unconfigured'
  }
```

```ts type-equiv
/**
 * Workspace IM simulation configuration.
 * Simulation target configuration is restricted to configured targets.
 */
interface ImWorkspaceSimulationConfig {
  readonly workspaceId: WorkspaceId
  readonly targetAccountId: ImAccountId
  readonly conversationKind: ImConversationKind
  readonly targetConversationId?: string
  readonly updatedAt: string
}
```

## 投递与模拟

真实 Scope 与模拟 Scope 使用转义编码，避免冒号碰撞。入站记录按 `(scopeId, externalMessageId)` 去重。不明确的出站回执结算为 `result_unknown`，严禁盲目自动重试。模拟工具仅在工作区已配置目标后注册；已停止的实例不可恢复。

```ts type-equiv
/**
 * Sender classification:
 * - external: message from third-party / external group member
 * - ai_outbound: echo of agent outbound reply
 * - human_native: human owner spoke natively on IM app
 * - human_dsh: human owner spoke through DSH manual send
 * - unknown: identity cannot be definitively established
 */
type ImSenderClassification =
  | 'external'
  | 'ai_outbound'
  | 'human_native'
  | 'human_dsh'
  | 'unknown'
```

```ts type-equiv
/**
 * Normalized record of an inbound message.
 */
interface InboundMessageRecord {
  readonly messageId: ImMessageId
  readonly scopeId: ImScopeId
  readonly externalMessageId: string
  readonly senderClassification: ImSenderClassification
  readonly senderEvidence: ImSenderEvidence
  readonly stage: ImMessageStage
  readonly content: ImMessageContent
  readonly sequenceNumber: number
  readonly receivedAt: string
  readonly submittedAt?: string
  readonly metadata?: Readonly<Record<string, string>>
}
```

```ts type-equiv
/**
 * Normalized record of an outbound delivery request.
 */
interface OutboundMessageRecord {
  readonly requestId: ImOutboundRequestId
  readonly messageId?: ImMessageId
  readonly scopeId: ImScopeId
  readonly workspaceId?: WorkspaceId
  readonly intent: ImOutboundIntent
  readonly content: ImMessageContent
  readonly status: ImOutboundStatus
  readonly preSendFailureReason?: string
  readonly receipt?: ImOutboundReceipt
  readonly createdAt: string
  readonly updatedAt: string
  readonly replyToExternalMessageId?: string
}
```

```ts type-equiv
/**
 * Progress cursor for an IM conversation scope.
 */
interface ImConversationCursor {
  readonly scopeId: ImScopeId
  readonly lastReceivedExternalMessageId?: string
  readonly lastReceivedSequenceNumber: number
  readonly lastSubmittedSequenceNumber: number
  readonly lastSentSequenceNumber: number
  readonly unsubmittedCount: number
  readonly updatedAt: string
}
```

```ts type-equiv
interface ImSimulationInstance {
  readonly instanceId: ImSimulationInstanceId
  readonly workspaceId: WorkspaceId
  readonly testedWorkspaceId: WorkspaceId
  readonly target: ImSimulationTargetSnapshot
  readonly speakingMembers?: readonly string[]
  readonly status: ImSimulationInstanceStatus
  readonly createdAt: string
  readonly stoppedAt?: string
}
```

## 适配器

钉钉在 `dsh-base` 上空闲挂载，在 `startConsumer` 之前不拉起 DWS。旺旺只作为 overlay，因为适配器在没有准入商户目录时会大声失败；入站发送者分类只信任持久本地出站回显。

```ts type-equiv
/**
 * Active consumer stream state for an account.
 */
interface DingTalkConsumerState {
  readonly accountId: ImAccountId
  readonly isRunning: boolean
  readonly reconnectAttempts: number
  readonly lastError?: string
  readonly lastEventAt?: string
}
```

```ts type-equiv
/**
 * Static configuration of an admitted merchant in directory.
 * Runtime self-discovery / guessing is disallowed.
 */
interface WangwangAdmittedMerchant {
  /** Merchant identifier admitted by platform. */
  readonly merchantId: string
  /** Harness account identifier mapping to this merchant. */
  readonly accountId: ImAccountId
  /** Display name for merchant. */
  readonly displayName?: string
  /** Reference to AccessKey in CredentialProvider. Never plaintext. */
  readonly accessKeyRef: CredentialRef
  /** Reference to SecretKey in CredentialProvider. Never plaintext. */
  readonly secretKeyRef: CredentialRef
  /** Merchant main service account id for echo/identity matching. */
  readonly mainServiceAccountId?: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctximconfig--imconfigservice"></a>

### `ctx.imConfig` — `ImConfigService`

IM configuration service managing accounts, route rules, and simulation target binding.

```ts cordis-catalog
/**
 * Look up one IM account by its opaque identifier.
 * @param id - Opaque account identifier.
 * @returns The account metadata if found, or undefined.
 */
async getAccount(id: ImAccountId): Promise<ImAccountMetadata | undefined>

/**
 * List all registered IM accounts.
 * @returns Array of registered account metadata records.
 */
async listAccounts(): Promise<ImAccountMetadata[]>

/**
 * Create or update an IM account record.
 * @param options - Account creation/update parameters.
 * @returns The saved account metadata.
 */
async upsertAccount(options: CreateImAccountOptions): Promise<ImAccountMetadata>

/**
 * Pause or resume an IM account.
 * @param id - Account identifier to update.
 * @param paused - Whether automated handling should be paused.
 * @returns The updated account metadata.
 */
async pauseAccount(id: ImAccountId, paused: boolean): Promise<ImAccountMetadata>

/**
 * Delete an IM account and cascade delete its associated route rules.
 * @param id - Account identifier to delete.
 * @returns True if deleted, false if the account did not exist.
 */
async deleteAccount(id: ImAccountId): Promise<boolean>

/**
 * Look up one route rule by its identifier.
 * @param id - Route rule identifier.
 * @returns The route rule record if found, or undefined.
 */
async getRouteRule(id: ImRouteRuleId): Promise<ImRouteRule | undefined>

/**
 * List route rules, optionally filtered by workspace identifier.
 * @param workspaceId - Optional workspace identifier filter.
 * @returns Array of matching route rules.
 */
async listRouteRules(workspaceId?: WorkspaceId): Promise<ImRouteRule[]>

/**
 * Create a new route rule for an account and conversation target.
 * @param options - Route rule definition options.
 * @returns The created route rule.
 */
async createRouteRule(options: CreateImRouteRuleOptions): Promise<ImRouteRule>

/**
 * Update mutable settings of an existing route rule.
 * @param id - Route rule identifier.
 * @param updates - Partial updates for workspace, enabled state, or trigger conditions.
 * @returns The updated route rule.
 */
async updateRouteRule( id: ImRouteRuleId, updates: Partial<Pick<ImRouteRule, 'workspaceId' | 'enabled' | 'groupTrigger'>>, ): Promise<ImRouteRule>

/**
 * Delete an existing route rule.
 * @param id - Route rule identifier.
 * @returns True if deleted, false if the rule did not exist.
 */
async deleteRouteRule(id: ImRouteRuleId): Promise<boolean>

/**
 * Resolves the route rule for an incoming conversation.
 *
 * Resolution precedence:
 * 1. Check account pause: if paused, returns 'account_paused' (suspending automatic handling).
 * 2. Specific conversation rule match:
 *    - If enabled: returns 'matched'
 *    - If disabled: returns 'disabled' (retains workspace binding, DOES NOT fallback to 'all')
 * 3. 'All' conversation rule match:
 *    - Dynamically covers future unmapped conversations for this account and kind.
 *    - Returns 'matched' if enabled, 'disabled' if disabled.
 * 4. Unmatched: returns 'unconfigured' (prevents routing to sensitive workspaces).
 * @param request - Incoming conversation resolution request.
 * @returns Resolution outcome including matched status, ruleId, workspaceId, or disabled/paused indicators.
 */
async resolveRoute(request: ImResolveRouteRequest): Promise<ImResolveRouteResult>

/**
 * Get the simulation configuration for a workspace.
 * @param workspaceId - Workspace identifier.
 * @returns The simulation configuration if set, or undefined.
 */
async getSimulationConfig(workspaceId: WorkspaceId): Promise<ImWorkspaceSimulationConfig | undefined>

/**
 * Configure the IM simulation target for a workspace.
 * Target account must exist, and a configured route rule must cover the target conversation.
 *
 * Note: The route rule may belong to any workspace (e.g. testing an agent in another workspace).
 * Disabled or account-paused route rules still permit simulation testing.
 * @param options - Target account and conversation options.
 * @returns The saved simulation configuration.
 */
async setSimulationConfig(options: SetWorkspaceSimulationTargetOptions): Promise<ImWorkspaceSimulationConfig>

/**
 * Delete the simulation configuration for a workspace.
 * @param workspaceId - Workspace identifier.
 * @returns True if deleted, false if none existed.
 */
async deleteSimulationConfig(workspaceId: WorkspaceId): Promise<boolean>
```

Types: [WorkspaceId](workspace.zh.md)

Source: [`packages/im/im-core/src/service.ts`](../../packages/im/im-core/src/service.ts)

<a id="ctximdelivery--imdeliveryservice"></a>

### `ctx.imDelivery` — `ImDeliveryService`

Service managing IM message delivery, deduplication, cursor progress, and outbound safety.

```ts cordis-catalog
/**
 * Receive an incoming message from external platform or simulation.
 *
 * Invariants:
 * 1. Check deduplication by (scopeId, externalMessageId) using deterministic key or dedupTable.
 * 2. If already exists, return duplicate = true, the existing record, and reconciled cursor.
 * 3. If new:
 *    a. Write inbound record first with deterministic primary key `scopeId::externalMessageId`.
 *    b. Record dedup entry.
 *    c. Advance cursor and reconcile unsubmittedCount.
 *
 * @param options - Message payload, sender classification, and external ID.
 * @returns ReceiveInboundResult containing deduplication flag, stored record, and updated cursor.
 */
async receiveInbound(options: ReceiveInboundOptions): Promise<ReceiveInboundResult>

/**
 * Mark messages as submitted to the agent workspace / queue.
 * Updates message stage to 'submitted' and advances lastSubmittedSequenceNumber on the cursor.
 *
 * @param options - Scope ID and array of message IDs.
 * @returns Updated cursor.
 */
async markSubmitted(options: MarkSubmittedOptions): Promise<ImConversationCursor>

/**
 * Get cursor for a given scope.
 * Reconciles cursor if any crash window discrepancy exists.
 * @param scopeId - Branded scope ID.
 * @returns Current cursor or undefined.
 */
async getCursor(scopeId: ImScopeId): Promise<ImConversationCursor | undefined>

/**
 * Query conversation history within a validated scope.
 * Prevents cross-scope access: only messages belonging to options.scopeId are returned.
 *
 * @param options - Scope ID, limits, pagination criteria, and optional stage filters.
 * @returns Array of message records sorted by sequenceNumber ascending.
 */
async queryHistory(options: ImHistoryQueryOptions): Promise<InboundMessageRecord[]>

/**
 * Register an outbound message request and perform pre-send validation.
 *
 * Invariants:
 * 1. If intent === 'ai' and scope is real:
 *    - Check if the account is paused -> pre_send_failed
 *    - Resolve route rule for the conversation:
 *      - If status === 'disabled' or 'unconfigured' -> pre_send_failed (never flush disabled conversations)
 *      - If rule exists but enabled === false -> pre_send_failed
 * 2. If pre-send validation fails, record status: 'pre_send_failed' with reason.
 * 3. Otherwise status: 'pending'.
 * 4. Human manual sends (intent === 'human_manual') are permitted even if account is paused or rule is disabled.
 * 5. Simulation scopes are never blocked by account-level pause or disabled real routes.
 *
 * @param options - Request ID, target scope, workspace, intent, and message content.
 * @returns Stored OutboundMessageRecord.
 */
async registerOutbound(options: RegisterOutboundOptions): Promise<OutboundMessageRecord>

/**
 * Settle an outbound request after external delivery attempt.
 *
 * Invariants:
 * - If status === 'result_unknown': ambiguous receipt, platform state undetermined.
 *   Must NOT automatically retry.
 * - If status === 'sent': mark sent, record receipt.
 * - If status === 'confirmed_failed': terminal failure.
 *
 * @param options - Settle parameters with receipt and final status.
 * @returns Updated OutboundMessageRecord.
 */
async settleOutbound(options: SettleOutboundOptions): Promise<OutboundMessageRecord>

/**
 * Get outbound message record by requestId.
 * @param requestId - Outbound request identifier.
 * @returns The outbound record if found, or undefined.
 */
async getOutbound(requestId: ImOutboundRequestId): Promise<OutboundMessageRecord | undefined>

/**
 * Cancel pending outbound AI messages for a specific scope.
 * Disabling a conversation cancels pending AI messages without batch flushing on re-enable.
 * @param scopeId - Conversation scope whose pending AI outbound should be cancelled.
 * @param reason - Pre-send failure reason recorded on each cancelled request.
 * @returns The cancelled outbound records.
 */
async cancelPendingAiOutbound(scopeId: ImScopeId, reason: string): Promise<OutboundMessageRecord[]>
```

Source: [`packages/im/im-core/src/delivery/service.ts`](../../packages/im/im-core/src/delivery/service.ts)

<a id="ctximdingtalk--dingtalkdwsadapterservice-abstract-seam"></a>

### `ctx.imDingtalk` — `DingTalkDwsAdapterService` (abstract seam)

Service Definition for DingTalk DWS adapter.

```ts cordis-catalog
/**
 * Start event consumer stream for an account.
 * @param accountId - Connected DingTalk account.
 * @param config - Optional DWS spawn override for this consumer.
 */
abstract startConsumer(accountId: ImAccountId, config?: DingTalkDwsAdapterConfig): Promise<void>

/**
 * Stop event consumer stream for an account.
 * @param accountId - Connected DingTalk account.
 */
abstract stopConsumer(accountId: ImAccountId): Promise<void>

/**
 * Send a message through DWS CLI.
 * @param request - Outbound send request.
 * @returns Settled send result, including `result_unknown`.
 */
abstract sendMessage(request: DingTalkSendMessageRequest): Promise<DingTalkSendMessageResult>

/**
 * Query send status for an openTaskId.
 * @param openTaskId - DWS outbound task id.
 * @param accountId - Optional account that owns the task.
 * @returns Current send-status snapshot.
 */
abstract querySendStatus(openTaskId: string, accountId?: ImAccountId): Promise<DingTalkSendStatusResult>

/**
 * Snapshot of one account's consumer stream.
 * @param accountId - Connected DingTalk account.
 * @returns Current consumer running state.
 */
abstract getConsumerState(accountId: ImAccountId): DingTalkConsumerState
```

Source: [`packages/im/im-dingtalk/src/spec.ts`](../../packages/im/im-dingtalk/src/spec.ts)

<a id="ctximexecution--imexecutionservice"></a>

### `ctx.imExecution` — `ImExecutionService`

Service orchestrating IM inbound message admission, trigger evaluation, and steering into target agent workspace.

```ts cordis-catalog
/**
 * Reset the fixed-interval tracking timestamp for a scope.
 *
 * @param scopeId - Conversation scope ID.
 * @param nowMs - Optional current epoch timestamp in milliseconds.
 */
resetIntervalTracker(scopeId: ImScopeId, nowMs: number = Date.now()): void

/**
 * Evaluate trigger conditions and admit inbound messages into the workspace agent context.
 *
 * Invariants:
 * 1. Group trigger OR logic: mention, everyN, fixedInterval.
 * 2. Multiple trigger conditions in the same batch trigger steer exactly once.
 * 3. Message IDs deduplicated; messages sorted by sequenceNumber ascending.
 * 4. ai_outbound messages never trigger and are not counted towards everyN.
 * 5. human_native and human_dsh messages enter context without pausing/disabling.
 * 6. External IM text is never authorized.
 * 7. agent.steer is called first, session flush is awaited, and markSubmitted runs only after success.
 *
 * @param options - Message records, delivery scope, agent, and optional timestamp.
 * @returns Admission outcome with trigger flags and steered message IDs.
 */
async admitInbound(options: AdmitInboundOptions): Promise<AdmitInboundResult>
```

Source: [`packages/im/im-core/src/coordination/service.ts`](../../packages/im/im-core/src/coordination/service.ts)

<a id="ctximsimulation--imsimulationservice"></a>

### `ctx.imSimulation` — `ImSimulationService`

Service managing IM simulation instances, local bidirectional delivery, and test message injections.

```ts cordis-catalog
/**
 * Look up a simulation instance by its unique identifier.
 *
 * @param instanceId - Instance identifier.
 * @returns The simulation instance if found, or undefined.
 */
getInstance(instanceId: ImSimulationInstanceId): ImSimulationInstance | undefined

/**
 * List all known simulation instances.
 *
 * @returns Array of simulation instance records.
 */
listInstances(): ImSimulationInstance[]

/**
 * Create a new simulation instance against the workspace's configured simulation target.
 *
 * Invariants:
 * 1. Workspace must have configured simulation target in imConfig; throws if unconfigured.
 * 2. Instance target snapshot (accountId, conversationKind, conversationId) is frozen at creation.
 *    Subsequent changes to workspace simulation config will not alter this instance.
 *
 * @param options - Workspace ID, conversation ID, optional conversation kind, instance ID, and speaking members.
 * @returns Created simulation instance with frozen target snapshot.
 */
async createInstance(options: CreateSimulationInstanceOptions): Promise<ImSimulationInstance>

/**
 * Explicitly stop a simulation instance. Stop is terminal; stopped instances cannot be resumed.
 *
 * @param instanceId - Identifier of the instance to stop.
 * @returns Updated simulation instance with status: 'stopped'.
 */
async stopInstance(instanceId: ImSimulationInstanceId): Promise<ImSimulationInstance>

/**
 * Inject a message from a speaking group member into the simulation scope.
 *
 * @param options - Target instance ID, member ID, nick, and text content.
 * @returns Inbound message delivery record.
 */
async injectMemberMessage(options: InjectMemberMessageOptions): Promise<InboundMessageRecord>

/**
 * Inject a message from the managed account human identity (human_dsh).
 * Invariant: senderClassification is 'human_dsh', never 'ai_outbound'.
 *
 * @param options - Target instance ID, human nick, and text content.
 * @returns Inbound message delivery record.
 */
async injectManagedHumanMessage(options: InjectManagedHumanMessageOptions): Promise<InboundMessageRecord>

/**
 * Import historical background messages from JSONL text.
 *
 * Invariant:
 * Historical messages are immediately marked as submitted.
 * They are queryable via im_query_history, but will NOT trigger admitInbound.
 *
 * @param options - Target instance ID and JSONL text.
 * @returns Count and IDs of imported messages.
 */
async importJsonlHistory(options: ImportJsonlHistoryOptions): Promise<{ importedCount: number; messageIds: ImMessageId[] }>

/**
 * Settle a simulated outbound message locally and echo it back into the simulation scope.
 *
 * Invariants:
 * 1. If instance is stopped, outbound fails.
 * 2. Outbound is settled to 'sent' via imDelivery.settleOutbound.
 * 3. Message is echoed back to the simulation instance via imDelivery.receiveInbound as ai_outbound.
 * 4. External platform adapters (DingTalk, Wangwang) are NEVER called.
 *
 * @param outbound - Registered outbound message record.
 * @param instanceId - Simulation instance identifier.
 * @param _conversationId - Encoded conversation id from the outbound scope; the frozen instance target is authoritative.
 * @returns Settled outbound message record.
 */
async handleSimOutbound( outbound: OutboundMessageRecord, instanceId: string, _conversationId: string, ): Promise<OutboundMessageRecord>
```

Source: [`packages/im/im-core/src/simulation/service.ts`](../../packages/im/im-core/src/simulation/service.ts)

<a id="ctximwangwang--wangwangadapterservice"></a>

### `ctx.imWangwang` — `WangwangAdapterService`

Wangwang / QianNiu IM adapter service: admitted merchant directory, on-demand credential resolution, durable cursor polling, and outbox-verified sender identity.

```ts cordis-catalog
/**
 * Get admitted merchant by platform merchantId.
 * Throws if merchant is not in the admitted directory (no runtime guessing).
 * @param merchantId - Platform merchant identifier.
 * @returns The admitted merchant record.
 */
getAdmittedMerchant(merchantId: string): WangwangAdmittedMerchant

/**
 * Get admitted merchant by Harness ImAccountId.
 * @param accountId - Harness IM account identifier.
 * @returns The admitted merchant record.
 */
getAdmittedMerchantByAccount(accountId: ImAccountId): WangwangAdmittedMerchant

/**
 * Resolve secret credentials on demand per call via CredentialProvider.
 * Credentials are never stored on instance fields or logged.
 * @param merchant - Admitted merchant whose CredentialRefs are resolved.
 * @returns The resolved access/secret key pair.
 */
async resolveCredentials(merchant: WangwangAdmittedMerchant): Promise<ResolvedWangwangCredentials>

/**
 * Resolve inbound sender identity against the durable local outbox echo index.
 * The echo index is the adapter's own durable record of settled DSH sends;
 * upstream senderType claims are only trusted when they agree with it.
 * See {@link resolveWangwangSender} for the classification invariants.
 * @param event - Raw Wangwang event from the OpenAPI events poll.
 * @param merchant - Admitted merchant the event belongs to.
 * @returns Sender classification plus factual evidence.
 */
resolveSenderWithOutboxEvidence( event: WangwangRawEvent, merchant: WangwangAdmittedMerchant, ): WangwangSenderResolution

/**
 * Get durable channel cursor from persistent domain table.
 * Survives host restarts and crashes.
 * @param merchantId - Platform merchant identifier.
 * @returns The last durably advanced sinceId, or 0 when never pulled.
 */
getDurableCursor(merchantId: string): number

/**
 * Set durable channel cursor directly in persistent domain table.
 * @param merchantId - Platform merchant identifier.
 * @param sinceId - New cursor position.
 */
async setDurableCursor(merchantId: string, sinceId: number): Promise<void>

/**
 * Pull incremental events page for an admitted merchant and deliver to ImDeliveryService.
 *
 * Invariant: the whole pull runs under the per-merchant mutex, so the durable
 * cursor read -> fetch -> advance cycle is atomic against concurrent pulls.
 * Invariant: Whole page must be processed and persisted BEFORE advancing the durable channel cursor.
 * Invariant: Cursor backward movement is safely rejected with CHANNEL_CURSOR_REGRESSION.
 * @param merchantId - Platform merchant identifier.
 * @returns Processed event count, next cursor position, and hasMore flag.
 */
async pullAndDeliver(merchantId: string): Promise<{ processedCount: number nextSinceId: number hasMore: boolean }>

/**
 * Send outbound message to Wangwang with strict status classification:
 * - pre_send_failed: validation error, unconfigured/disabled route, paused account for AI
 *   (owned by ImDeliveryService.registerOutbound, never duplicated here)
 * - sent: successfully delivered with receipt; a durable local outbox echo
 *   record is written so later inbound echoes classify from local evidence
 * - result_unknown: network timeout, 5xx, or ambiguous receipt (MUST NOT blindly retry)
 * @param request - Outbound send request with account, customer, content, and requestId.
 * @returns The strict send status classification and receipt facts.
 */
async sendMessage(request: WangwangSendMessageRequest): Promise<WangwangSendMessageResult>
```

Source: [`packages/im/im-wangwang/src/service.ts`](../../packages/im/im-wangwang/src/service.ts)
<!-- END GENERATED cordis-surface -->
