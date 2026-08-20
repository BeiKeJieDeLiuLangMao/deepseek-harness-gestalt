# Request context

Model-visible context that a host or plugin adds to a turn. It is not a tool result and not the user's own words.

## Language

**File Reference**: A user-authored `@path` in the prompt. It names a workspace path the user pointed at. It is not the file's bytes. Content is obtained only through `read`.

_Avoid_: File Mention, Workspace Reference, attachment, path mention

**Session Reference**: A bounded, read-only snapshot of another session's current conversation surface, prepared as untrusted model-visible context.

_Avoid_: File Reference, mention (unqualified), session fork
