/**
 * Bounded workspace index over `ctx.fs`. Walks one directory level at a time,
 * skips configured basenames and final-component symlinks, and treats a
 * directory `FS_PERMISSION_DENIED` as an omitted subtree.
 */
import { isAbsolute } from 'node:path'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import type { WorkspacePathEntry } from './types.ts'

/** Options for one bounded index pass. */
export interface IndexOptions {
  readonly maxFiles: number
  readonly ignoreDirs: readonly string[]
  readonly ignoreFiles: readonly string[]
}

/** One index pass: entries plus whether the cap stopped the walk. */
export interface WorkspaceIndex {
  readonly files: readonly WorkspacePathEntry[]
  readonly truncated: boolean
}

/**
 * Index files and directories under `cwd`.
 * @param fileSystem - filesystem used for resolve, listDir, and lstat.
 * @param cwd - absolute session workspace.
 * @param options - cap and basename filters.
 * @param signal - caller lifetime.
 */
export async function indexWorkspace(
  fileSystem: FileSystem,
  cwd: string,
  options: IndexOptions,
  signal: AbortSignal,
): Promise<WorkspaceIndex> {
  if (!isAbsolute(cwd)) return { files: [], truncated: false }
  const ignoreDirs = new Set(options.ignoreDirs)
  const ignoreFiles = new Set(options.ignoreFiles.map(name => name.toLowerCase()))
  const files: WorkspacePathEntry[] = []
  const queue: { target: FsTarget; prefix: string }[] = []
  signal.throwIfAborted()
  const root = await fileSystem.resolve('.', { cwd, signal })
  queue.push({ target: root, prefix: '' })
  while (queue.length > 0) {
    if (files.length >= options.maxFiles) return { files, truncated: true }
    signal.throwIfAborted()
    const current = queue.shift()
    /* v8 ignore next -- the loop only runs while the queue is non-empty */
    if (current === undefined) break
    let entries
    try {
      entries = await fileSystem.listDir(current.target, signal)
    } catch (error) {
      if (error instanceof FsError && error.code === 'FS_PERMISSION_DENIED') continue
      throw error
    }
    for (const entry of entries) {
      if (files.length >= options.maxFiles) return { files, truncated: true }
      const relative = current.prefix === '' ? entry.name : `${current.prefix}/${entry.name}`
      signal.throwIfAborted()
      const info = await fileSystem.lstat(relative, { cwd }, signal)
      if (info === undefined || info.type === 'symlink' || info.type === 'other') continue
      if (info.type === 'directory') {
        if (ignoreDirs.has(entry.name)) continue
        files.push({ relative, kind: 'dir' })
        queue.push({ target: entry.target, prefix: relative })
        continue
      }
      if (ignoreFiles.has(entry.name.toLowerCase())) continue
      files.push({ relative, kind: 'file' })
    }
  }
  return { files, truncated: false }
}
