/**
 * Session-owned Browser Workspace binder. Each Session independently owns
 * zero or more Workspaces; each Workspace uses one Browser Profile and
 * contains multiple browser instances and tabs. Dock visibility and width
 * are Session facts for later Dock UI.
 * @module @deepseek-ai/dsh-browser-workspace
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import { BrowserRuntimeError } from '@deepseek-ai/dsh-browser-runtime'
import type {
  BrowserClosedState,
  BrowserCreateAttach,
  BrowserCreateRequest,
  BrowserMutationRequest,
  BrowserNavigateRequest,
  BrowserObserveRequest,
  BrowserPageState,
  BrowserRuntimeState,
  BrowserScreenshot,
  BrowserTarget,
} from '@deepseek-ai/dsh-browser-runtime'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { applyBrowserWorkspaceProjection, EMPTY_BROWSER_WORKSPACE, foldBrowserWorkspace } from './fold.ts'
import type {
  BrowserWorkspaceInstanceRecord,
  BrowserWorkspaceProjection,
  BrowserWorkspaceRecord,
  BrowserWorkspaceTabRecord,
} from './types.ts'

export type * from './types.ts'
export { applyBrowserWorkspaceProjection, EMPTY_BROWSER_WORKSPACE, foldBrowserWorkspace } from './fold.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    browserWorkspace: BrowserWorkspaceBinder
  }
}

const workspaceProjectionSchema = zod.object({
  dockOpen: zod.boolean(),
  dockWidth: zod.number().int().positive(),
  workspaces: zod.array(zod.object({
    workspaceId: zod.string().min(1),
    profileId: zod.string().min(1),
    browsers: zod.array(zod.object({
      browserId: zod.string().min(1),
      tabs: zod.array(zod.object({ tabId: zod.string().min(1) })),
      activeTabId: zod.string().min(1).nullable(),
    })),
    activeBrowserId: zod.string().min(1).nullable(),
  })),
  activeWorkspaceId: zod.string().min(1).nullable(),
}) as unknown as ZodType<BrowserWorkspaceProjection>

/** Request that names the owning Session for one Browser Runtime operation. */
export interface BrowserWorkspaceSessionRequest {
  readonly session: Session
}

/** Create request bound to one Session. */
export type BrowserWorkspaceCreateRequest = BrowserCreateRequest & BrowserWorkspaceSessionRequest
/** Mutation request bound to one Session. */
export type BrowserWorkspaceMutationRequest = BrowserMutationRequest & BrowserWorkspaceSessionRequest
/** Navigate request bound to one Session. */
export type BrowserWorkspaceNavigateRequest = BrowserNavigateRequest & BrowserWorkspaceSessionRequest
/** Observe request bound to one Session. */
export type BrowserWorkspaceObserveRequest = BrowserObserveRequest & BrowserWorkspaceSessionRequest

/** Dock visibility and width written as Session facts. */
export interface BrowserWorkspaceDockRequest {
  readonly session: Session
  readonly open: boolean
  readonly width?: number
}

/**
 * Bind Browser Runtime identities to one Session log and project Dock plus
 * instance and tab ownership from durable Session facts.
 */
export class BrowserWorkspaceBinder extends Service {
  static inject = ['browserRuntime', 'sessions']

