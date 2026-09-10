# Agent Note: Desktop proxy candidates and Workspace input feedback

Status: proposed

English | [中文](2026-09-10-desktop-proxy-workspace-input-repair.zh.md)

## Problem

Electron returned `SOCKS5`, `SOCKS`, then explicit `DIRECT` for the production Platform origin during a Desktop GitHub login. The Desktop parser rejected the first unsupported directive and never reached the explicit route, so Platform Account login stopped before browser authorization. Workspace Settings also treated a Chinese comma as part of one function tag and mapped stable Project Membership failures omitted from its local table to generic copy.

The proxy repair must preserve host network policy. An unsupported carrier does not authorize an implicit direct connection, while a later `DIRECT`, `PROXY`, or `HTTPS` directive is already part of the ordered result selected by Electron. Membership diagnostics are public stable codes, but their server messages and IPC wrappers are not user copy.

## Proposal

Desktop system-network parsing skips unsupported candidates while it searches the same ordered Electron result for `PROXY`, `HTTPS`, or explicit `DIRECT`. An all-unsupported non-empty result remains an error. An empty resolution retains the existing direct result, and malformed or credential-bearing supported proxy directives still fail immediately. The implementation does not add a SOCKS carrier or alter the operating-system proxy.

Workspace Settings splits function tags on English and Chinese commas, trims each value, and removes empty values before calling the existing membership gateway. The UI maps the complete `ProjectMembershipErrorCode` union to short Chinese and English copy and retains generic copy for unknown failures. Service-owned count, length, uniqueness, role, and object-existence checks remain authoritative.

The frozen UI reference is `packages/client/ui-workspace/src/client/WorkspaceSettings.tsx` at `005b49be715eb82826de65a06d1a9686c5577e39`; the repair changes parsing and feedback without changing layout. The experience route is Workspace row menu → Workspace Settings → edit one member's function tags with `triage，qa` → Enter or blur, plus create or member actions that return a stable membership failure.

## Alternatives considered

**Fall back to direct when no supported candidate remains.** Rejected because an unsupported PAC result does not grant permission to bypass the host-selected proxy policy.

**Add SOCKS transport support.** Rejected because the observed result already supplies explicit `DIRECT`, and a new carrier dependency and authentication policy are outside this repair.

**Display the server diagnostic.** Rejected because IPC wrappers and server text may contain implementation details; the stable error code is sufficient to select safe user copy.

**Duplicate membership validation in the client.** Rejected because Project Membership owns tag and project constraints. Client parsing only separates entered values.

## Acceptance criteria

- `SOCKS5; SOCKS; DIRECT` yields only the explicit direct candidate, while an unsupported directive followed by `PROXY` or `HTTPS` preserves the supported candidate and order.
- A non-empty result containing only unsupported directives fails visibly. Invalid or credential-bearing supported proxy directives remain rejected.
- The production Desktop login no longer stops on the observed `SOCKS5` directive and can proceed through its explicit `DIRECT` candidate.
- English and Chinese comma inputs submit the same trimmed function tag list without empty entries.
- Every stable Project Membership error code maps to localized safe copy; unknown failures use generic copy.
- Focused Desktop network and Workspace Settings tests pass. Product-path login and Workspace Settings acceptance run from the integrated specification head.

## Risks

Skipping an unsupported directive can hide its carrier-specific failure, so the parser must retain a visible error when no supported candidate follows. Error-code substring matching must prefer exact stable code tokens so one code cannot be mistaken for another. The final acceptance must distinguish parser success from completed OAuth and must not claim the host proxy changed.
