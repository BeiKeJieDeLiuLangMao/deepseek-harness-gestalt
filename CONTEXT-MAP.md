# Domain context map

Read the context documents relevant to the requested work.

| Context | Document | Applies to |
| --- | --- | --- |
| DeepSeek Gestalt | [apps/desktop/CONTEXT.md](apps/desktop/CONTEXT.md) | Desktop Host, Desktop Bundle, Window Chrome, Update Control, Personal Release Channel, Launch Directory, and Desktop-specific Session Surface projection |
| Mobile Companion | [apps/mobile/CONTEXT.md](apps/mobile/CONTEXT.md) | Human-operated mobile access, Personal Pairing, Paired Desktop, Remote Online state, Companion Cache, and Companion Surface authority |
| Platform identity | [packages/platform/CONTEXT.md](packages/platform/CONTEXT.md) | Platform Account, Installation, Account Session, Login Attempt, Platform Instance, Pairing Challenge, Personal Pairing, and Device Principal boundaries |

Add a context only when the repository has durable terminology or ownership that cannot be expressed by an existing entry.

## Relationships

- **Mobile Companion ↔ DeepSeek Gestalt**: Mobile Companion extends human access to a Paired Desktop while that Desktop is Remote Online; it does not automate mobile devices or run a cloud Harness Engine.
- **Mobile Companion ↔ Platform identity**: Platform Account authenticates each Installation, while Personal Pairing grants one independently revocable Device Principal with only Companion Surface authority.
