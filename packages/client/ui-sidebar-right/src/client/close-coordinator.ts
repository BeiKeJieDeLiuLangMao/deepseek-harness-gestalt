/** Serialized admission and release for true workbench occurrence closes. */
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SidebarRightTabCloseContext, SidebarRightTabDefinition } from './tab-registry.ts'

/** One committed or retained batch member. */
export interface SidebarRightCloseFailure {
  readonly tabId: TabId
  readonly error: unknown
}

/** Observable result of one close request. */
export interface SidebarRightCloseOutcome {
  readonly admitted: boolean
  readonly closed: readonly TabId[]
  readonly failed: readonly SidebarRightCloseFailure[]
}

/** One occurrence and the definition in force when its transaction starts. */
export interface SidebarRightCloseCandidate {
  readonly context: SidebarRightTabCloseContext
  readonly definition: SidebarRightTabDefinition | undefined
}

/**
 * One Session-wide close queue.
 *
 * A transaction first asks every candidate for admission. Any refusal or
 * admission error cancels the whole batch before a release starts. After
 * admission, releases settle independently and only fulfilled records are
 * committed, so a failed owner remains visible without pretending that an
 * already released sibling can be rolled back.
 */
export class SidebarRightCloseCoordinator {
  private tail: Promise<void> = Promise.resolve()

  /**
   * Run one close transaction after earlier requests settle.
   * @param candidates - current records in this request.
   * @param commit - removes exactly the successfully released records.
   * @returns the admission and per-record outcome.
   */
  run(
    candidates: () => readonly SidebarRightCloseCandidate[],
    commit: (tabIds: readonly TabId[], checkpoint: boolean) => void,
  ): Promise<SidebarRightCloseOutcome> {
    let resolve!: (value: SidebarRightCloseOutcome) => void
    let reject!: (error: unknown) => void
    const result = new Promise<SidebarRightCloseOutcome>((done, fail) => { resolve = done; reject = fail })
    const execute = async (): Promise<void> => {
      try {
        resolve(await this.execute(candidates(), commit))
      } catch (error) {
        reject(error)
      }
    }
    this.tail = this.tail.then(execute, execute)
    return result
  }

  private async execute(
    candidates: readonly SidebarRightCloseCandidate[],
    commit: (tabIds: readonly TabId[], checkpoint: boolean) => void,
  ): Promise<SidebarRightCloseOutcome> {
    const admission = await Promise.allSettled(candidates.map(async ({ context, definition }) => {
      const accepted = await definition?.beforeClose?.(context)
      if (accepted === false) throw new Error(`sidebarRight: close of tab "${context.tab.id}" was refused`)
    }))
    const denied: SidebarRightCloseFailure[] = []
    for (let index = 0; index < admission.length; index += 1) {
      const settled = admission[index]
      const candidate = candidates[index]
      if (settled?.status === 'rejected' && candidate !== undefined) {
        denied.push({ tabId: candidate.context.tab.id, error: settled.reason })
      }
    }
    if (denied.length > 0) return { admitted: false, closed: [], failed: denied }

    const released = await Promise.allSettled(candidates.map(async ({ context, definition }) => {
      await definition?.close?.(context)
      return context.tab.id
    }))
    const closed: TabId[] = []
    const failed: SidebarRightCloseFailure[] = []
    for (let index = 0; index < released.length; index += 1) {
      const settled = released[index]
      const candidate = candidates[index]
      if (settled?.status === 'fulfilled') closed.push(settled.value)
      else if (settled?.status === 'rejected' && candidate !== undefined) {
        failed.push({ tabId: candidate.context.tab.id, error: settled.reason })
      }
    }
    if (closed.length > 0) {
      const checkpoint = candidates.some(({ definition }) =>
        definition?.beforeClose !== undefined || definition?.close !== undefined)
      commit(closed, checkpoint)
    }
    return { admitted: true, closed, failed }
  }
}
