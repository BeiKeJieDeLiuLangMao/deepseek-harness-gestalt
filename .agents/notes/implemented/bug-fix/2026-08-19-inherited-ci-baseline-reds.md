# Agent Note: Repair the inherited baseline CI reds

Status: implemented

English | [中文](2026-08-19-inherited-ci-baseline-reds.zh.md)

## Problem

The delivery baseline carried four independent red lanes that no open pull request caused. First, both lanes that execute the coverage inventory — Linux coverage and native Windows — checked out with the default depth-1 fetch, so the Desktop release-notes test could not resolve its pinned manifest range through the Git graph and failed deterministically on every fresh hosted runner. Second, the Web browser replay suite failed across dozens of scenarios: the recorded aria goldens predated the composer image-intake button, two scroll-contract streams were short enough to exhaust before a loaded CI runner reached the growth assertion, the Desktop chrome scenario's `window.dshDesktop` mock no longer covered the preload surface the Desktop UI plugin binds, and the Models settings section listed only `configured` provider rows — which, after the whole-section occupancy change, made the unkeyed DeepSeek route vanish together with its first-run setup card. The same snapshots-and-artifacts lane also replayed a translation-prompt snapshot that still expected the upstream "DeepSeek Harness" README title, and the two-instance-relay example in `DSH_EXAMPLE_MODE=lib` mapped every provider `RemoteRelayError` to `RELAY_ATTACHMENT_REJECTED` because tsdown emitted a second constructor inside `relay-provider.js`. Third, four Desktop tests asserted POSIX path and mode spellings that cannot hold on a Windows host, and one subagent teardown test relied on the one-second `vi.waitFor` default for an asynchronous settlement warning. The aggregate `all checks passed` lane is those four required checks.

## Decision

**Coverage lanes fetch full history.** Every `ci.yml` lane that runs an aggregate containing the coverage gates checks out with `fetch-depth: 0`, and a workflow contract test enumerates those lanes by their run commands and rejects a shallow checkout, so a new coverage lane cannot reintroduce the failure. The release-notes CLI stays offline: verification keeps reading the local Git graph.

**Fixtures follow the product; behavior bugs get fixed.** The composer image-intake button is shipped product surface, so the goldens were re-recorded through the sanctioned refresh mode and the diff was reviewed line by line. The two ungated scroll-contract streams grew from 120/240 to 960 paced chunks so the stream outlives the slowest CI interaction gap instead of relying on wall-clock luck. The Desktop chrome mock now implements the complete `DesktopBridge` preload surface with inert `unavailable` account and pairing snapshots. The Models section again lists every mounted whole-section provider — as the open setup card in the first-run posture and as a plain row otherwise — because `configured` now means the user layer occupies the section, which is false exactly when the first-run card must render.

**Desktop tests assert platform semantics.** Icon and runtime-path expectations compute joined paths for the host and expect `node.exe` on Windows; the copy-tree test compares resolved link referents rather than one platform's `readlink` spelling; owner-only mode is asserted only where the platform exposes POSIX mode bits. The teardown-failure observation window widened to the ten seconds its sibling assertions already use.

**Built Relay shares the public error constructor.** The host-only provider imports `RemoteRelayError` from `@deepseek-ai/dsh-remote-access`, and that provider tsdown entry lists the package in `deps.neverBundle`, so the WSS Consumer's `instanceof` check and the provider throw the same class. The translation-prompt snapshot is refreshed from the Gestalt README through the sanctioned snapshot refresh.

## Verification

The workflow contract test fails against the previous shallow workflow and passes with `fetch-depth: 0` on every coverage lane. The four Desktop specs and the continuation spec pass locally; the Windows-only assertions are judged by the native Windows lane. The full Web browser replay suite runs green in read-only replay mode after the re-record, including the previously failing scroll-contract, onboarding, Desktop chrome, minimal-preset, and shipped-composition scenarios. `DSH_EXAMPLE_MODE=lib` two-instance-relay replay and the built-provider class-identity test both pass; the translation-prompt snapshot matches the Gestalt README after refresh.

## Alternatives considered

**Resolve the release-notes range without Git history in the test.** Rejected: the CLI's ancestry check is the product behavior under test, and the verified range is real repository history; the lane, not the assertion, was wrong.

**Trim the scroll-contract assertions instead of lengthening the streams.** Rejected: the growth assertion is the behavior under test — streaming continues while the reader is scrolled away — and shortening the observation would describe a weaker contract.

**Revert the whole-section occupancy change in the Models store.** Rejected: the occupancy semantics for `configured` and `removable` are deliberate and unit-pinned; the defect was the view deriving its listing from `configured` alone.

**Detect Relay failures by `error.name` or `code` instead of `instanceof`.** Rejected: Consumers already branch on the public class, and the provider can share that constructor without changing the HTTP mapping contract.

**Keep importing `RemoteRelayError` from `./relay.ts` and mark `./relay.js` external.** Rejected: the published runtime is `lib/index.js`, not a sibling `lib/relay.js`; Consumers load the class from the public package entry.

## Consequences

Pull requests on this baseline no longer inherit the four red lanes. The Models section keeps the setup card reachable for first-run users while preserving the occupancy-based `configured` and `removable` semantics the provider-row rework introduced. The scroll contract's stream length is now a stated sizing contract (`LIVE_STREAM_CHUNKS`) rather than an implicit race. Lib-mode two-instance-relay replay maps `REMOTE_OFFLINE` through one `RemoteRelayError` constructor.
