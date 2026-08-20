# Workspace References

English | [中文](workspace-reference.zh.md)

Existence-only workspace path markers injected from validated `@path` tokens. The [package contract](../../packages/context/workspace-reference) defines scan, workspace confinement, and the sourced marker. It names a workspace-relative path and whether that path is a file or a directory.

Source: [`packages/context/workspace-reference/src/types.ts`](../../packages/context/workspace-reference/src/types.ts)

## Source

`WorkspaceReferenceSource` is the durable producer identity for one validated marker. It merges into `dsh-llm`'s `MessageSourceMap`.

```ts type-equiv
/** Durable source for one existence-only workspace path marker. */
interface WorkspaceReferenceSource {
  kind: 'workspace-reference'
  /** Workspace-relative path using `/` separators. */
  path: string
  /** Whether the validated path is a file or a directory. */
  pathKind: 'file' | 'directory'
}
```