  constructor(ctx: Context) {
    super(ctx, 'browserWorkspace')
    ctx.on('session/disposed', session => this.cleanup(session), { global: true })
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register<'browserWorkspace', BrowserWorkspaceProjection>({
        key: 'browserWorkspace',
        schema: workspaceProjectionSchema,
        init: () => EMPTY_BROWSER_WORKSPACE,
        apply: applyBrowserWorkspaceProjection,
        view: state => state,
        stateVersion: 1,
      })
    })
  }

  /**
   * Read the last logged Workspace for one Session.
   * @param session - Owning Session.
   * @returns the last logged snapshot, or the empty Workspace.
   */
  snapshot(session: Session): BrowserWorkspaceProjection {
    return foldBrowserWorkspace(session.events)
  }

  /**
   * Record Dock visibility and preferred width for one Session.
   * @param request - Session, open flag, and optional width.
   * @returns the committed Workspace snapshot.
   */
  setDock(request: BrowserWorkspaceDockRequest): BrowserWorkspaceProjection {
    const current = this.snapshot(request.session)
    const width = request.width ?? current.dockWidth
    if (!Number.isSafeInteger(width) || width < 1) {
      throw new BrowserRuntimeError('browser Dock width must be a positive safe integer', 'BROWSER_CAPACITY')
    }
    if (current.dockOpen === request.open && current.dockWidth === width) return current
    return this.commit(request.session, { ...current, dockOpen: request.open, dockWidth: width })
  }

  /**
   * Create one tab in the Session's Browser Workspace.
   * @param request - Session-bound create request.
   * @returns the committed open page.
   */
  async create(request: BrowserWorkspaceCreateRequest): Promise<BrowserPageState> {
    this.assertCreateAttach(request.session, request.attach)
    const created = await this.ctx.browserRuntime.create(request)
    this.adopt(request.session, created.target)
    return created
  }

  /**
   * Navigate one Session-owned tab.
   * @param request - Session-bound navigate request.
   * @returns the committed open page.
   */
  async navigate(request: BrowserWorkspaceNavigateRequest): Promise<BrowserPageState> {
    this.assertOwned(request.session, request.target)
    return this.ctx.browserRuntime.navigate(request)
  }

  /**
   * Observe one Session-owned tab.
   * @param request - Session-bound observe request.
   * @returns the current open, unavailable, or closed state.
   */
  async observe(request: BrowserWorkspaceObserveRequest): Promise<BrowserRuntimeState> {
    this.assertOwned(request.session, request.target)
    return this.ctx.browserRuntime.observe(request)
  }

  /**
   * Capture one Session-owned tab.
   * @param request - Session-bound observe request.
   * @returns screenshot bytes and depicted page facts.
   */
  async screenshot(request: BrowserWorkspaceObserveRequest): Promise<BrowserScreenshot> {
    this.assertOwned(request.session, request.target)
    return this.ctx.browserRuntime.screenshot(request)
  }

  /**
   * Focus one Session-owned tab and record it as the Session's active tab.
   * @param request - Session-bound mutation request.
   * @returns the committed focused page.
   */
  async focus(request: BrowserWorkspaceMutationRequest): Promise<BrowserPageState> {
    this.assertOwned(request.session, request.target)
    const focused = await this.ctx.browserRuntime.focus(request)
    this.activate(request.session, focused.target)
    return focused
  }

  /**
   * Close one Session-owned tab and drop it from the Session Workspace.
   * @param request - Session-bound mutation request.
   * @returns the terminal close receipt.
   */
  async close(request: BrowserWorkspaceMutationRequest): Promise<BrowserClosedState> {
    this.assertOwned(request.session, request.target)
    const closed = await this.ctx.browserRuntime.close(request)
    this.forget(request.session, closed.target)
    return closed
  }

  /**
   * Close every live tab still owned by one Session.
   * @param session - Session whose leftover Runtime tabs must be closed.
   */
  async cleanup(session: Session): Promise<void> {
    const snapshot = this.snapshot(session)
    for (const workspace of snapshot.workspaces) {
      for (const browser of workspace.browsers) {
        for (const tab of browser.tabs) {
          const target = {
            profileId: workspace.profileId,
            workspaceId: workspace.workspaceId,
            browserId: browser.browserId,
            tabId: tab.tabId,
          }
          try {
            const state = await this.ctx.browserRuntime.observe({ target })
            if (state.status !== 'closed') {
              await this.ctx.browserRuntime.close({ target, expectedRevision: state.revision })
            }
          } catch (error) {
            this.ctx.logger.warn('browser-workspace: Session cleanup failed for one tab')
            this.ctx.logger.warn(error)
          }
          this.forget(session, target)
        }
      }
    }
  }

  /** Reject attach that names another Session's hierarchy or an unowned one. */
  private assertCreateAttach(session: Session, attach: BrowserCreateRequest['attach']): void {
    if (attach === undefined) return
    const owner = this.ownerOfAttach(attach)
    if (owner !== undefined && owner.id !== session.id) {
      throw new BrowserRuntimeError('cross-Session page transfer is not supported', 'BROWSER_TRANSFER_UNSUPPORTED')
    }
    if (!ownsAttach(this.snapshot(session), attach)) {
      throw new BrowserRuntimeError('browser attach target is not owned by this Session', 'BROWSER_SESSION_MISMATCH')
    }
  }

  /** Find the live Session that already owns one attach hierarchy, if any. */
  private ownerOfAttach(attach: NonNullable<BrowserCreateRequest['attach']>): Session | undefined {
    return this.ctx.sessions.list().find(session => ownsAttach(this.snapshot(session), attach))
  }

  /** Reject a target that another Session owns or that this Session never adopted. */
  private assertOwned(session: Session, target: BrowserTarget): void {
    for (const other of this.ctx.sessions.list()) {
      if (other.id === session.id) continue
      if (ownsTarget(this.snapshot(other), target)) {
        throw new BrowserRuntimeError('cross-Session page transfer is not supported', 'BROWSER_TRANSFER_UNSUPPORTED')
      }
    }
    if (!ownsTarget(this.snapshot(session), target)) {
      throw new BrowserRuntimeError('browser target is not owned by this Session', 'BROWSER_SESSION_MISMATCH')
    }
  }

  /** Record a newly created tab on the owning Session. */
  private adopt(session: Session, target: BrowserTarget): void {
    const current = this.snapshot(session)
    this.commit(session, adoptTarget(current, target))
  }

  /** Record the focused tab as the Session's active tab. */
  private activate(session: Session, target: BrowserTarget): void {
    const current = this.snapshot(session)
    this.commit(session, activateTarget(current, target))
  }

  /** Drop a closed tab from the Session Workspace. */
  private forget(session: Session, target: BrowserTarget): void {
    const current = this.snapshot(session)
    this.commit(session, forgetTarget(current, target))
  }

  /** Append one whole-value Workspace snapshot when it differs. */
  private commit(session: Session, next: BrowserWorkspaceProjection): BrowserWorkspaceProjection {
    const current = this.snapshot(session)
    if (sameSnapshot(current, next)) return current
    const committed = freezeSnapshot(next)
    session.append('browser/workspace', committed)
    return committed
  }
}

