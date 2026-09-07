# 会话持久化

[English](persistence.md) | 中文

事件日志的**持久性 seam**。[session.md](session.zh.md) 描述了内存中的 `Session`：仅追加的 `SessionEvent` 日志即为真源。本页描述如何使该日志持久化：抽象的 `SessionPersistence` 服务、它的后端、flush 检查点、崩溃恢复，以及随日志一同存储的元数据头。日志承载的事件词汇在生成的[持久化日志事件目录](../persistence-catalog.zh.md)中逐项列举。

该 seam 是一个[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)：一个抽象服务（[dsh-session-persistence](../../packages/session/session-persistence)，`ctx.sessionPersistence`）在现有 `SessionEvent` 上定义 locate/create/append、可复用的 Session 准备流程、逻辑 load/inspect、物理后缀读取，以及轻量的 list/snapshot 观察——**没有平行的持久化事件类型**——以及三个实现同一约定的可互换提供方。见 [session-persistence Agent Note](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.zh.md)。

## flush 检查点

`session/event` 是一个*同步*通知；持久化插件会将事件复制到逐会话控制器，而不阻塞生产方。第一个待处理事件会开启固定批处理窗口，后续事件会加入但不会重置截止时间。窗口到期后会启动一个持久化批次；该次写入期间接纳的事件会获得自己的截止时间，并形成后续批次。`session/flush` 会取消等待并排空至完全停稳，因此循环仍将其用作在领取下一个普通轮次之前的顺序与错误观察检查点。后台写入被拒绝时会保留对应事件并暂停自动重试；新事件会开启新的固定窗口，而显式 flush 会立即重试，并通过 `agent/error` 和 logger 报告失败，绝不会把失败记录成已关闭轮次之后的会话事件。dispose（资源释放）会执行同样的最终排空。配置的最大值只限制有意的批处理等待，不限制事件循环调度或后端完成持久化的延迟（[决策](../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.zh.md)）。

## 崩溃恢复保留被中断的轮次

