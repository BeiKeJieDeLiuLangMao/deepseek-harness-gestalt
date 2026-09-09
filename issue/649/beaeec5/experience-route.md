# Issue 649 frozen draft experience route

## Provenance

- Source commit: `beaeec5475e4e0d85e957018da677f34e85a94a1`.
- Client build revision: `beaeec5`.
- Client build record: 214 artifacts, aggregate SHA-256 `13ddf6afa974689c548a6a5f6da772b6d2f3b50cf9552030a8a216ac098ef6ca`.
- Desktop Main SHA-256: `bc3a4da661e07542821f06d1a39d29e4d9d336f8c6256b5aa25b20bdd76173e1`.
- Application: unsigned arm64 packaged `DeepSeek Gestalt.app`, version `0.1.17`.
- Driver: WebdriverIO Electron service against a real isolated Electron application.
- Data mode: in-memory account-pool prototype fixture; no real CLIProxyAPI service, account, key, OAuth, or model call.

## Evidence runs

The main coherent route evidence currently retained in `wdio-fixture/` is the latest completed run after bash39. That directory was reused by later coherent reruns, so the earlier bash36 and bash39 file hashes survive only in their issued reports; they no longer identify the bytes currently at those paths. Do not cite those historical hashes as current files.

The quota supplement belongs to job `bash-44` and is copied to `quota-supplement-bash44/` with its own `launch-identity.json`, `runner.log`, `main-smoke.log`, `cleanup.json`, and `SHA256SUMS`. Job bash44 used the same source and unsigned application in a fresh scratch, passed the complete route, removed the scratch, and closed its CDP port. It is supplemental PNG evidence, not a final GIF and not a splice claiming one capture session.

## Demonstrated route

1. Open the real Desktop Settings overlay and select 账号池.
2. Review the A management-card draft with account status, health history, provider filters, and fixture identities.
3. Switch A/B/C presentation drafts.
4. Switch all cards to quota view, flip one card independently, then issue another global command.
5. Confirm the empty/unknown quota card renders no quota fill or timeline marker.
6. Open the six-provider menu and cancel account creation.
7. Open the Kimi device-flow fixture; the non-navigable `example.test` URI query and displayed code both equal `KIMI-1234`.
8. Enter a local GLM fixture value; observe no value in recorded fetch/XHR/beacon payloads or browser storage, cancel, reopen, and confirm the field is empty.
9. Exit Electron and verify exact process, scratch, and CDP cleanup.

## Frozen draft PNG set

- `01-a-management.png`: A management-card overview. The visible `PROTOTYPE DRAFT` scaffold identifies this as planning evidence.
- `02-quota-and-unknown.png`: full quota view. The right card shows multiple reliable windows with quota bars, red time-comparison markers, and numeric remaining ratios; the left card shows the empty/unknown state without fabricated graphics.
- `03-kimi-device.png`: Kimi device fixture URI and code consistency; the URI is display text, not a link.
- `04-glm-empty-form.png`: GLM form before input, with no fixture value visible.

The bash44 supplement also captured `04a-codex-reliable-quota-windows.png`, a real Codex card crop with quota/time ratios and a needle. It remains local because the floating prototype switcher obscures part of the card; the published full quota view is clearer and shows four reliable time/quota comparisons. The literal-value GLM screenshot remains local and is excluded so a non-secret fixture value cannot be mistaken for a credential.

## Required production adjustments

- Replace the fixture banner's built-in core, Composite Provider, version, `127.0.0.1:8317`, and healthy status with state owned by issue 650. The draft text must not ship as an unconditional runtime claim.
- Clarify enable/disable control labeling and placement. The current toggle is adjacent to 查看配额 and its mutation meaning is not explicit.
- Render real credential inputs as masked password fields and apply the issue 652 storage and submission contract. The prototype uses a visible text input only with a non-secret fixture value.
- Replace in-memory account and quota fixtures with issue 650/651 integrated runtime state before treating the screen as production acceptance.

## Evidence boundary

These PNGs freeze GUI planning input for issues 649 and 652. They prove the real Electron Settings composition and prototype interactions at the named commit. They do not prove native CUA, a production CLIProxyAPI process, real OAuth, real credentials, model registration, quota retrieval, or inference.
