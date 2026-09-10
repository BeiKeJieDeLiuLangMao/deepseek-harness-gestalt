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

4. **Use native background computer use on macOS.** When the route selects Codex computer use, first establish its level through [CUA availability evidence](CUA-AVAILABILITY.md). Product GUI self-test, bug reproduction, prototype checks, fidelity comparison, and the experience-route walk use an existing or authorized Codex session that has callable computer-use tools; a Codex model or provider name without those tools is insufficient and does not authorize creating a user-owned task. This workflow uses only the verified macOS launch and control path in step 7. Another driver or execution mode requires an explicit user scope change; never switch automatically. If the target application or requested scene fails, keep diagnosis with the same owner, record the exact cause, and report the blocker. Complete when the computer-use executor and exact target application are identified.

5. **Choose the operated Platform config from the scenario.** Desktop `build-main.mjs` requires `DSH_DESKTOP_OPERATED_PLATFORM_CONFIG` or an argv path; `pnpm gestalt:dev` does not supply one. Pick the config before launch:

   - Use `apps/desktop/tests/fixtures/operated-platform.json` when the run does not exercise live Platform Account, Relay, OAuth, or a changed Platform contract. Smoke, Sub2API account-pool UI, and in-page mock prototypes use this fixture.
   - Generate a production identity with `apps/desktop/scripts/write-operated-platform-config.mjs` from the GitHub Environment fields only when this run must talk to the operated Platform or the diff changes Platform identity, callback, Relay, or companion-attachment fields.

   Record the chosen path in the memo. Do not wait for the user to ask for a login. Complete when the chosen file exists and matches that rule.

6. **Create a fresh scratch and copy model configuration only when required.** Make a new `0700` scratch root with `dsh-home` and `electron-user-data`. A keyless UI run copies no provider configuration. When the accepted scenario requires a real model call and the user explicitly authorized it, blind-copy only `settings.yaml` and `.credentials.yaml` from the normal DSH Home, following `copyModelConfiguration` in `scripts/web-acceptance.ts`: regular files, no symlinks, target mode `0600`. Copy no session, workspace, browser, or Ego state. Do not invent provider models. Missing authorization or either file blocks only the real-model scenario. Complete when the scratch exists and every copied file is owner-only.

7. **Start exactly one background instance with a credential-safe environment and test the requested route.** For the initial launch and every relaunch, build the child environment with [`credentialSafeEnvironment(process.env)`](../../../apps/desktop/scripts/artifact-secret-safety.mjs), then add only the scenario's named inputs, including the scratch `DSH_HOME` and chosen `DSH_DESKTOP_OPERATED_PLATFORM_CONFIG`; pass Electron user-data through its explicit argument. Before spawn, require every credential-like name in the constructed environment to belong to the scenario's explicit credential-name allowlist. When the host already provides process inspection that can filter before output, also check the environment-variable names on the actual Electron Main and Web Host PIDs; otherwise record that process check as `unknown` with the reason. Stop the instance if the constructed environment or either observed process carries an unexpected credential-like name, and do not display or record environment values. Make a byte-identical copy of the target `.app` at a unique absolute path and preserve any existing signature; do not rewrite its bundle metadata or re-sign it merely to create a computer-use identity. Spawn `open` from the constructed environment with `open -g -j -n -a "$appPath" --env "DSH_HOME=$scratchDshHome" --args "--user-data-dir=$scratchUserData"`, then target the same absolute path in computer use. Keep `-j`: `-g` alone brings DSH to the foreground. Match the application to its revision, process, Host URL, and fresh state; capture its actual pixels and accessibility state; drive the requested route through user-level input; verify every observable result; and confirm the foreground application remains unchanged. Record the application path, served revision, every live PID, port, directory, Platform config path, explicitly added environment-variable name, environment-check result, and active desktop-input owner in `.agents/local/runtime-memo.json` without secrets. [The Desktop test-instance decision](../../notes/implemented/process/2026-09-02-desktop-test-instance-and-runtime-memo.md) records the reference proof and its limits; each target build must establish its own identity, background behavior, and requested route. If any required step fails, diagnose and report it without changing modes. Complete when one instance is up, one session owns its input, the constructed environment passed, each process check passed or is truthfully `unknown` where inspection is unavailable, the requested route has a recorded verdict, and the memo matches the tested application.

