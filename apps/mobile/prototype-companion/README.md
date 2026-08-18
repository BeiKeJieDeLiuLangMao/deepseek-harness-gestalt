# Mobile Companion interaction prototype

> PROTOTYPE — throwaway code, not a production implementation.

One scope-locked Desktop placement and a Mobile Companion interaction. The Desktop frame embeds the live DSH Web Host from `http://127.0.0.1:3080`. Mobile is a new list/detail navigation shell; its composer takeover imports the repository's existing `InputBar`, `ApprovalPanel`, theme, and button styles instead of inventing parallel component forms.

The question is: how should one remote Session feel when Desktop remains the authorization and execution authority while Mobile becomes the person's nearby interaction surface?

Run from the repository root:

```sh
pnpm prototype:mobile-companion
```

Open `http://127.0.0.1:5173/?variant=A`. Desktop has one locked placement:

- `A` — Settings only: phone access is enabled and managed in `settings.section`; normal Session, sidebar, and offline views add no Mobile Companion UI.

The scenario control walks through pairing, a live Session, approval, and offline recovery. Pairing is an injected `手机配对` entry inside the live Desktop Settings shell; it does not use a separate overlay. Mobile follows the Codex mobile information hierarchy: remote Desktop identity, project-grouped Sessions, an explicit ungrouped group, and a bottom search/new-chat dock without a voice action. Selecting a Session enters a full-screen conversation and the header returns to the list. A project header's compose action starts a Session in that project; the global new-chat action starts an ungrouped Session. Mobile Companion state and actions are in-memory stubs; the Desktop iframe remains live and independently interactive. The original free-form concept mockup remains available at `http://127.0.0.1:5173/concept.html?variant=A`, but it is not an implementation reference.

Normal Desktop views do not carry Mobile Companion status, connection, device, or approval mockups. Approval is not a new Desktop surface; the prototype only reuses the existing composer-takeover `ApprovalPanel` on Mobile to show remote handling.
