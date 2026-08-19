/** Public Workspace Reference records. */

import type { FsPathInfo } from '@deepseek-ai/dsh-fs'
import type { WorkspacePathEntry } from './search.ts'

export type { WorkspacePathEntry }

/** Filesystem face the mention resolver needs. */
export interface MentionFileSystem {
  /**
   * Return path metadata without following a final symlink.
   * @param path - workspace-relative or absolute path.
   * @param opts - optional cwd for relative resolution.
   * @param signal - caller lifetime.
   */
  lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>
}

/** Durable source for one existence-only workspace path marker. */
export interface WorkspaceReferenceSource {
  kind: 'workspace-reference'
  /** Workspace-relative path using `/` separators. */
  path: string
  /** Whether the validated path is a file or a directory. */
  pathKind: 'file' | 'directory'
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'workspace-reference': WorkspaceReferenceSource
  }
}
