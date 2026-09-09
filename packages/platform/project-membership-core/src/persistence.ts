/** Atomic document storage owned only by the Project Membership provider. */
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** One exclusive membership transaction; writes become visible only when its callback succeeds. */
export interface ProjectMembershipTransaction {
  readonly document: string | undefined
  /** Stage the complete membership document for this transaction's commit. */
  write(document: string): void
}

/** Storage serializes the full read–modify–write callback, including an initially absent document. */
export interface ProjectMembershipPersistence {
  /**
   * Execute one membership operation against the current authoritative document.
   * @param operation - Callback whose staged write commits before its result is returned.
   * @returns The callback result after durability; throws without committing on failure.
   */
  transact<T>(operation: (transaction: ProjectMembershipTransaction) => Promise<T>): Promise<T>
}

/** Single-writer file persistence for local compositions; it does not coordinate separate providers. */
export class FileProjectMembershipPersistence implements ProjectMembershipPersistence {
  private tail: Promise<unknown> = Promise.resolve()
  private loaded = false
  private document: string | undefined
  /** @param path - Environment-owned file used exclusively by one provider. */
  constructor(readonly path: string) {}

  async transact<T>(operation: (transaction: ProjectMembershipTransaction) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => await this.transactFile(operation))
    this.tail = result.then(() => undefined, () => undefined)
    return await result
  }

  private async transactFile<T>(operation: (transaction: ProjectMembershipTransaction) => Promise<T>): Promise<T> {
    if (!this.loaded) {
      try { this.document = await readFile(this.path, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      this.loaded = true
    }
    let staged: string | undefined
    const result = await operation({ document: this.document, write(value) { staged = value } })
    if (staged !== undefined) {
      await writeFileAtomic(this.path, staged, { mode: 0o600, dirMode: 0o700 })
      this.document = staged
    }
    return result
  }
}
