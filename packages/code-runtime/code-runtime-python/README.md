---
description: "Versionless fd-3 protocol vocabulary shared by the host and the experimental CPython code runtime."
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime-python

English | [中文](README.zh.md)

## Summary

Versionless fd-3 protocol vocabulary for the experimental [`@deepseek-ai/dsh-code-runtime`](../code-runtime/README.md) CPython Provider. This package validates and exports the host-side frame codec and mirrors the same message vocabulary in `py/protocol.py`; the executable Service Provider lives in [`@deepseek-ai/dsh-experimental-code-runtime-python`](../../experimental/code-runtime-python/README.md).

It does not register the code-runtime seam or spawn `python3`.

## Table of Contents

- [Wire protocol](#wire-protocol)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="wire-protocol"></a>
## Wire protocol

The host and the CPython subprocess exchange a versionless, JSON-lines protocol on the child's fd 3 — one JSON object per line, leaving stdout/stderr free for the program's own output. `src/protocol.ts` is the host side; `py/protocol.py` mirrors its message shapes and the shared truncation-marker text on the Python side.

- **fd 3, not stdout** — Node pins the channel positionally with `stdio: ['pipe','pipe','pipe','pipe']`; the Python bootstrap reads the same `PROTOCOL_FD` constant. JSON-lines framing.
- **Host treats every inbound frame as hostile** — model code has full access to fd 3 and can post anything through it, so `validateChildFrame` shape-validates and REBUILDS each frame before the host reads it: forged extra fields never ride along, a non-number call id can never be echoed into a reply, and junk drops to `undefined` rather than throwing in the host's message handler. The Python side trusts host replies (the host is not model-controlled).
- **Lossless-JSON crossing** — completion values and binding arguments cross as exact JSON. `encodeJsonPlain` serializes a `JSON.parse`-produced value without recursion, so a deep value below the byte budget crosses intact instead of dying on `JSON.stringify`'s stack limit; `checkDoneValue` meters a forged completion value's byte length AND number losslessness in one traversal that rejects an over-budget payload before the incremental work it would add (the enqueued children; strings and keys are metered by a non-allocating escaped-size scan, so the escaped copy is never materialized) — the frame's own width is already parsed and capped upstream by the host's fd-3 receive buffer, not re-bounded here; `hasUnsafeIntegerToken` reads the raw frame text to catch an integer token that `JSON.parse` would silently round; `hasNonLosslessNumber` rejects a non-finite or negative-zero number in unbounded `call.args`. Beyond-safe-range integral doubles serialize through `BigInt` digits so the exact integer crosses, not the rounded `String()` form.
- **Shared truncation marker** — `logTruncationMarker(maxBytes)` produces byte-identical text on both sides, so a truncated log run reads the same however the cap was hit. The `log` frame's `truncated` flag distinguishes the child ledger's own marker from program output.

<a id="model-experience"></a>
## Model Experience

None, as this protocol-only package validates and exports fd-3 frames without executing code or rendering model-facing results.

#### KV Cache effect

This package adds no model request content, so it does not affect provider cache reuse.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **The cross-language guard covers the runtime-executed surfaces and the frame field shapes** — `tests/protocol-mirror.e2e.ts` spawns a real `python3` and asserts, against `src/protocol.ts`, both `PROTOCOL_FD` / the log truncation marker text AND each `TypedDict`'s required/optional wire field set in `py/protocol.py`. What it does not compare is the field *types* (e.g. that `cpuSeconds` is an `int` on both sides): comparing type declarations across TypeScript and Python has no mechanical equivalent here, so a type-level drift is still caught by review plus the backend's real-subprocess suite rather than this package's tests.
- **`src/index.ts` exports the protocol vocabulary only** — the package carries no subprocess execution path and no Python-side JSON codec, so nothing here spawns `python3` outside the mirror test.

No runtime invariant companion is published because the fd-3 protocol is a codec validated by its TypeScript and Python tests rather than a live event-to-state relationship.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
