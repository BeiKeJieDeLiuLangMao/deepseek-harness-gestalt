# Agent Note: IM account, workspace, and Sidebar GUI

Status: implemented

English | [中文](2026-09-10-im-account-workspace-sidebar-gui.zh.md)

## Problem

Account takeover needs the accepted GUI: Settings → IM Accounts, Workspace Settings cards for takeover and simulation, and a Better Sidebar conversation view. The workspace settings modal previously had no extension slot, so takeover and simulation could not land beside repository and collaboration without a second window. The GUI must not invent a separate operations board or show secrets.

## Decision

`@deepseek-ai/dsh-client-ui-im` registers Settings section `im-accounts`, workspace cards `im-takeover` and `im-simulation`, and official Sidebar tab `@deepseek-ai/dsh-client-ui-im/conversation`. `ui-workspace` declares `workspace.settings.section` as a list child of `sidebar.workspaces` and the settings modal renders those cards after the membership body. New takeover rules start disabled. Disabling a specific rule keeps the binding and does not fall back to All. Simulation tools stay unavailable until the workspace selects a configured target. Sender badges cover `external` / `ai_outbound` / `human_native` / `human_dsh` / `unknown`. `result_unknown` is not presented as sent. Manual send remains available when automatic handling is off. Native approval remains the only approval surface.

## Alternatives considered

**A separate IM operations board.** Rejected because the specification keeps native approval as the only approval surface and forbids a parallel ops page.

**Hard-code takeover and simulation into `WorkspaceSettings.tsx`.** Rejected because other features would then fork the modal; a list slot keeps the membership body closed.

**Host remotes for every account and delivery mutation in this ticket.** Rejected because T7 owns the accepted surfaces and focused client tests against prototype states; live account reads and outbound delivery stay behind later authorization.

## Consequences

The three surfaces share one in-memory GUI snapshot seeded from the accepted prototype. Feishu is absent. Secrets mint a credential reference and never enter the snapshot. Focused client tests cover route editing, simulation target selection, sender badges, delivery states, manual send, both-session navigation, and the headless experience route.
