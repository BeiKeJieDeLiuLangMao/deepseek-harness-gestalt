# Testing policy

English | [中文](testing.zh.md)

This reference defines the repo's test tiers and the rules that keep a green suite meaningful. Commands live in root [AGENTS.md](../AGENTS.md); linked Agent Notes own rationale.

## Tiers

- **Unit** (`pnpm run test`): vitest runs package and example `tests/**` plus `scripts/**/*.spec.ts`; specs stay with exercised code. Each registry gets an HMR-safety test that disposes its contributing fiber and asserts cleanup. Prefer edge cases, error paths, event ordering, races, and permanent contract-regression tests (see `packages/core/agent-loop/tests/contract-regressions.spec.ts`).
- **Coverage gate** (`pnpm run test:coverage`): the gating run enforces per-file 100% on `packages/*/*/src`. Uncovered lines are often dead code to delete, not tests to add. Coverage proves execution, not shipped behavior. `packages/shell/pwsh-local/src` needs real `pwsh`; without it, executor suites self-skip and `vitest.config.ts` exempts the file so pwsh-less hosts stay green, while CI runners include pwsh and enforce 100%.
- **Real-API e2e** (`pnpm run test:e2e`): with-key tests call live provider APIs, including DeepSeek and provider-specific smokes guarded by their own keys (`EXA_API_KEY`, `PERPLEXITY_API_KEY`, …). Each suite self-skips without its key so keyless CI stays green ([Agent Note](../.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.md)).
- **Owner-local expected output** (`pnpm run test:expected`): keyless assembled CLI/process expectations without a recorded-session round trip. Drivers use `*.expected.e2e.ts` beside `tests/expected/`; CI runs built exports. Package/script expectations use `test`; browser expectations use `test:web`.
- **Performance benchmarks** (`pnpm run test:bench`; required Linux PR gate `node 24 / benchmarks`): `benchmarks/` groups user-path gates. They build libraries and workers; timed code runs under plain Node, never TSX. Synthetic inputs enforce time, heap, and scaling budgets; package-local `.perf.ts` remains diagnostic ([rules](../.agents/notes/implemented/testing/2026-09-04-session-open-performance-gate.md)).
- **Snapshot** (`pnpm run test:snapshot`): a top-level scenario's highest recorded parent generation supplies user input, model replay, and the expected persisted result. Parent files are `session[.vN].jsonl`; child roles are `session.<ordinal>[.vN].jsonl`. v0 omits `.v0`; positive versions use lowercase `.vN`; filenames match headers. Process scenarios start through `dsh`: headless owns one-shot behavior, SDK owns persistent control, ACP owns automation-protocol behavior, and Web owns browser/ARIA evidence beside the Session. `snapshot.yml` declares the profile, composition/header class, recording policy, replay/input exceptions, and workspace facts. Typed tokens preserve parent/child identity; only header pins own prompt/schema sidecars. Mutating scenarios compare the complete `workspace.expected/` tree, which record and refresh never rewrite. Use `test:snapshot:record` for a changed model transcript and `test:snapshot:refresh` while replay input remains valid; review every diff.
- **Web browser snapshot** (`pnpm run test:web`; required Linux PR gate): Chromium compares session-driven `snapshots/web/` output and UI-only `apps/web/tests/expected/` output. CI forces read-only `DSH_SNAPSHOT=replay` and never writes expected outputs; record/refresh stay local, and every diff is reviewed ([web e2e lane](../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.md), [CI decision](../.agents/notes/implemented/testing/2026-07-30-web-browser-snapshot-ci-gate.md)). `test:web` builds first for plugin CSS.

Session fixtures keep headers and payloads but omit body sequence/time envelopes, which replay synthesizes. Replay, record, and refresh select each parent/child role's highest generation. V3 uses `.v3`, one row per event, and embedded compact Assistant streams. Historical fixtures keep their released representation; explicit `sessionFormat` owners retain migration coverage. Add successors without changing predecessors through the [format-version cookbook](cookbook/adding-a-session-format-version.md#snapshot-successors).

## How specs execute

Forked workers run specs concurrently; coverage partitions run beside other gates in their job, and self-hosted runners share one host and volume. Only processes are isolated: ports, predictable paths, external namespaces, and inherited children are not. Own acquired resources through teardown; a spec that passes only alone is defective. [dsh-ci-test-reliability](../.agents/skills/dsh-ci-test-reliability/SKILL.md) owns allocation, restoration, synchronization, timeout budgets, platform, and teardown rules; its [flake workflow](../.agents/skills/dsh-ci-test-reliability/references/ci-flake-diagnosis.md) classifies existing probabilistic failures.

## The with-key policy: inference is cheap here