/** Whether one snapshot already names the complete target. */
function ownsTarget(snapshot: BrowserWorkspaceProjection, target: BrowserTarget): boolean {
  const workspace = snapshot.workspaces.find(item => item.workspaceId === target.workspaceId)
  if (workspace === undefined || workspace.profileId !== target.profileId) return false
  const browser = workspace.browsers.find(item => item.browserId === target.browserId)
  return browser?.tabs.some(tab => tab.tabId === target.tabId) === true
}

/** Whether one snapshot already owns the Workspace or instance named by attach. */
function ownsAttach(snapshot: BrowserWorkspaceProjection, attach: BrowserCreateAttach): boolean {
  const workspace = snapshot.workspaces.find(item => item.workspaceId === attach.workspaceId)
  if (workspace === undefined) return false
  return attach.kind === 'workspace' || workspace.browsers.some(browser => browser.browserId === attach.browserId)
}

/** Add one target to the Session snapshot, creating Workspace and instance rows as needed. */
function adoptTarget(snapshot: BrowserWorkspaceProjection, target: BrowserTarget): BrowserWorkspaceProjection {
  const workspaces = snapshot.workspaces.map(workspace => ({
    ...workspace,
    browsers: workspace.browsers.map(browser => ({
      ...browser,
      tabs: [...browser.tabs],
    })),
  }))
  let workspace = workspaces.find(item => item.workspaceId === target.workspaceId)
  if (workspace === undefined) {
    workspace = {
      workspaceId: target.workspaceId,
      profileId: target.profileId,
      browsers: [],
      activeBrowserId: target.browserId,
    }
    workspaces.push(workspace)
  }
  let browser = workspace.browsers.find(item => item.browserId === target.browserId)
  if (browser === undefined) {
    browser = { browserId: target.browserId, tabs: [], activeTabId: target.tabId }
    workspace.browsers.push(browser)
  }
  browser.tabs.push({ tabId: target.tabId })
  workspace.activeBrowserId = target.browserId
  browser.activeTabId = target.tabId
  return {
    ...snapshot,
    workspaces,
    activeWorkspaceId: target.workspaceId,
  }
}

