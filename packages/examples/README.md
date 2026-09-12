---
description: "Runnable example packages for readers choosing assembled process paths that exercise DeepSeek Harness capabilities outside package-local tests."
kind: "package-group"
---

# examples/ — Runnable assembled application examples

English | [中文](README.zh.md)

## Summary

These packages provide runnable entry paths for assembled DeepSeek Harness examples. Use them to execute a concrete Cordis composition through a shipped artifact and inspect its process output. Each package owns one executable path; the capability packages own the runtime behavior it assembles. Leaf configurations under repository `examples/` choose the concrete composition.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The group exposes one process entry for the phone capture wire.

| Package | Role |
|---|---|
| [`phone-capture-wire-demo/`](phone-capture-wire-demo/README.md) | Boots an external Cordis config through the shipped bin and emits the keyless Android capture-source Host transcript |

<a id="related-documentation"></a>
## Related documentation

- [Phone Runtime subsystem](../../docs/subsystems/phone-runtime.md) — Defines the device-fleet runtime, capture stream, and ownership used by the demo.

<a id="dev-note"></a>
## Dev Note

None.