后端重新加载一个在轮次中途崩溃的日志时，会发现一个已打开的 `turn/start` 却没有 `turn/end`。它**不会**截断日志：在长周期任务中，单个轮次可能非常庞大（许多步骤、大量工具输出），而这些事件在崩溃前已被持久追加。后端改为用一个合成的 `turn/end { reason: { kind: 'interrupted' } }` 关闭这个遗留轮次，在不改变其前后任何独立事件的情况下配平被中断的执行。`interrupted` 是唯一一个不由循环发出的 `TurnEndReason`（见 [session.md](session.zh.md#why-a-turn-ended-turnendreasonmap)）。

修复仅适用于冷会话。对于活跃 id，`SessionPersistence.load(id)` 会等待权威内存快照完成持久化，并且只在日志平衡时返回；若活跃轮次仍未闭合，则拒绝操作，而不是添加合成的中断边界。HMR（热模块替换）会接管活跃前缀，而不会关闭其中正在进行的轮次。

`SessionPersistence.inspect(id)` 会构造一个不可变的逻辑 Session，但不发布它，也不写入恢复内容。冷检查会在内存中配平中断的轮次，同时保持撕裂的物理尾部不变；检查已处于活跃状态的 Session 则借用其当前不可变快照，因此可能包含未闭合的轮次。使用协调器的实现会在有界 LRU 中保留这个精确的冷未发布 Session，因此重复历史读取与后续 `prepare(id)` 可复用同一次读取、解压、验证、冻结及 Session 构造。`prepare(id)` 会预留该 Session、提交待处理修复并返回可 dispose 的发布句柄；`load(id)` 使用相同机制提交修复，但不会发布 Session。该生命周期由 [Session 准备阶段决策](../../.agents/notes/implemented/architecture/2026-08-05-session-preparation.zh.md)定义。

## `SessionLocation`——可选的逐会话产物目标

`SessionPersistence.locate(meta)` 会同步解析一个归后端所有的独立产物，而不会读取、创建或 flush 它。JSONL 返回其项目/会话目录内 transcript（文本记录）的绝对路径；SQLite 因各会话共享一个数据库而返回 `undefined`。因此，返回的路径可能指向尚不存在的文件，或指向还不包含当前尚未 flush 轮次的文件；它是位置提示，不是授权或新鲜度保证。

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. The path is an
 * absolute target path and can name an artifact that has not materialized yet.
 * Consumers must treat it as a location hint, never as an authorization token.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

## `SessionHeader`：日志旁的元数据

每个会话的元数据与事件日志**分开**存储：格式版本、cwd、血统与 seed 边界是存储层关注点而非对话事件，因此不进入 `SessionEventMap`，也不会到达 `deriveMessages()`。header 通过 `session.header` 附加到 `Session` 上。

源码：[`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * On-disk format version, stamped from {@link SESSION_FORMAT_VERSION} when the
   * session is created. A persistence backend rejects any other version on load
   * (no migration — see the constant).
   */
  readonly version: number
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * How many leading events were inherited through a seed. Persisting this
   * boundary lets resume and replay distinguish parent history from child work.
   */
  readonly seedLength?: number
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## 格式拒绝：本构建无法可靠读取的日志

后端用 `SessionFormatUnsupportedError` 拒绝无法可靠解读的日志，它与 `SessionPersistenceCorruptionError` 区分，因为数据没有损坏。header 的 `version` 比 `SESSION_FORMAT_VERSION` 新时，消息说明方向（"由更新的 harness 写入，请升级 harness 后打开"）；比它旧时说明本构建没有升级路径。经过 legacy 形状归一化后，本构建生成词汇表（`KNOWN_SESSION_EVENT_TYPES`，由 `gen-persistence-catalog` 生成）之外的事件类型同样被拒绝，除非该事件的信封带 `ignorable: true`：静默跳过一个不认识的必需事件可能改变日志其余部分的解读方式。后端为每个会话保留独立文件时，消息附上原始日志路径，被拒绝的文本仍然可读。JSONL 后端直接从原始 header 行拒绝外来版本，先于当前 header 形状校验和任何事件行解码，因此结构完全不同的未来格式仍会报告升级方向，绝不会报"损坏"；SQLite 则先由自己的 `SCHEMA_VERSION` pragma 把关整个文件的结构。设计理由与推迟建设的升级器链见 [session-log 版本机制 Agent Note](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)。

## `CreateSessionOptions`：seed 与元数据

通过 store 创建 `Session` 时会接收 `seed`（初始回放或 fork 历史）与 `meta`（store 整合进 `SessionHeader` 的存储层字段）。store 填充 `version`/`id` 并为 `createdAt` 提供默认值；调用方可以提供已校验的绝对 `cwd`、`parentSession` 谱系、`seedLength` 种子边界、可选的粗粒度 `origin`、`delegationDepth`、用于组装该 agent（智能体）的 `agentPreset` 以及已有的 `createdAt`。`origin: 'subagent'` 让产品导航能够隐藏重复的 child 行；它不证明描述符有效，也不证明 child 可以恢复。

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Storage metadata read once before publication. `seedLength` is explicit
   * because a resumed seed contains the full stored log, not only its inherited prefix.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly seedLength?: number
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

因此，回放/fork 的调用方式为 `ctx.sessions.create(id, { seed: seedEvents })`；将一个*持久化*会话恢复为活跃 agent 的调用方式为 `ctx.agents.resume({ resumeSessionId })`。

## `SessionRawArtifact`——逐字存储工件文本

后端为单个会话自持的工件文本，与其持久化写入的字节逐字一致（按物理编码解码）。`readRaw` 返回它而不从解析后事件重建，因此后端特定的序列化（chunk 打包、键序、换行）得以保留。Consumer 须先检查 `supportsRawArtifacts`：`false` 表示后端不提供此能力（如 SQLite），而 `readRaw(...) === undefined` 表示受支持的后端没有该会话的已实体化工件。

```ts type-equiv
/** A backend's own raw artifact text for one session, verbatim. */
interface SessionRawArtifact {
  /** The session header parsed from the artifact's own first line. */
  readonly meta: SessionHeader
  /** The artifact's base filename on disk, without any physical encoding suffix. */
  readonly filename: string
  /** The artifact's full text content, decoded from the backend's physical encoding. */
  readonly content: string
}
```

## 准备与恢复所有权

`SessionStore.prepare()` 接收普通创建选项，或通过 `RestoredSessionOptions` 转移所有权的全新的持久化对象图。恢复分支会就地验证并冻结转移来的 header 与事件，因此调用方不得保留可变别名。`SessionPreparation` 随后持有该精确的未发布 Session，直至发布或回滚；dispose 是同步且幂等的。持久化检查只暴露 `SessionInspection`，即从同一个已准备 Session 借用的不可变逻辑视图。

```ts type-equiv
/**
 * Fresh storage values transferred to {@link SessionStore.prepare} without a
 * second serialization copy. Callers retain no mutable aliases.
 */
interface RestoredSessionOptions {
  /** Fresh detached storage events to validate and freeze in place. */
  readonly seed: SessionEvent[]
  /** Fresh detached storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Select the persistence ownership-transfer path. */
  readonly seedSource: 'persistence'
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly seedSource?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

```ts type-equiv
/** Immutable logical session prepared from persistence or a live owner. */
interface SessionInspection {
  /** Validated immutable session metadata. */
  readonly meta: SessionHeader
  /** Validated contiguous logical event log. */
  readonly events: readonly SessionEvent[]
}
```

## 轻量源修订号

派生状态的消费方会在加载完整事件日志之前比较一个低开销的不透明修订号。其表示由持久化后端拥有，并随 append 或会修改数据的 load 修复以事务方式改变；调用方仅比较修订号是否相等。

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/** Lightweight immutable source identity returned without loading a full log. */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one materialized session. */
  header: SessionHeader
  /** Opaque source-qualified token that changes whenever this stored log changes. */
  revision: SessionPersistenceRevision
}
```

## 后端

两者都实现同一个抽象 `SessionPersistence`（在 `SessionEvent` 上执行 locate/create/append/prepare/load/inspect/readFrom/list/listSnapshots，观察方法可选支持取消），并通过共享的 `runPersistenceContract` 套件：

- **[dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)**——逐会话仅追加的逻辑 JSONL 日志，默认存储为带 checksum 的连续 Zstandard frame，也可配置为原始行；支持崩溃安全的原子写入、被中断轮次的恢复以及读取/回放路径。
- **[dsh-session-persistence-sqlite](../../packages/session/session-persistence-sqlite)**：一个可选启用的 `node:sqlite` 后端，使用 schema 17 把同一分片块中字段完全匹配的 delta 连续段存为有界物理 `text-chunks`、`reasoning-chunks` 与 `tool-call-chunks` 行。它在返回前重建完整逻辑事件流，只打包新增的持久批次，并拒绝旧 schema，而不是执行迁移。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstract seam)

Durable append-only session storage addressed through per-session handles.

Storage semantics shared by every backend: events are contiguous from seq 0 and never rewritten; a torn physical tail is never returned to a reader and is truncated by the write path before its first append; reads validate current-format records only and refuse unknown vocabulary fail-closed. `append` persists best-effort; `flush` — per handle or service-wide — is the durability barrier.

Visibility: a created session is observable through `stat`/`list`/`open` in this process from the moment `create` resolves, even while a backend defers physical materialization (a pure optimization); other processes see the session only once it materializes, and a session that never materialized before a crash never existed. `SessionHandle.flush` forces materialization.

Freshness: once an `append` or `flush` resolves, reads started afterwards on this backend instance observe at least that prefix.

```ts cordis-catalog
/**
 * Create a new stored session and take its write ownership.
 * @param header - the immutable header (id, version, cwd, lineage) to store.
 * @param options - optional cancellation.
 * @returns a `write` handle owned by the caller; close it to release ownership.
 * @throws {SessionAlreadyExistsError} when the id already exists.
 */
abstract create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>

/**
 * Open an existing stored session.
 *
 * `read` never takes ownership and works while another handle (or process)
 * holds write ownership. `write` atomically claims single-writer ownership;
 * an existing active owner rejects.
 * @param id - the stored session to open.
 * @param access - `read` or `write`.
 * @param options - optional cancellation.
 * @returns the open handle.
 * @throws {SessionPersistenceNotFoundError} when the session does not exist.
 * @throws {SessionAlreadyOwnedError} for `write` when ownership is taken.
 */
abstract open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>

/**
 * Flush every active write handle owned by this service instance in one
 * durability barrier: each handle's routed live events drain durably and
 * its session materializes, exactly as that handle's own
 * `SessionHandle.flush` would. Read handles buffer nothing and are
 * untouched. A handle closed concurrently counts as flushed — close itself
 * drains durably.
 * @returns resolution once every write handle active at the call has flushed.
 * @throws {AggregateError} naming each session whose flush failed; the
 *   remaining handles still flush.
 */
abstract flush(): Promise<void>

/**
 * Observe one stored session without reading its event log or taking
 * ownership.
 *
 * The snapshot's `revision` is an opaque change token comparable only
 * against revisions from the same service instance and session id: equal
 * revisions may be treated as an unchanged log; unequal revisions promise
 * nothing. Write-ownership churn does not change a revision. It exists for
 * derived read-model caches keyed off `stat`/`list`; it plays no part in
 * open, read, or resume.
 * @param id - the stored session to observe.
 * @param options - optional cancellation.
 * @returns the snapshot, or `undefined` when the session does not exist.
 */
abstract stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined>

/**
 * List every stored session visible to this process, in no promised order.
 * @param options - optional cancellation.
 * @returns one snapshot per stored session.
 */
abstract list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>
```

Types: [SessionId](core.zh.md)

Source: [`packages/session/session-persistence/src/index.ts`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->