8. **Report evidence before product acceptance.** After the complete background experience route passes, freeze the reviewed build identity and prepare one user-facing report before handoff:

   - State the evidence lane first — packaged product, source or development run, real device or service, simulator, or fixture — and name what that lane proves. Give the exact source commit, build mode, served origin, Main and Web Host PIDs and ports, scratch paths, scenario source, model-run condition, and every fixture, mock, source override, or credential import. For a packaged run, give the application path and package identity; for a source or development run, give the launch command and source identity. Include only facts the run provides, identify each device source, and recheck live process and port facts immediately before reporting.
   - Link the real product-path E2E screenshots and the verified local GIF. Capture the actual application window through computer use, list those screenshot paths, and reuse the encoder and artifact-verification steps from [record-browser-gif](../record-browser-gif/SKILL.md). Before cleaning the scratch instance, retain the screenshots, GIF, and command logs in a gitignored artifact directory outside the scratch root. Publish only when the GIF workflow's pull-request condition applies.
   - Give the exact TDD RED and GREEN commands, exit results, log paths, and observed failing or passing behavior; follow [tdd](../tdd/SKILL.md) for the development loop. If the original pre-fix RED was not recorded, state that it is missing. Label a post-fix reproduction as a replay rather than development-time RED evidence.
   - Use [show-me](../show-me/SKILL.md) for a concise, readable diff tied to the same source state. The explanation supplements the screenshots and GIF; it does not replace them.
   - Give reproducible user acceptance steps with the starting state, each action, and its expected visible result.

   Complete when every retained artifact and instruction is still readable, carries truthful provenance, and matches the frozen build. Then give the user the report, route, exact application path, and starting state. After review, record the observed UI-route result separately from teardown results so a passing interaction cannot hide a failed shutdown.

9. **Clear the memo on teardown.** After the user finishes, the HEAD changes, the run fails, or a replacement is required, stop the recorded processes, delete the scratch root, and remove or empty the `desktop` record. Complete when the next read of the memo cannot name a live instance.

## Display

| Request | Mode |
|---|---|
| Native product GUI validation on macOS | `background` through the exact launch and computer-use path above |
| Ask the user to review a draft or product after the agent completed the route | hand off the verified isolated instance |

The background application is hidden while computer use operates its real native GUI; it is not headless. Never point a test instance at the user's normal `DSH_HOME`.

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
    "explicitEnvironmentNames": ["DSH_HOME", "DSH_DESKTOP_OPERATED_PLATFORM_CONFIG"],
    "constructedEnvironment": "passed",
    "processEnvironment": "unknown: name-only inspection unavailable",
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

When freeing operated-Platform Mobile installation quota, drive the already-signed-in product Desktop Installation. Do not mint a new Desktop Installation for cleanup; that consumes a separate desktop quota. Isolated test instances still must not use the user's normal `DSH_HOME`. If the installed Desktop build lacks the Mobile-installation Settings UI, a source Desktop at the specification SHA may reuse the normal Electron `--user-data-dir` (`~/Library/Application Support/DeepSeek Gestalt` on macOS) without copying `DSH_HOME` or creating a new user-data directory. Revoke only by full opaque Installation ids.

The Sub2API Electron runner already fails if those survivors remain; agent-started instances use the same completion bar.

Scripted unit, protocol, snapshot, and Electron CI lanes retain their existing runners and complement this product GUI evidence; they do not replace a Codex computer-use walk through the actual native route. GIF recording still follows [record-browser-gif](../record-browser-gif/SKILL.md). Web-only browser automation follows [ego-browser](../ego-browser/SKILL.md), which reads and writes the `ego` record in this memo. UI prototypes follow [prototype/UI.md](../prototype/UI.md). Fidelity comparison and the dedicated acceptance walk follow [the fidelity-and-acceptance-route decision](../../notes/implemented/process/2026-09-03-ui-fidelity-and-acceptance-route.md) and use this skill for one isolated instance per goal.
