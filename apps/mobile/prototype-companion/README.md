# Mobile Companion interaction prototype

> PROTOTYPE — throwaway code, not a production implementation.

Restores the approved Mobile Companion phone shell: remote Desktop identity, Workspace-grouped Sessions plus Ungrouped, project-level compose, a bottom search/new-chat dock without voice, and a full-screen conversation that reuses `InputBar` / `ApprovalPanel`. Desktop placement stays Settings-only.

The question is: does that locked list/detail IA hold at real phone density?

Run from the repository root:

```sh
pnpm prototype:mobile-companion
```

- Phone UI (default): `http://127.0.0.1:5173/?view=phone`
- Lab with live Desktop iframe: `http://127.0.0.1:5173/?view=lab`
- Free-form concept (not an implementation reference): `http://127.0.0.1:5173/concept.html?variant=A`

Scenario query: `pairing` · `live` · `approval` · `offline`. Example: `http://127.0.0.1:5173/?view=phone&scenario=approval`.

The lab Desktop frame still embeds `http://127.0.0.1:3080` when that host is running. Phone view does not need it. State stays in memory.
