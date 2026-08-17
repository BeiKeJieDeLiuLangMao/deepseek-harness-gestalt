# DeepSeek Gestalt Mobile

English | [中文](README.zh.md)

Mobile account shell for the current Installation. It shows the bilingual retention notice before GitHub authorization, opens authorization outside the app, polls Platform with P-256 proof, restores only a server-confirmed Account Session, and signs out this Installation without deleting Personal Pairings.

The build selects exactly one identity environment with `VITE_PLATFORM_ENV` (`development` or `production`) while both distinct HTTPS origins come from `VITE_PLATFORM_DEVELOPMENT_ORIGIN` and `VITE_PLATFORM_PRODUCTION_ORIGIN`. Native packaging owns the system-browser adapter and a stable WebView origin; the browser development entry uses `window.open` and IndexedDB.

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
```

## Known Limitations and Deferred Work

- This shell includes no Personal Pairing, Remote Access, push, or attachment flow.
- Native iOS/Android packaging is outside this ticket; the checked-in app is the shared WebView presentation and Account lifecycle.
