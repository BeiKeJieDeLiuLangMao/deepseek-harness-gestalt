# Browser Dock prototype

Throwaway UI prototype for deciding how a Session presents active browser tabs after the user collapses the Browser Dock. It uses the production `AppFrame` layout and DSH theme, but all browser pages and runtime state are fixtures.

Run from the repository root:

```sh
pnpm prototype:browser-dock
```

Open the printed local URL. The bottom switcher selects the three alternatives, also available through `?variant=codex`, `?variant=edge`, and `?variant=tray`.

This directory is prototype evidence. Production code must implement only the accepted decision and must not import from this directory.
