---
description: "Xcode runtime and managed iPhone Simulator preparation for configuring or debugging mobilecli-backed iOS devices."
kind: "package-reference"
---

# @deepseek-ai/dsh-phone-environment-ios

English | [中文](README.zh.md)

## Summary

Prepare and boot the product-owned iPhone Simulator through a complete Xcode installation on macOS. It detects Xcode, licenses, first-launch status, runtimes, device types, and existing Simulators, while Windows and Linux report a stable unavailable state. Xcode installation, licenses, Apple ID, permissions, device trust, Developer Mode, and signing stay manual.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

macOS platform Provider for `ctx.phoneEnvironment`. It reads the Host `process.platform`, the selected complete Xcode application, Xcode license and first-launch status, available iOS Simulator runtimes, iPhone device types, and Simulator inventory. Windows and Linux return a stable unavailable state without spawning an iOS command; iOS Simulator and iPhone control require macOS with Xcode.

Preparation is available only after the user installs or updates the complete Xcode application, accepts its license, and finishes first-launch components in Xcode. The Provider can run `xcodebuild -downloadPlatform iOS`, create the product-owned `DSH Gestalt iPhone` through `simctl`, and boot it. Xcode installation or update, Apple license acceptance, first-launch authorization, Apple ID, system permissions, real-device unlock and trust, Developer Mode, signing identity, and provisioning profiles remain manual requirements. Product UI calls the mobile component a device-control agent and does not promise one upstream implementation.

The Provider owns one command sequence before its first notification. Cancellation uses bounded SIGTERM/SIGKILL process-tree termination and restores the last actionable state; timeout, signal, exit code, termination failure, and output overflow remain distinct failure facts. Disable or teardown waits for the active sequence and shuts down only a Simulator successfully booted by this Provider, retaining ownership until shutdown succeeds; an already-running user Simulator remains running and user-owned. Cross-process `simctl` JSON is retained up to an explicit one-megabyte ceiling and validated before it becomes a platform state.

Preparation failures use stable `PHONE_IOS_*` codes for unsupported Hosts, missing or incomplete Xcode, license and first-launch requirements, runtime download, Simulator creation or boot, invalid command output, cancellation, and process failures. The Host projects them through the full revisioned `/phone/environment` snapshot.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the fleet consumed by `dsh-tool-phone`. A running iOS environment restarts the selected mobilecli generation, requires that generation to list the exact Simulator online, and verifies a recognizable MJPEG/JPEG picture before publishing platform readiness to Settings. mobilecli does not offer H264 for iOS Simulator; the GUI displays the actual MJPEG format through the shared real-stream fallback. Model tool registration follows enabled fleet runtime readiness rather than this picture probe, and each tool invocation resolves devices from the live fleet list.

#### KV Cache effect

None until `dsh-tool-phone` exposes deferred phone schemas to a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Xcode and Apple platform assets remain Apple-controlled installations and downloads; Desktop does not bundle or rehost them.
- Apple license, first-launch authorization, Apple ID, system permissions, physical-device trust, Developer Mode, signing identity, and provisioning profiles require the user.
- The final release acceptance requires a real runtime download, Simulator boot, recognizable picture, GUI control, and real-model `device_act`; fixture evidence does not satisfy it.

<a id="dev-note"></a>
### Dev Note

None.
