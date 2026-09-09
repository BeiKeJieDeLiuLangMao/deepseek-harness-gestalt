# 测试策略

[English](testing.md) | 中文

本参考文档定义仓库的测试层级，以及让绿色测试套件保持意义的规则。命令见根目录 [AGENTS.md](../AGENTS.md)；相关 Agent Note 承载设计动机。

## 层级

- **单元测试**（`pnpm run test`）：vitest 运行包和示例的 `tests/**`，以及 `scripts/**/*.spec.ts`；spec 与所测代码放在一起。每个注册表都要有 HMR（热模块替换）安全测试，对贡献 fiber 执行 dispose（资源释放）并断言清理完成。优先测试边界情况、错误路径、事件顺序、竞态，以及永久的约定回归用例（见 `packages/core/agent-loop/tests/contract-regressions.spec.ts`）。
- **覆盖率门禁**（`pnpm run test:coverage`）：门禁级运行对 `packages/*/*/src` 执行按文件 100% 覆盖。未覆盖的行往往是应删除的死代码，而非应补测试的代码。覆盖率只能证明代码被执行，不能证明功能按交付预期工作。`packages/shell/pwsh-local/src` 需要真实的 `pwsh`；缺少它时执行器套件会自动跳过，`vitest.config.ts` 会豁免该文件，使无 pwsh 的主机保持绿色；CI runner 自带 pwsh，并执行 100% 覆盖门禁。
- **真实 API e2e**（`pnpm run test:e2e`）：带密钥测试调用真实提供方 API，包括 DeepSeek 和各提供方特有的冒烟测试；每个套件由自己的密钥控制（`EXA_API_KEY`、`PERPLEXITY_API_KEY` 等）。缺少密钥时套件会自动跳过，使 keyless CI 保持绿色（[Agent Note](../.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.zh.md)）。
- **所属位置的预期输出**（`pnpm run test:expected`）：无录制会话往返的无密钥组装 CLI（命令行界面）/进程预期。驱动使用 `*.expected.e2e.ts`，并与 `tests/expected/` 同属一处；CI 针对构建产物运行。包/脚本预期使用 `test`；浏览器预期使用 `test:web`。
- **性能基准**（`pnpm run test:bench`；必需的 Linux PR（Pull Request）门禁 `node 24 / benchmarks`）：`benchmarks/` 按用户路径组织门禁。它们先构建 library 和 worker；被计时代码在纯 Node 下运行，不使用 TSX。合成输入执行耗时、堆和缩放预算；包内 `.perf.ts` 仅供诊断（[规则](../.agents/notes/implemented/testing/2026-09-04-session-open-performance-gate.zh.md)）。
- **快照**（`pnpm run test:snapshot`）：顶层场景数值最高的已录制 parent generation 同时提供用户输入、模型回放和持久化结果预期值。parent 文件名是 `session[.vN].jsonl`；child 角色使用 `session.<ordinal>[.vN].jsonl`。v0 省略 `.v0`；正版本使用小写 `.vN`；文件名必须与 header 一致。进程级场景都通过 `dsh` 启动：headless 负责一次性行为，SDK 负责持久控制，ACP 负责自动化协议行为，Web 负责在同一 Session 旁保留浏览器与 ARIA 证据。`snapshot.yml` 声明 profile、组合与请求头类别、录制策略、例外回放或输入元数据以及 workspace 事实。带类型的 token 保留父子身份关系；只有请求头 pin 拥有 prompt/schema sidecar。变更 workspace 的场景会比较完整的 `workspace.expected/` 目录，record 与 refresh 绝不改写该目录。当模型 transcript（文本记录）变化时使用 `test:snapshot:record`，回放输入仍有效时使用 `test:snapshot:refresh`；审查所有差异。
- **Web 浏览器快照**（`pnpm run test:web`；必需的 Linux PR 门禁）：Chromium 比较 `snapshots/web/` 下由会话驱动的输出，以及 `apps/web/tests/expected/` 下仅含 UI 的输出。CI 强制只读的 `DSH_SNAPSHOT=replay`，绝不写入预期输出；record/refresh 留在本地，每处 diff 都须评审（[web e2e 车道](../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.zh.md)、[CI 决策](../.agents/notes/implemented/testing/2026-07-30-web-browser-snapshot-ci-gate.zh.md)）。`test:web` 会先构建以交付插件 CSS。

