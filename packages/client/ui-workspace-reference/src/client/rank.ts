/**
 * Browser ranking: the host algorithm, inlined. The host package root is not
 * a client-safe import (node:fs); this subpath is.
 */
export {
  rankFiles,
  type WorkspacePathEntry,
} from '@deepseek-ai/dsh-workspace-reference/src/search.ts'
