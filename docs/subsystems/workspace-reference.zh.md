# 工作区引用

[English](workspace-reference.md) | 中文

由经过校验的 `@path` token 注入的、仅表示存在性的工作区路径标记。[包约定](../../packages/context/workspace-reference) 定义扫描、工作区约束和带 source 的标记。它给出工作区相对路径，以及该路径是文件还是目录。

来源：[`packages/context/workspace-reference/src/types.ts`](../../packages/context/workspace-reference/src/types.ts)

## Source

`WorkspaceReferenceSource` 是一条经过校验的标记的持久生产者身份。它合并进 `dsh-llm` 的 `MessageSourceMap`。

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