Session fixture 保留 header 与 payload，但省略正文 seq/time envelope；replay 会合成这些 envelope。Replay、record 与 refresh 会选择每个 parent/child 角色的最高 generation。当前 fixture 在文件名与 header 中使用[写入格式](session-format-status.zh.md)，每个事件一行，并嵌入紧凑 Assistant stream。历史 fixture 保留其已发布表示；显式 `sessionFormat` 所有者保留迁移覆盖。按照[格式版本实操手册](cookbook/adding-a-session-format-version.zh.md#snapshot-successors)添加后继代际，不改动前代。

## spec 如何被执行

fork 出的 worker 会并发运行 spec；coverage partition 与所在 job 的其他门禁并行，自托管 runner 共用宿主机和卷。只有进程相互隔离；端口、可预测路径、外部命名空间和继承的子进程并不隔离。为占用的资源负责到 teardown；仅在单独运行时通过的 spec 存在缺陷。[dsh-ci-test-reliability](../.agents/skills/dsh-ci-test-reliability/SKILL.md) 负责资源分配、状态恢复、同步、超时预算、平台差异与 teardown 规则；其 [flake 流程](../.agents/skills/dsh-ci-test-reliability/references/ci-flake-diagnosis.md)用于归类已有的概率性失败。

## 带密钥策略：推理（inference）在这里很便宜

DeepSeek 不限制真实 API 测试。无密钥测试只能证明底层通路；只有带密钥运行才能证明 agent（智能体）可与真实模型协作。覆盖文件写入提示词、多轮对话、工具使用和流中取消。优先使用**冒烟测试**：启动真实应用、发送一条提示词并检查外部世界；它们能捕获 mock 无法发现的「单元测试全绿、产品损坏」问题（[事故复盘 0001](postmortem/0001-acp-default-export-drops-inject.zh.md)）。自动跳过使无密钥 CI 和无密钥贡献者不受阻塞；它不是成本信号。两类场景都放在所验证的应用、profile 或包旁边。

## 优先使用真实实现而非 mock

只 mock 开销高或不确定的边界（LLM（大语言模型）适配器、网络、时钟）；下游代码保持真实。手写替身只能证明桥接层在搬运字节，不能证明交付工具的行为符合断言。桥接工具调用测试将脚本化模型与真实工具和执行器配合使用：`makeBridgeHarness({ withBash: true })` 加载 `dsh-bash-local` 与 `dsh-tool-bash`，然后运行 `echo`。

恢复测试按步骤区分分片前后的失败，并证明失败分片不会派生出消息或工具副作用。覆盖耗尽、取消、策略组合、持久化、状态、协议计数、会关闭传输的空闲超时，以及交付的 Loader 组合。

## 验证外部世界，而非自我报告

e2e 断言应从外部重新运行命令或读取文件；探测 agent 自身输出会让它作弊。断言未修改的文件逐字节一致。测试自行管理资源：在测试中创建 harness，并在 `afterEach` 中 dispose，即使失败、重试或超时也要释放。共享 fixture 放在 `tests/harness.ts` 中，绝不放在 `*.e2e.ts` 中；导入 spec 会重新注册 `describe`，导致真实 API 调用重复执行。

## 测试真实入口路径

- 产品可见的插件必须有一个非单元的真实组合测试。手动构建的 `ctx.plugin(...)` 套件不够：通过 Loader 和 app/process 启动仅用于测试的 `cordis.yml`，只 mock 外部服务或不确定输入，并断言模型可见的请求/日志、持久状态或用户可见输出。交付默认值不包含 opt-in 选项。
- 守卫必须能被对应回归触发。对于没有 `inject` 的插件（bundle/组合插件），默认导出替换必需的具名导出时，Loader 冒烟测试仍会通过。断言 `expect('default' in mod).toBe(false)` 并执行 `unwrapExports` 往返；引入回归、观察变红，然后回退。
- 真实入口路径指已发布的产物：包的 `bin` 通过普通 `node` 运行构建后的 `lib/bin.js`，暴露 tsx 会掩盖的结算竞态、模块解析与被吞掉的加载失败。这也适用于非 index 入口（`lib/worker.cjs`）和多个 bundle 共享的单例（`packages/sdk/server/tests/built-scope-carrier.e2e.ts`）。保持构建产物冒烟测试绿色（`packages/examples/*/tests/built-bin.e2e.ts`、`packages/code-runtime/code-runtime-worker-thread/tests/built-lib.e2e.ts`），并断言缺失配置时以非零状态退出。

## 测试解析：仅限源码

- 每个 vitest 配置都将 vite-tsconfig-paths 指向 `tsconfig.base.json`；工作区包的裸导入解析到 `src`（[布局](development.zh.md#typescript-project-layout)），绝不经由包的 `exports` 解析到构建后的 `lib/`，其中的陈旧产物会加载重复的模块单例。只有以 `lib` 模式运行的子进程与构建产物冒烟测试会使用产物。

## 测试子进程启动模式

- CI 与已有构建产物的测试通道通过共享双模式启动器，从构建后的 `lib/` 运行每个示例或 Cordis 配置子进程。不要为它们手写 `--import tsx`。
- 不加载 Cordis 的协议与操作系统 fixture 直接通过 Node 运行使用可擦除语法的 `.ts` 文件，不经过 tsx 或根路径映射。
- 只有测试对象本身是源码路径解析时，才可以选择 `src`；在测试中写明这一约定。
- 真实 Chromium Browser Runtime e2e 只通过 `pnpm run test:electron-runtime-e2e` 运行。不要设置 `ELECTRON_RUN_AS_NODE`。Node 上的 `test:e2e` 保留具名跳过（[启动器说明](../.agents/notes/implemented/testing/2026-08-20-electron-runtime-e2e-launcher.zh.md)）。
- Project Members 组装验收是 `apps/desktop/tests/member-question-e2e/assembled-project-members.spec.ts`（无密钥双账号、三安装、真实 listener 走查）。可见 Electron 覆盖是 `pnpm run test:e2e-project-members-electron`；Linux 需要可见 `DISPLAY`。

## 何时需要快照测试

每项非平凡的模型可见、协议可见或人类可见变更，都在同一 PR 中添加或更新无密钥录制会话场景；包级、e2e、仅 mock 和 PR 理由证据不能取代组装后的 transcript。Headless、SDK、ACP 和 Web 录制分别位于 `snapshots/session/`、`snapshots/sdk/`、`snapshots/acp/` 和 `snapshots/web/`；Web 可以显式借用另一个场景的规范会话。不由录制会话驱动的预期输出保留在所属应用、包或脚本的 `tests/expected/` 下，并且不使用 `*.snapshot.ts` 后缀。[`dsh-session-snapshot`](../packages/test-support/session-snapshot/README.zh.md) 拥有共享存储规则和 profile 适配器。Agent loop、会话生命周期和 `SessionEventMap` 变更应更新两个 SDK 投影：TypeScript 位于 `snapshots/sdk/`，Python 位于 [Python 运行时 CI](../.agents/notes/implemented/process/2026-09-06-master-only-platform-ci.zh.md) 所有的 `scripts/snapshots/python-sdk-single-exe/`。新增 capability seam、生命周期或 transcript 变体应在计划阶段列出每个必需层级。
