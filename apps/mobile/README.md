# DeepSeek Gestalt Mobile

English | [中文](README.zh.md)

Mobile account and Personal Pairing shell for the current Installation. It shows the bilingual retention notice before GitHub authorization, opens authorization outside the app, polls Platform with P-256 proof, restores only a server-confirmed Account Session, and signs out this Installation without deleting Personal Pairings. After sign-in, the pairing component accepts only the exact complete one-time link or native QR payload, displays authentication words, and waits for explicit Desktop confirmation before showing a paired state.

The entry validates the complete development and production identity pair before rendering: each side supplies `ORIGIN`, `CALLBACK_URL`, `GITHUB_CLIENT_ID`, `CREDENTIAL_REFERENCE`, `DATABASE_IDENTITY`, and `IDENTITY_NAMESPACE` under its `VITE_PLATFORM_DEVELOPMENT_*` or `VITE_PLATFORM_PRODUCTION_*` prefix, and `VITE_PLATFORM_ENV` explicitly selects one side. Every paired field must differ. Missing, unknown, shared, non-HTTPS, or callback-mismatched configuration fails before rendering or network traffic.

The shared Mobile entry includes the `@capacitor/browser` adapter and calls it directly from the prepared authorization button's user activation. It has no `window.open`, popup, or custom-URL token fallback. `IndexedDbInstallationAccountStore` uses the selected database identity in its database name; native packaging supplies the stable WebView origin.

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
```

## Known Limitations and Deferred Work

- Product pairing remains unavailable until the independent Noise review admits a reviewed handshake adapter; the checked-in composition creates no invitation or Device Principal.
- Remote Companion traffic, push, and attachment flows are outside this shell.
- Native iOS/Android project generation and device packaging remain outside this shell; the checked-in composition includes the Capacitor system-browser adapter and shared WebView Account lifecycle.
