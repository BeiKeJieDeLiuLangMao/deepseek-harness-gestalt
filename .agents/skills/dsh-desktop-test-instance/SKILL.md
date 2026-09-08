---
name: dsh-desktop-test-instance
description: "Start, replace, or clean one isolated Desktop test Electron. Use when the user asks to 启动测试程序, open a test Electron, prepare an acceptance instance, or clean leftover test processes, and when an agent-run Desktop instance needs a model call."
---

# Desktop test instance

Own one isolated Desktop Electron per user goal. Automated lanes such as `pnpm --dir apps/desktop test:e2e-sub2api` keep their own teardown; this skill covers agent-started instances the runner does not own.

## Steps

1. **Read the memo.** Open `.agents/local/runtime-memo.json` if it exists. Treat its `goal`, `desktop`, and `ego` records as the live inventory for this goal. Complete when the file is parsed or confirmed absent.

2. **Stop the recorded instance first.** If `desktop` names a live Electron, Web Host, PostgreSQL, sidecar, CDP port, scratch root, `DSH_HOME`, or user-data directory, stop those exact PIDs and then remove those exact paths. Kill by recorded PID and path only. Complete when `ps` / `lsof` show those PIDs and ports gone and the recorded directories are absent.

3. **Refuse a second instance.** Scan for other Desktop test processes that still belong to this goal (same scratch root, same memoed `DSH_HOME`, or the same ticket/PR Electron). Stop them before creating a replacement. Complete when this goal has zero live test Electron / Host / PostgreSQL / sidecar processes.

4. **Choose the least disruptive computer-use mode.** Product GUI self-test, bug reproduction, prototype checks, fidelity comparison, and the experience-route walk use an existing or authorized Codex session that has callable computer-use tools; a Codex model or provider name without those tools is insufficient and does not authorize creating a user-owned task. Prefer background control of the exact isolated application, then an existing headless route, and use headed foreground control only when a required product surface cannot run through either earlier mode. Treat support as proven only after the selected mode captures the actual application, sends harmless user-level input, and observes the resulting UI without direct DOM or Electron IPC scripting. An unknown mode gets one bounded capability probe. A missing bridge marks that mode unavailable for the scenario; try the next mode without substituting scripted E2E, and do not expand the delivery to build a bridge unless its accepted scope includes that infrastructure. Report a blocker only if no mode can cover the required surface. Complete when the candidate mode and probe plan are recorded.

5. **Choose the operated Platform config from the scenario.** Desktop `build-main.mjs` requires `DSH_DESKTOP_OPERATED_PLATFORM_CONFIG` or an argv path; `pnpm gestalt:dev` does not supply one. Pick the config before launch:

   - Use `apps/desktop/tests/fixtures/operated-platform.json` when the run does not exercise live Platform Account, Relay, OAuth, or a changed Platform contract. Smoke, Sub2API account-pool UI, and in-page mock prototypes use this fixture.
   - Generate a production identity with `apps/desktop/scripts/write-operated-platform-config.mjs` from the GitHub Environment fields only when this run must talk to the operated Platform or the diff changes Platform identity, callback, Relay, or companion-attachment fields.

   Record the chosen path in the memo. Do not wait for the user to ask for a login. Complete when the chosen file exists and matches that rule.

6. **Create a fresh scratch and copy model configuration only when required.** Make a new `0700` scratch root with `dsh-home` and `electron-user-data`. A keyless UI probe copies no provider configuration. When the accepted scenario requires a real model call and the user explicitly authorized it, blind-copy only `settings.yaml` and `.credentials.yaml` from the normal DSH Home, following `copyModelConfiguration` in `scripts/web-acceptance.ts`: regular files, no symlinks, target mode `0600`. Copy no session, workspace, browser, or Ego state. Do not invent provider models. Missing authorization or either file blocks only the real-model scenario, not a keyless control-path probe. Complete when the scratch exists and every copied file is owner-only.

