# Request context

Model-visible context that a host or plugin adds to a turn. It is not a tool result and not the user's own words.

## Language

**Workspace Reference**: A user-authored pointer to one path that exists inside the current session workspace. It names the workspace-relative path and whether that path is a file or a directory. It is not the file's bytes and not the directory's children.

_Avoid_: File Mention, @file, attachment, path mention

**Session Reference**: A bounded, read-only snapshot of another session's current conversation surface, prepared as untrusted model-visible context.

_Avoid_: Workspace Reference, mention (unqualified), session fork
