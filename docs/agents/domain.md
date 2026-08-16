# Domain docs

English | [中文](domain.zh.md)

Matt engineering skills consume this repository’s domain terminology and architectural decisions before exploring or implementing a ticket.

## Reading order

1. Read the root [CONTEXT-MAP.md](../../CONTEXT-MAP.md).
2. Read each mapped `CONTEXT.md` relevant to the requested area.
3. Read applicable active Agent Notes under [`.agents/notes/`](../../.agents/notes/README.md).
4. Read the owning architecture, subsystem, or package reference required by the repository instructions.

Proceed silently when no mapped context exists for an area. Add one through `domain-modeling` only when the work establishes durable terminology or ownership.

## Layout

This repository uses a multi-context layout:

```text
/
├── CONTEXT-MAP.md
├── apps/
│   └── desktop/
│       └── CONTEXT.md
└── .agents/
    └── notes/
```

A context document owns the terminology for one product or subsystem. `CONTEXT-MAP.md` routes agents to relevant context documents without requiring every package to have one.

DeepSeek Harness uses Agent Notes instead of `docs/adr/`. Do not create a parallel ADR hierarchy. Follow [`.agents/notes/README.md`](../../.agents/notes/README.md) when a decision requires a new record.

## Terminology

Use the preferred terms defined in the relevant `CONTEXT.md` in issues, specifications, implementation plans, code, tests, and documentation. Avoid synonyms explicitly listed under `_Avoid_`.

When required terminology is absent, reconsider whether an existing term already applies. If the gap is real and durable, update the owning context through `domain-modeling`.

## Decision conflicts

Surface any conflict with an active Agent Note explicitly. Do not silently override the recorded decision or treat archived notes as current authority.
