# Issue 649 frozen draft experience route

## Provenance

- Source commit: `beaeec5475e4e0d85e957018da677f34e85a94a1`.
- Client build revision: `beaeec5`.
- Client build record: 214 artifacts, aggregate SHA-256 `13ddf6afa974689c548a6a5f6da772b6d2f3b50cf9552030a8a216ac098ef6ca`.
- Desktop Main SHA-256: `bc3a4da661e07542821f06d1a39d29e4d9d336f8c6256b5aa25b20bdd76173e1`.
- Application: unsigned arm64 packaged `DeepSeek Gestalt.app`, version `0.1.17`.
- Driver: WebdriverIO Electron service against a real isolated Electron application.
- Data mode: in-memory account-pool prototype fixture; no real CLIProxyAPI service, account, key, OAuth, or model call.
- State: fresh scratch DSH Home and Electron user-data; both removed after the route.

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

- `01-variant-a-management.png`: A management-card overview. The visible `PROTOTYPE DRAFT` scaffold identifies this as planning evidence.
- `05-unknown-empty-quota.png`: quota view with a clear populated timeline next to the empty/unknown state.
- `07-kimi-device-consistency.png`: Kimi device fixture URI and code consistency; the URI is display text, not a link.

The available `08-glm-local-key-form.png` contains the literal non-secret test value `issue649-local-only-fixture-value`. It is retained as local test evidence but is intentionally excluded from publication so a field value cannot be mistaken for a credential. No empty-field GLM PNG exists from the completed run, and the application was not restarted solely to create one publication image. The six-provider menu PNG can serve as the safe GLM-entry planning pointer instead if a fourth image is required.

## Required production adjustments

- Replace the fixture banner's built-in core, Composite Provider, version, `127.0.0.1:8317`, and healthy status with state owned by issue 650. The draft text must not ship as an unconditional runtime claim.
- Clarify enable/disable control labeling and placement. The current toggle is adjacent to 查看配额 and its mutation meaning is not explicit.
- Render real credential inputs as masked password fields and apply the issue 652 storage and submission contract. The prototype uses a visible text input only with a non-secret fixture value.
- Replace in-memory account and quota fixtures with issue 650/651 integrated runtime state before treating the screen as production acceptance.

## Evidence boundary

These PNGs freeze GUI planning input for issues 649 and 652. They prove the real Electron Settings composition and prototype interactions at the named commit. They do not prove native CUA, a production CLIProxyAPI process, real OAuth, real credentials, model registration, quota retrieval, or inference.