/** Mark one already-owned target as the Session's active tab. */
function activateTarget(snapshot: BrowserWorkspaceProjection, target: BrowserTarget): BrowserWorkspaceProjection {
  return {
    ...snapshot,
    activeWorkspaceId: target.workspaceId,
    workspaces: snapshot.workspaces.map((workspace) => {
      if (workspace.workspaceId !== target.workspaceId) return workspace
      return {
        ...workspace,
        activeBrowserId: target.browserId,
        browsers: workspace.browsers.map((browser) => {
          if (browser.browserId !== target.browserId) return browser
          return { ...browser, activeTabId: target.tabId }
        }),
      }
    }),
  }
}

/** Remove one closed target and collapse empty instance and Workspace rows. */
function forgetTarget(snapshot: BrowserWorkspaceProjection, target: BrowserTarget): BrowserWorkspaceProjection {
  const workspaces = snapshot.workspaces.flatMap((workspace): BrowserWorkspaceRecord[] => {
    if (workspace.workspaceId !== target.workspaceId) return [workspace]
    const browsers = workspace.browsers.flatMap((browser): BrowserWorkspaceInstanceRecord[] => {
      if (browser.browserId !== target.browserId) return [browser]
      const tabs = browser.tabs.filter(tab => tab.tabId !== target.tabId)
      if (tabs.length === 0) return []
      const remainingTab = tabs.at(-1)
      return [{
        ...browser,
        tabs,
        activeTabId: browser.activeTabId === target.tabId && remainingTab !== undefined
          ? remainingTab.tabId
          : browser.activeTabId,
      }]
    })
    if (browsers.length === 0) return []
    const remainingBrowser = browsers.at(-1)
    return [{
      ...workspace,
      browsers,
      activeBrowserId: browsers.some(browser => browser.browserId === workspace.activeBrowserId)
        || remainingBrowser === undefined
        ? workspace.activeBrowserId
        : remainingBrowser.browserId,
    }]
  })
  const activeWorkspaceId = snapshot.activeWorkspaceId === target.workspaceId
    && !workspaces.some(workspace => workspace.workspaceId === target.workspaceId)
    ? (workspaces.at(-1)?.workspaceId ?? null)
    : snapshot.activeWorkspaceId
  return { ...snapshot, workspaces, activeWorkspaceId }
}

/** Compare two snapshots without depending on object identity. */
function sameSnapshot(left: BrowserWorkspaceProjection, right: BrowserWorkspaceProjection): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Freeze one snapshot so later mutation cannot change the logged value. */
function freezeSnapshot(snapshot: BrowserWorkspaceProjection): BrowserWorkspaceProjection {
  return Object.freeze({
    dockOpen: snapshot.dockOpen,
    dockWidth: snapshot.dockWidth,
    activeWorkspaceId: snapshot.activeWorkspaceId,
    workspaces: Object.freeze(snapshot.workspaces.map(workspace => Object.freeze({
      workspaceId: workspace.workspaceId,
      profileId: workspace.profileId,
      activeBrowserId: workspace.activeBrowserId,
      browsers: Object.freeze(workspace.browsers.map(browser => Object.freeze({
        browserId: browser.browserId,
        activeTabId: browser.activeTabId,
        tabs: Object.freeze(browser.tabs.map(tab => Object.freeze({ tabId: tab.tabId } satisfies BrowserWorkspaceTabRecord))),
      }))),
    }))),
  })
}

export default BrowserWorkspaceBinder
