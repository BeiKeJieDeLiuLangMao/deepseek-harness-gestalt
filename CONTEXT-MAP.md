# Domain context map

Read the context documents relevant to the requested work.

| Context | Document | Applies to |
| --- | --- | --- |
| Annotation | [packages/annotation/CONTEXT.md](packages/annotation/CONTEXT.md) | Human-authored anchored notes collected in the Composer and compiled into an ordinary user message |
| DeepSeek Gestalt | [apps/desktop/CONTEXT.md](apps/desktop/CONTEXT.md) | Desktop Host, Desktop Bundle, Window Chrome, Update Control, Personal Release Channel, Launch Directory, and Desktop-specific Session Surface projection |
| Platform identity | [packages/platform/CONTEXT.md](packages/platform/CONTEXT.md) | Platform Account, Installation, Account Session, Login Attempt, Platform Instance, Pairing Challenge, Personal Pairing, and Device Principal boundaries |

Add a context only when the repository has durable terminology or ownership that cannot be expressed by an existing entry.

## Relationships

- **Annotation ↔ DeepSeek Gestalt**: Annotation belongs to the shared Session Surface; DeepSeek Gestalt receives it through the Web Host instead of owning a Desktop-specific variant.
