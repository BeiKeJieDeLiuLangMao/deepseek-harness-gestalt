# Agent Note: Ensure the selected iOS agent during Host mint

Status: implemented

English | [中文](2026-09-03-phone-ios-real-mint-autoinstall.zh.md)

## Problem

Opening an online iOS panel mints `POST /phone/session` first. A missing real-device agent blocked the picture before GUI recovery could run. A simulator mint skipped agent status entirely, so an arbitrary selected simulator could receive a session even when mobilecli had prepared an agent only for another simulator.

## Decision

Host mint owns the first recoverable install for the exact listed iOS target. `POST /phone/session` runs `agentStatus`; when the real-device or simulator agent is absent it calls idempotent `installAgent` without `force`, re-checks the same device, and mints only after that status reports installed. The route passes one transaction abort signal through all three calls. Simulator installation carries no provisioning profile; real-device installation uses the profile selected by `phone-runtime`. `PHONE_AGENT_MISSING` remains only when the install still leaves the selected agent absent. Thrown install failures keep their existing Host mapping: `PHONE_AGENT_PROFILE_REQUIRED` (including a Host that has no `provisioningProfilePath` for a real device), `PHONE_REAL_DEVICE_ISSUE` arms, and `INSTALL_FAILED_USER_RESTRICTED` via `PHONE_UPSTREAM`. Successful iOS sessions carry `agentManaged: true`; `recoverAgent` stays the GUI path for leftover missing, force-reinstall, and restricted failures. Android mint does not run this iOS ensure sequence.

## Alternatives considered

**Install from the GUI error card only.** Rejected: opening the panel always mints first, so `PHONE_AGENT_MISSING` remains the first user-visible failure even when recovery is possible.

**Always `force` reinstall on mint.** Rejected: mint must be idempotent for an already-installed agent; force-reinstall is an explicit recovery action.

**Skip install when `provisioningProfilePath` is unset.** Rejected: a missing profile is `PHONE_AGENT_PROFILE_REQUIRED`, not a silent skip.

**Rely on simulator preparation.** Rejected: preparation can own one configured simulator, while the device picker can select another online simulator by id.

## Consequences

Any trusted mint caller, not only the GUI, gets a recoverable missing-agent install for its selected iOS id. Unrecoverable failures stay structured and do not mint. Request cancellation interrupts status or installation instead of waiting for the mobilecli child ceiling. Package tests pin selected-id status → install → re-check → 200, shared transaction cancellation, install-failure codes, leftover `PHONE_AGENT_MISSING` for both iOS device kinds, simulator MJPEG, and the Android path without iOS ensure calls.
