# Agent Note: Browser Profile settings management

Status: implemented

English | [中文](2026-09-08-browser-profile-settings-management.zh.md)

## Problem

The Browser settings section presented every identity as a stacked radio, kept every Profile name in an editable input, and placed Profile creation inline beneath the roster. The resulting form was sparse, made the common read state look editable, and left the add draft in the page layout.

## Decision

Default identity uses one compact selection card. Named persistent Profiles use display rows with explicit rename and remove actions. Profile creation uses the shared `Modal`, `Input`, and `Button` primitives; every close path clears the draft and restores focus to the Add Profile trigger. Escape closes only the creation dialog while the parent Settings page remains open.

The settings store continues to own the roster and default identity. Renaming the selected persistent Profile follows that default, removing it clears the default, and the persistent-name selector remains inside the identity card. No settings schema or Browser Profile partition semantics change.

## Alternatives considered

**Restyle the existing inline controls.** Rejected because permanent text inputs still present the roster as an edit form and creation still occupies page space when unused.

**Change the shared Modal Escape behavior.** Rejected because this nested dialog alone must retain the parent Settings page; other Modal owners have independent parent-layer behavior.

## Consequences

The section is compact in its read state, while add and rename remain explicit keyboard-accessible flows. The Browser owner carries small local draft and focus state. Component tests cover add success, cancellation, nested Escape, validation, explicit rename, and removal; the settings-owner test covers durable roster and default-persistent updates.
