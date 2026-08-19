/** Public Workspace Reference records. */

import type { FsPathInfo, FsTarget } from '@deepseek-ai/dsh-fs'
import type { WorkspacePathEntry } from './search.ts'

export type { WorkspacePathEntry }

/** Filesystem face the mention resolver needs. */
export interface MentionFileSystem {
  /**
   * Return path metadata without following a final symlink.
   * @param path - workspace-relative or absolute path.
   * @param opts - optional cwd for relative resolution.
   * @param signal - caller lifetime.
   * @returns metadata only, never content; undefined for an absent path.
   */
  lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>
  /**
   * Resolve a path to a stable target, following intermediate and final symlinks.
   * @param path - workspace-relative or absolute path.
   * @param opts - optional cwd and cancellation.
   * @returns the stable target; the same file yields the same `targetKey`.
   */
  resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
  /**
   * Test whether `child` is `parent` or a descendant of it.
   * @param parent - canonical workspace directory target.
   * @param child - canonical candidate target.
   * @returns true when `child` is `parent` or a descendant of it.
   */
  contains(parent: FsTarget, child: FsTarget): boolean
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
