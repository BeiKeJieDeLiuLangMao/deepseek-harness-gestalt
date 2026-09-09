# @deepseek-ai/dsh-im-core

English | [中文](README.zh.md)

IM domain configuration, accounts, and routing core service for DeepSeek Harness.

## Summary

`im-core` manages external IM accounts, workspace route rules, group trigger criteria, and simulation target bindings over `StorageDomain`. It separates credential references from secrets, prioritizes specific conversation rules over global rules, preserves disabled bindings without fallback, and ensures unconfigured conversations are never routed to sensitive workspaces.

## Service

Mounted at `ctx.imConfig`.

### Public Methods

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

## Invariants

- **Credential Reference**: Only opaque nominal `CredentialRef` is stored; secrets are kept behind the credential seam.
- **Specific Precedence**: A specific conversation rule always overrides an `all` rule.
- **Disabled Binding Retention**: Disabling a specific rule retains its workspace binding; resolution returns `disabled` and never falls back to an `all` rule.
- **Single Workspace per Conversation**: A specific conversation ID cannot be bound to multiple workspaces simultaneously without an explicit rebind.
- **Unconfigured No-Trigger**: Unmatched conversations resolve to `unconfigured` to prevent accidental access.
- **Group Trigger Invariant**: Group routes require at least one trigger condition (mention, everyN, or fixedIntervalSeconds) with positive numbers.
- **Simulation Target Restriction**: Workspace simulation targets must reference existing configured accounts.
