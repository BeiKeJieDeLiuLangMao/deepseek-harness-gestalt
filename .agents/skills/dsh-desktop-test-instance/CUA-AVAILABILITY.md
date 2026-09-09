# Codex CUA availability evidence

Use this reference when a Desktop route selects Codex computer use. It establishes the evidence lane before the isolated Electron lifecycle in [`SKILL.md`](SKILL.md).

## Evidence levels

Record the highest independently observed level. A level does not imply any later level.

| Level | Completion condition |
| --- | --- |
| `configured` | An enabled CUA server entry supplies its non-secret transport settings. |
| `connected` | The selected official MCP client connects and obtains the server's tool directory. |
| `registered` | The selected client registers the dynamically discovered tools for the session. |
| `native-callable` | A formal Codex agent or app-server turn supplies real turn metadata, and the first service-directed read-only call succeeds. |
| `background-accepted` | That callable CUA session completes the requested user-level route in the isolated Electron and records the route result. |

A configured entry, an MCP connection, a tool directory, or kernel startup does not establish native control. Record the actual directory for the run; do not require a fixed tool list. Call `js`, reset, or any other tool only as the current service instructions direct.

## Connection and call discipline

Discover only enabled configuration and non-secret transport parameters. Never print, copy, parse-display, or persist credential values, private session logs, or environment values. Evidence may name explicit environment keys, error categories, run-owned PIDs, and cleanup results.

Use an official MCP client or the formal Codex execution entry appropriate to the environment. A client that shares an installed DSH dependency graph can diagnose DSH registration without creating a second Cordis instance; it does not exclude other official clients or Codex entry points.

`native-callable` requires `session_id` and `turn_id` issued by the formal Codex agent or app-server turn manager. Do not invent, replay, or randomly supply either field. Follow the service's returned first-call instructions exactly; do not guess an API. The first successful call provides only the state it returns, not acceptance of an application route.

## Failure handling

| Observation | Result |
| --- | --- |
| Approval is disabled or a request is denied by the current sandbox | Stop this CUA path and report the denial for the current scope. |
| Nested sandbox setup fails | Report the sandbox failure; do not change parameters or execution mode to evade it. |
| Required Codex turn metadata is absent | Report `registered` at most; a connected MCP server is not a formal Codex turn. |
| The user explicitly changes runtime or permission scope | Re-evaluate this run in the new scope. Keep earlier scope evidence labeled to that scope. |

Dispose only processes started by this run, then verify their recorded PIDs have exited. Never target processes by a broad name or command-line match.

## Evidence choice

Without `native-callable`, report the highest proved level and the diagnostic. Do not create a new user task merely to obtain a turn. If the user explicitly authorizes a real isolated Electron automation fallback, use it through the lifecycle in [`SKILL.md`](SKILL.md), state its driver, and keep its evidence distinct from Codex computer use. A web page, fixture, or MCP registration does not establish a Desktop acceptance route.
