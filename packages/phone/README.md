---
description: "The phone package group: Host toolchain preparation, mobilecli device runtime, capture proxy, and model-facing tools."
kind: "package-group"
---

# phone/ — Phone device fleet capability family

English | [中文](README.zh.md)

## Summary

Connect DeepSeek Harness to Android and iOS devices through mobilecli. Use these packages to prepare Host toolchains, discover devices, proxy screen and control traffic, and expose deferred model tools. One Host service owns the mobilecli process and device list; GUI and model consumers evolve separately.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The phone device fleet over the external mobilecli binary: one Host-half Service owns the loopback server child process, health polling, and the unified device listing; model- or GUI-facing Consumers evolve in their own packages.

| Package | Role | ctx key |
|---|---|---|
| [`phone-environment/`](phone-environment/README.md) | Host toolchain detection and trusted managed mobilecli preparation | `ctx.phoneEnvironment` |
| [`phone-environment-android/`](phone-environment-android/README.md) | Android SDK, API 35 image, and default AVD preparation Provider | registers into `ctx.phoneEnvironment` |
| [`phone-environment-ios/`](phone-environment-ios/README.md) | Xcode iOS Runtime and default iPhone Simulator preparation Provider | registers into `ctx.phoneEnvironment` |
| [`phone-runtime/`](phone-runtime/README.md) | mobilecli Provider and Service Definition, folded | `ctx.phoneDevices` |
| [`phone-stream/`](phone-stream/README.md) | same-origin IO WebSocket and signed MJPEG/H264 reverse-proxy | `ctx.phoneStream` |
| [`tool-phone/`](tool-phone/README.md) | Deferred model-facing Consumer | registers on `ctx.tools` |

<a id="related-documentation"></a>
## Related documentation

The subsystem reference is [docs/subsystems/phone-runtime.md](../../docs/subsystems/phone-runtime.md).

<a id="dev-note"></a>
## Dev Note

None.