7. **Start exactly one instance and prove its control path.** Launch Desktop against that scratch `DSH_HOME` and user-data, passing the chosen Platform config into `build-main.mjs`. Record the application path, served revision, every live PID, port, directory, Platform config path, selected mode, and active desktop-input owner in `.agents/local/runtime-memo.json` without secrets. On macOS, target the unique test `.app` by its absolute path when the available computer-use integration supports that selector; a shared bundle identifier is ambiguous when several builds run. Before acceptance work, capture its actual pixels and accessibility state, perform one harmless user-level action, verify the visible result, and for background mode confirm the user's foreground application did not change. Headless or virtual-display execution qualifies only when the current integration proves the same screenshot-input-result loop for this exact instance. Complete when one instance is up, one session owns its input, and the memo matches the verified control path.

8. **Clear the memo on teardown.** After the user finishes, the HEAD changes, the run fails, or a replacement is required, stop the recorded processes, delete the scratch root, and remove or empty the `desktop` record. Complete when the next read of the memo cannot name a live instance.

## Display

| Request | Mode |
|---|---|
| Product GUI validation on macOS when exact-app capture and input preserve the user's foreground application | `background` |
| Product GUI validation when an existing headless or virtual-display route proves exact-app screenshot, input, and result | `headless` |
| Required native surface unavailable through background and headless computer use | `headed`, with the fallback reason and foreground duration minimized |
| Ask the user to review a draft or product after the agent completed the route | hand off the verified isolated instance |

Every mode uses the scratch home. Background means the application is controlled without taking over the foreground; it does not mean headless. Never point a test instance at the user's normal `DSH_HOME`.

## Model provider

A test instance that calls a model uses the provider catalog already stored in the normal DSH Home. The authorized copy in step 6 is that catalog. Do not add fallback models, edit `route.models`, or point the instance at a fixture provider unless the user names that substitute.

Print no secret values. Record only provider and model reference names in logs, memos, and pull-request text.

## Runtime memo

`.agents/local/runtime-memo.json` is gitignored local state for this checkout. One file serves Desktop instances and the ego-browser task space for the same goal.

```json
{
  "goal": "445-sub2api",
  "desktop": {
    "mode": "background",
    "appPath": "/absolute/path/to/isolated/DeepSeek Gestalt.app",
    "revision": "0123456789abcdef",
    "inputOwner": "acceptance-environment",
    "pid": 12345,
    "hostPid": 12346,
    "postgresPids": [12347],
    "cdpPort": 9222,
    "scratchRoot": "/tmp/dsh-desktop-445",
    "dshHome": "/tmp/dsh-desktop-445/dsh-home",
    "userData": "/tmp/dsh-desktop-445/electron-user-data",
    "operatedPlatformConfig": "apps/desktop/tests/fixtures/operated-platform.json"
  },
  "ego": {
    "profile": "DSH",
    "taskSpaceId": 12,
    "taskSpaceName": "445-sub2api"
  }
}
```

Write only identifiers and paths. If the memo names a process or space that no longer exists, delete that record and continue from a clean inventory.

## Cleanup

Stop recorded PIDs, then verify. Do not use a command-line substring kill that can match the shell running the cleanup. After stop, confirm:

- the Electron, Web Host, PostgreSQL, and sidecar PIDs are gone;
- the CDP port is closed;
- the scratch root, `DSH_HOME`, and user-data directories are gone;
- on macOS, PostgreSQL SysV shared-memory segments whose `CPID`/`LPID` match the recorded PIDs are gone.

The Sub2API Electron runner already fails if those survivors remain; agent-started instances use the same completion bar.

Scripted unit, protocol, snapshot, and Electron CI lanes retain their existing runners and complement this product GUI evidence; they do not replace a Codex computer-use walk through the actual native route. GIF recording still follows [record-browser-gif](../record-browser-gif/SKILL.md). Web-only browser automation follows [ego-browser](../ego-browser/SKILL.md), which reads and writes the `ego` record in this memo. UI prototypes follow [prototype/UI.md](../prototype/UI.md). Fidelity comparison and the dedicated acceptance walk follow [the fidelity-and-acceptance-route decision](../../notes/implemented/process/2026-09-03-ui-fidelity-and-acceptance-route.md) and use this skill for one isolated instance per goal.