DeepSeek does not ration real-API tests. No-key tests prove plumbing; only with-key runs prove the agent works with a real model. Cover file-writing prompts, multi-turn conversations, tool use, and mid-stream cancellation. Prefer **smoke tests** that boot the real application, send one prompt, and inspect the world; they catch green units with a broken product that mocks cannot ([postmortem 0001](postmortem/0001-acp-default-export-drops-inject.md)). Self-skip keeps secretless CI and keyless contributors unblocked; it is not a cost signal. Keep both scenario types beside the application, profile, or package they exercise.

## Prefer the real implementation over a mock

Mock only expensive or nondeterministic boundaries (LLM adapter, network, clock); keep downstream code real. A hand-written stand-in proves that the bridge moves bytes, not the shipped tool's asserted behavior. Bridge tool-call tests combine the scripted model with real tools and executors: `makeBridgeHarness({ withBash: true })` loads `dsh-bash-local` and `dsh-tool-bash`, then runs `echo`.

Recovery tests distinguish pre/post-chunk failures by step and prove failed chunks derive no message or tool side effect. Cover exhaustion, cancellation, policy composition, persistence, status, wire counts, transport-closing idle timeouts, and shipping Loader composition.

## Verify the world, not the self-report

An e2e assertion externally reruns the command or rereads the file; probing the agent's output lets it cheat. Assert untouched files remain byte-identical. Tests own resources: create the harness in the test and dispose it in `afterEach`, including failure, retry, and timeout. Shared fixtures live in `tests/harness.ts`, never `*.e2e.ts`; importing a spec re-registers `describe` and duplicates real API calls.

## Test the real entry path

- Product-visible plugins require a non-unit REAL-composition test. Hand-built `ctx.plugin(...)` suites do not suffice: boot test-only `cordis.yml` through Loader and app/process, mock only external services or nondeterministic inputs, and assert model-visible requests/logs, durable state, or user-visible output. Exclude opt-ins from shipped defaults.
- A guard must fail on its regression. For plugins without `inject` (bundle/composition plugins), a Loader smoke stays green if a default export replaces required named exports. Assert `expect('default' in mod).toBe(false)` and an `unwrapExports` round trip; introduce the regression, observe red, then revert.
- The real entry path is the published artifact: a package `bin` runs built `lib/bin.js` under plain `node`, exposing settle races, module resolution, and swallowed load failures that tsx masks. This also covers non-index entries (`lib/worker.cjs`) and bundle-shared singletons (`packages/sdk/server/tests/built-scope-carrier.e2e.ts`). Keep built smokes green (`packages/examples/*/tests/built-bin.e2e.ts`, `packages/code-runtime/code-runtime-worker-thread/tests/built-lib.e2e.ts`) and assert a missing config exits non-zero.

## Test resolution: source plane only

- Every vitest config points vite-tsconfig-paths at `tsconfig.base.json`; bare workspace imports resolve to `src` ([layout](development.md#typescript-project-layout)), never through package `exports` to built `lib/`, where stale artifacts load duplicate module singletons. Only `lib`-mode subprocesses and built smokes consume artifacts.

## Test subprocess launch modes

- CI and test lanes with builds run every example or Cordis-config subprocess from built `lib/` through the shared dual-mode launcher. Do not hand-write `--import tsx` for them.
- Protocol and operating-system fixtures that do not load Cordis run erasable `.ts` directly with Node, without tsx or root path mapping.
- Only a test whose subject is source-path resolution may select `src`; state that contract in the test.
- Real Chromium Browser Runtime e2e runs only through `pnpm run test:electron-runtime-e2e`. Do not set `ELECTRON_RUN_AS_NODE`. Node `test:e2e` keeps the named skip ([launcher note](../.agents/notes/implemented/testing/2026-08-20-electron-runtime-e2e-launcher.md)).
- Project Members assembled acceptance is `apps/desktop/tests/member-question-e2e/assembled-project-members.spec.ts` (keyless two-account, three-installation walk over real listeners). Visible Electron coverage is `pnpm run test:e2e-project-members-electron`; Linux requires a visible `DISPLAY`.

## When a snapshot test is required

Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless recorded-session scenario in the same PR; package, e2e, mock-only, and rationale evidence cannot replace the assembled transcript. Headless, SDK, ACP, and Web recordings live under `snapshots/session/`, `snapshots/sdk/`, `snapshots/acp/`, and `snapshots/web/`; Web may borrow another scenario's canonical session explicitly. Non-session-driven expected output stays with its app, package, or script under `tests/expected/` without the `*.snapshot.ts` suffix. [`dsh-session-snapshot`](../packages/test-support/session-snapshot/README.md) owns shared storage rules and profile adapters. Agent-loop, session-lifecycle, and `SessionEventMap` changes update both SDK projections: TypeScript in `snapshots/sdk/`, Python in `scripts/snapshots/python-sdk-single-exe/` under [Python-runtime CI](../.agents/notes/implemented/process/2026-09-06-master-only-platform-ci.md). New capability seams and lifecycle or transcript variants name every required tier at plan time.
