import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BrowserProfileName, BrowserRuntimeError, BrowserTabId } from '@deepseek-ai/dsh-browser-runtime'
import BrowserRuntimeDeterministic from '@deepseek-ai/dsh-browser-runtime-deterministic'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import BrowserWorkspaceBinder from '@deepseek-ai/dsh-browser-workspace'
import * as BrowserWorkspaceInvariant from '../src/invariant.ts'
import { EMPTY_BROWSER_WORKSPACE, foldBrowserWorkspace } from '../src/fold.ts'
import { listBrowserWorkspacePages } from '../src/pages.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'workspace/session-archived'(sessionId: SessionId): Promise<void> | void
  }
}

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PAGES = [
  { url: 'https://alpha.test/', title: 'Alpha', text: 'alpha', screenshotPngBase64: PNG_1X1 },
  { url: 'https://beta.test/', title: 'Beta', text: 'beta', screenshotPngBase64: PNG_1X1 },
]

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
  await ctx.plugin(BrowserWorkspaceBinder)
  return ctx
}

describe('Session-owned Browser Workspace', () => {
  it('starts empty independently per Session', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-a'))
    const second = ctx.sessions.create(SessionId('session-b'))
    expect(ctx.browserWorkspace.snapshot(first)).toEqual(EMPTY_BROWSER_WORKSPACE)
    expect(ctx.sessionProjections.snapshot(first).values.browserWorkspace).toEqual(EMPTY_BROWSER_WORKSPACE)
    expect(ctx.browserWorkspace.snapshot(second)).toEqual(EMPTY_BROWSER_WORKSPACE)
    expect(foldBrowserWorkspace(first.snapshotEvents())).toEqual(ctx.browserWorkspace.snapshot(first))
  })

  it('lets one Session own multiple Profiles, instances, and tabs without exposing another Session', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-a'))
    const second = ctx.sessions.create(SessionId('session-b'))

    const work = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })
    const personal = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('personal'),
    })
    const secondTab = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('work'),
      attach: { kind: 'browser', workspaceId: work.target.workspaceId, browserId: work.target.browserId },
    })
    const secondBrowser = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('work'),
      attach: { kind: 'workspace', workspaceId: work.target.workspaceId },
    })
    expect(secondTab.target.workspaceId).toBe(work.target.workspaceId)
    expect(secondTab.target.browserId).toBe(work.target.browserId)
    expect(secondTab.target.tabId).not.toBe(work.target.tabId)
    expect(secondBrowser.target.workspaceId).toBe(work.target.workspaceId)
    expect(secondBrowser.target.browserId).not.toBe(work.target.browserId)

    await ctx.browserWorkspace.navigate({
      session: first,
      target: work.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    const focusedTab = await ctx.browserWorkspace.navigate({
      session: first,
      target: secondTab.target,
      expectedRevision: 0,
      url: 'https://beta.test/',
    })
    const focused = await ctx.browserWorkspace.focus({ session: first, target: secondTab.target, expectedRevision: focusedTab.revision })
    await ctx.browserWorkspace.focus({ session: first, target: secondTab.target, expectedRevision: focused.revision })
    await expect(ctx.browserWorkspace.screenshot({ session: first, target: secondTab.target }))
      .resolves.toMatchObject({ target: secondTab.target, mediaType: 'image/png' })

    const other = await ctx.browserWorkspace.create({ session: second, profile: 'temporary' })
    await ctx.browserWorkspace.navigate({
      session: second,
      target: other.target,
      expectedRevision: 0,
      url: 'https://beta.test/',
    })

    const firstSnapshot = ctx.browserWorkspace.snapshot(first)
    expect(firstSnapshot.workspaces).toHaveLength(2)
    expect(firstSnapshot.activeWorkspaceId).toBe(work.target.workspaceId)
    const workSpace = firstSnapshot.workspaces.find(item => item.workspaceId === work.target.workspaceId)
    expect(workSpace?.profileId).toBe(work.target.profileId)
    expect(workSpace?.browsers).toHaveLength(2)
    expect(workSpace?.activeBrowserId).toBe(work.target.browserId)
    expect(workSpace?.browsers[0]?.tabs.map(tab => tab.tabId)).toEqual([work.target.tabId, secondTab.target.tabId])
    expect(workSpace?.browsers[0]?.activeTabId).toBe(secondTab.target.tabId)
    expect(firstSnapshot.workspaces.some(item => item.workspaceId === personal.target.workspaceId)).toBe(true)
    expect(JSON.stringify(firstSnapshot)).not.toContain(other.target.tabId)

    const secondSnapshot = ctx.browserWorkspace.snapshot(second)
    expect(secondSnapshot.workspaces).toHaveLength(1)
    expect(secondSnapshot.workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: other.target.tabId, revision: 1, url: 'https://beta.test/' },
    ])
    expect(JSON.stringify(secondSnapshot)).not.toContain(work.target.tabId)

    await expect(ctx.browserWorkspace.observe({ session: second, target: work.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.create({
      session: second,
      profile: 'persistent',
      name: BrowserProfileName('work'),
      attach: { kind: 'browser', workspaceId: work.target.workspaceId, browserId: work.target.browserId },
    })).rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.create({
      session: first,
      profile: 'temporary',
      attach: { kind: 'workspace', workspaceId: work.target.workspaceId.replace('workspace', 'missing') as typeof work.target.workspaceId },
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })
    await expect(ctx.browserWorkspace.focus({
      session: first,
      target: {
        profileId: work.target.profileId,
        workspaceId: work.target.workspaceId,
        browserId: work.target.browserId,
        tabId: BrowserTabId('missing-tab'),
      },
      expectedRevision: 0,
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })

    await ctx.browserWorkspace.close({ session: first, target: work.target, expectedRevision: 1 })
    const afterInactiveClose = ctx.browserWorkspace.snapshot(first)
    const remainingWork = afterInactiveClose.workspaces.find(item => item.workspaceId === work.target.workspaceId)
    expect(remainingWork?.browsers[0]?.tabs).toEqual([
      { tabId: secondTab.target.tabId, revision: 3, url: 'https://beta.test/' },
    ])
    expect(remainingWork?.browsers[0]?.activeTabId).toBe(secondTab.target.tabId)
    await ctx.browserWorkspace.close({ session: first, target: secondTab.target, expectedRevision: focused.revision + 1 })
    const afterBrowserClose = ctx.browserWorkspace.snapshot(first)
    const remainingAfterBrowser = afterBrowserClose.workspaces.find(item => item.workspaceId === work.target.workspaceId)
    expect(remainingAfterBrowser?.browsers).toHaveLength(1)
    expect(remainingAfterBrowser?.activeBrowserId).toBe(secondBrowser.target.browserId)
  })

  it('reuses the shared Profile across Sessions without isolating storage', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-shared-a'))
    const second = ctx.sessions.create(SessionId('session-shared-b'))
    const a = await ctx.browserWorkspace.create({ session: first, profile: 'shared' })
    await ctx.browserWorkspace.navigate({
      session: first,
      target: a.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    const b = await ctx.browserWorkspace.create({ session: second, profile: 'shared' })
    expect(b.target.profileId).toBe(a.target.profileId)
    expect(b.target.workspaceId).not.toBe(a.target.workspaceId)
    expect(b.chrome).toMatchObject({
      kind: 'shared',
      partition: a.chrome.partition,
    })
    expect(b.storage.cookies).toBe('profile=shared')
    expect(ctx.browserWorkspace.snapshot(first).workspaces[0]?.profileId).toBe(a.target.profileId)
    expect(ctx.browserWorkspace.snapshot(second).workspaces[0]?.profileId).toBe(a.target.profileId)
  })

  it('serializes create and reuses a matching retained Profile inside one Session', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-profile-reuse'))
    const [firstWork, secondWork] = await Promise.all([
      ctx.browserWorkspace.create({
        session,
        profile: 'persistent',
        name: BrowserProfileName('work'),
      }),
      ctx.browserWorkspace.create({
        session,
        profile: 'persistent',
        name: BrowserProfileName('work'),
      }),
    ])
    expect(secondWork.target).toMatchObject({
      profileId: firstWork.target.profileId,
      workspaceId: firstWork.target.workspaceId,
      browserId: firstWork.target.browserId,
    })
    expect(secondWork.target.tabId).not.toBe(firstWork.target.tabId)

    const personal = await ctx.browserWorkspace.create({
      session,
      profile: 'persistent',
      name: BrowserProfileName('personal'),
    })
    expect(personal.target.browserId).not.toBe(firstWork.target.browserId)

    const firstShared = await ctx.browserWorkspace.create({ session, profile: 'shared' })
    const secondShared = await ctx.browserWorkspace.create({ session, profile: 'shared' })
    expect(secondShared.target.browserId).toBe(firstShared.target.browserId)

    const firstTemporary = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const secondTemporary = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    expect(secondTemporary.target.profileId).not.toBe(firstTemporary.target.profileId)
    expect(secondTemporary.target.browserId).not.toBe(firstTemporary.target.browserId)

    const pages = listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(session))
    expect(pages.map(page => page.target.tabId)).toEqual([
      firstWork.target.tabId,
      secondWork.target.tabId,
      personal.target.tabId,
      firstShared.target.tabId,
      secondShared.target.tabId,
      firstTemporary.target.tabId,
      secondTemporary.target.tabId,
    ])
    expect(pages.every(page => page.revision === 0)).toBe(true)
    expect(listBrowserWorkspacePages(undefined)).toEqual([])
    expect(listBrowserWorkspacePages(null)).toEqual([])
  })

  it('lets a forked Session reconstruct inherited Workspace ownership from the parent prefix', async () => {
    const ctx = await harness()
    const parent = ctx.sessions.create(SessionId('session-fork-parent'))
    const created = await ctx.browserWorkspace.create({ session: parent, profile: 'temporary' })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const parentSnapshot = ctx.browserWorkspace.snapshot(parent)
    const child = ctx.sessions.fork(parent, parent.snapshotEvents().at(-1)!.seq, SessionId('session-fork-child'))
    expect(ctx.browserWorkspace.snapshot(parent)).toEqual(parentSnapshot)
    expect(ctx.browserWorkspace.snapshot(child)).toEqual(parentSnapshot)
    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(child)).map(page => page.target))
      .toEqual([created.target])
    expect(child.ownEvents().some(event => event.type === 'browser/workspace')).toBe(false)
  })

  it('keeps parent live Runtime authority after a child inherits the Workspace snapshot', async () => {
    const ctx = await harness()
    const parent = ctx.sessions.create(SessionId('session-fork-parent-live'))
    const created = await ctx.browserWorkspace.create({ session: parent, profile: 'temporary' })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const child = ctx.sessions.fork(parent, parent.snapshotEvents().at(-1)!.seq, SessionId('session-fork-child-live'))
    await expect(ctx.browserWorkspace.observe({ session: parent, target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target })
    await expect(ctx.browserWorkspace.navigate({
      session: parent,
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://alpha.test/',
    })).resolves.toMatchObject({ status: 'open', target: created.target })
    await expect(ctx.browserWorkspace.observe({ session: child, target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.navigate({
      session: child,
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://beta.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.create({
      session: child,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: created.target.workspaceId, browserId: created.target.browserId },
    })).rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    const stranger = ctx.sessions.create(SessionId('session-fork-stranger'))
    await expect(ctx.browserWorkspace.observe({ session: stranger, target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    const closed = await ctx.browserWorkspace.close({
      session: parent,
      target: created.target,
      expectedRevision: 1,
    })
    expect(closed.status).toBe('closed')
    await expect(ctx.browserRuntime.observe({ target: created.target }))
      .resolves.toMatchObject({ status: 'closed' })
    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(child)).map(page => page.target))
      .toEqual([created.target])
  })

  it('does not let a child Session close the parent live target on dispose or cleanup', async () => {
    const ctx = await harness()
    const parent = ctx.sessions.create(SessionId('session-fork-parent-cleanup'))
    const created = await ctx.browserWorkspace.create({ session: parent, profile: 'temporary' })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const child = ctx.sessions.prepare(SessionId('session-fork-child-cleanup'), {
      seed: parent.snapshotEvents(),
      inheritedEventCount: parent.seq,
      meta: { parentSession: parent.id, isSeeded: true },
    })
    const detachChild = ctx.sessions.enter(child)
    ctx.sessions.announce(child)
    expect(ctx.browserWorkspace.snapshot(child)).toEqual(ctx.browserWorkspace.snapshot(parent))
    await ctx.browserWorkspace.cleanup(child)
    await expect(ctx.browserRuntime.observe({ target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target })
    await expect(ctx.browserWorkspace.observe({ session: parent, target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target })
    detachChild()
    await expect.poll(() => ctx.browserRuntime.observe({ target: created.target }))
      .toMatchObject({ status: 'open', target: created.target })
  })

  it('closes parent live tabs on parent dispose without giving the child Runtime authority', async () => {
    const ctx = await harness()
    const parent = ctx.sessions.prepare(SessionId('session-fork-parent-dispose'))
    const detachParent = ctx.sessions.enter(parent)
    ctx.sessions.announce(parent)
    const created = await ctx.browserWorkspace.create({ session: parent, profile: 'temporary' })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const child = ctx.sessions.create(SessionId('session-fork-child-dispose'), {
      seed: parent.snapshotEvents(),
      inheritedEventCount: parent.seq,
      meta: { parentSession: parent.id, isSeeded: true },
    })
    detachParent()
    await expect.poll(() => ctx.browserRuntime.observe({ target: created.target })).toMatchObject({ status: 'closed' })
    await expect(ctx.browserWorkspace.observe({ session: child, target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })
    await expect(ctx.browserWorkspace.create({
      session: child,
      profile: 'temporary',
      attach: { kind: 'workspace', workspaceId: created.target.workspaceId },
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })
  })

  it('restores display after Binder reconstruction without inventing a live owner', async () => {
    const before = await harness()
    const parent = before.sessions.create(SessionId('session-fork-parent-restart'))
    const created = await before.browserWorkspace.create({ session: parent, profile: 'temporary' })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const child = before.sessions.fork(parent, parent.snapshotEvents().at(-1)!.seq, SessionId('session-fork-child-restart'))
    const after = await harness()
    const restoredParent = after.sessions.create(SessionId('session-fork-parent-restart'), {
      seed: parent.snapshotEvents(),
    })
    const restoredChild = after.sessions.create(SessionId('session-fork-child-restart'), {
      seed: child.snapshotEvents(),
      inheritedEventCount: child.inheritedEventCount,
      meta: { parentSession: parent.id, isSeeded: true },
    })
    expect(listBrowserWorkspacePages(after.browserWorkspace.snapshot(restoredParent)).map(page => page.target))
      .toEqual([created.target])
    expect(listBrowserWorkspacePages(after.browserWorkspace.snapshot(restoredChild)).map(page => page.target))
      .toEqual([created.target])
    await expect(after.browserWorkspace.observe({ session: restoredParent, target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })
    await expect(after.browserWorkspace.observe({ session: restoredChild, target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })
    const recreated = await after.browserWorkspace.create({ session: restoredParent, profile: 'temporary' })
    await expect(after.browserWorkspace.observe({ session: restoredParent, target: recreated.target }))
      .resolves.toMatchObject({ status: 'open', target: recreated.target })
    await expect(after.browserWorkspace.observe({ session: restoredChild, target: recreated.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
  })

  it('restores live owners from this Session ownEvents after Binder HMR while Runtime pages remain', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
    const fiber = await ctx.plugin(BrowserWorkspaceBinder)
    const parent = ctx.sessions.create(SessionId('session-hmr-parent'))
    const created = await ctx.browserWorkspace.create({
      session: parent,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const child = ctx.sessions.fork(parent, parent.snapshotEvents().at(-1)!.seq, SessionId('session-hmr-child'))
    await fiber.dispose()
    await ctx.plugin(BrowserWorkspaceBinder)
    await expect(ctx.browserRuntime.observe({ target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target })
    await expect(ctx.browserWorkspace.observe({ session: parent, target: created.target }))
      .resolves.toMatchObject({ status: 'open', target: created.target })
    await expect(ctx.browserWorkspace.observe({ session: child, target: created.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    const extra = await ctx.browserWorkspace.create({
      session: parent,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })
    expect(extra.target.browserId).toBe(created.target.browserId)
    expect(extra.target.tabId).not.toBe(created.target.tabId)
    await expect(ctx.browserWorkspace.observe({ session: parent, target: extra.target }))
      .resolves.toMatchObject({ status: 'open', target: extra.target })
    await expect(ctx.browserWorkspace.observe({ session: child, target: extra.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    ctx.emit('browser/runtime-state', {
      status: 'unavailable',
      target: created.target,
      revision: created.revision + 1,
      reason: 'crashed',
      reconnecting: true,
    })
    expect(ctx.browserWorkspace.snapshot(parent).workspaces[0]?.browsers[0]?.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tabId: created.target.tabId, revision: created.revision + 1 }),
      ]),
    )
    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(child))[0]?.revision)
      .toBe(created.revision)
  })

  it('does not treat a child last-wins snapshot as adopt of inherited parent tabs after Binder HMR', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
    const fiber = await ctx.plugin(BrowserWorkspaceBinder)
    const parent = ctx.sessions.create(SessionId('session-hmr-diff-parent'))
    const parentTab = await ctx.browserWorkspace.create({ session: parent, profile: 'temporary' })
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const child = ctx.sessions.fork(parent, parent.snapshotEvents().at(-1)!.seq, SessionId('session-hmr-diff-child'))
    const childTab = await ctx.browserWorkspace.create({ session: child, profile: 'temporary' })
    expect(foldBrowserWorkspace(child.ownEvents()).workspaces.some(workspace => (
      workspace.browsers.some(browser => browser.tabs.some(tab => tab.tabId === parentTab.target.tabId))
    ))).toBe(true)
    await fiber.dispose()
    await ctx.plugin(BrowserWorkspaceBinder)
    await expect(ctx.browserWorkspace.observe({ session: parent, target: parentTab.target }))
      .resolves.toMatchObject({ status: 'open', target: parentTab.target })
    await expect(ctx.browserWorkspace.observe({ session: child, target: parentTab.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.observe({ session: child, target: childTab.target }))
      .resolves.toMatchObject({ status: 'open', target: childTab.target })
    await expect(ctx.browserWorkspace.observe({ session: parent, target: childTab.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await ctx.browserWorkspace.cleanup(child)
    await expect(ctx.browserRuntime.observe({ target: parentTab.target }))
      .resolves.toMatchObject({ status: 'open', target: parentTab.target })
    await expect(ctx.browserRuntime.observe({ target: childTab.target }))
      .resolves.toMatchObject({ status: 'closed' })
  })

  it('refuses to invent a live owner when two Sessions ownEvents claim the same tab', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
    const fiber = await ctx.plugin(BrowserWorkspaceBinder)
    const first = ctx.sessions.create(SessionId('session-claim-first'))
    const created = await ctx.browserWorkspace.create({ session: first, profile: 'temporary' })
    const second = ctx.sessions.create(SessionId('session-claim-second'))
    second.append('browser/workspace', ctx.browserWorkspace.snapshot(first), { ignorable: true })
    await fiber.dispose()
    await expect(ctx.plugin(BrowserWorkspaceBinder)).rejects.toMatchObject({
      code: 'BROWSER_TRANSFER_UNSUPPORTED',
    })
    expect(created.target.tabId).toBeTypeOf('string')
  })

  it('recreates a retained Profile after Runtime restart leaves a durable target behind', async () => {
    const before = await harness()
    const originalSession = before.sessions.create(SessionId('session-before-restart'))
    await before.browserWorkspace.create({
      session: originalSession,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })

    const after = await harness()
    const restoredSession = after.sessions.create(SessionId('session-after-restart'), {
      seed: originalSession.snapshotEvents(),
    })
    const recreated = await after.browserWorkspace.create({
      session: restoredSession,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })

    await expect(after.browserWorkspace.observe({
      session: restoredSession,
      target: recreated.target,
    })).resolves.toMatchObject({ status: 'open' })
    expect(listBrowserWorkspacePages(after.browserWorkspace.snapshot(restoredSession))).toEqual([
      expect.objectContaining({ target: recreated.target, revision: recreated.revision }),
    ])
  })

  it('drops missing and closed retained pages but propagates other observe failures', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-retained-states'))
    const first = await ctx.browserWorkspace.create({
      session,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })
    await ctx.browserRuntime.close({ target: first.target, expectedRevision: first.revision })
    const observe = ctx.browserRuntime.observe.bind(ctx.browserRuntime)
    ctx.browserRuntime.observe = async () => {
      throw new BrowserRuntimeError('missing', 'BROWSER_NOT_FOUND')
    }
    const afterMissing = await ctx.browserWorkspace.create({
      session,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })

    ctx.browserRuntime.observe = observe
    await ctx.browserRuntime.close({ target: afterMissing.target, expectedRevision: afterMissing.revision })
    const afterClosed = await ctx.browserWorkspace.create({
      session,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })
    expect(afterClosed.target.tabId).not.toBe(afterMissing.target.tabId)

    ctx.browserRuntime.observe = async () => {
      throw new BrowserRuntimeError('protocol', 'BROWSER_PROTOCOL')
    }
    await expect(ctx.browserWorkspace.create({
      session,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })).rejects.toMatchObject({ code: 'BROWSER_PROTOCOL' })
  })

  it('restores one Session Workspace after reload and closes leftover tabs on Session disposal', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-a'))
    const created = await ctx.browserWorkspace.create({ session: first, profile: 'temporary' })
    const extra = await ctx.browserWorkspace.create({
      session: first,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: created.target.workspaceId, browserId: created.target.browserId },
    })
    await ctx.browserWorkspace.navigate({
      session: first,
      target: extra.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    const logged = first.snapshotEvents().filter(event => event.type === 'browser/workspace')
    expect(logged.length).toBeGreaterThan(0)
    expect(logged.every(event => event.ignorable === true)).toBe(true)

    const replayed = foldBrowserWorkspace(first.snapshotEvents())
    expect(replayed).toEqual(ctx.browserWorkspace.snapshot(first))
    expect(ctx.sessionProjections.snapshot(first).values.browserWorkspace).toEqual(replayed)

    const restoredCtx = new Context()
    await restoredCtx.plugin(SessionStore)
    await restoredCtx.plugin(SessionProjectionRegistry)
    await restoredCtx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
    await restoredCtx.plugin(BrowserWorkspaceBinder)
    const restored = restoredCtx.sessions.create(SessionId('session-a-restored'), { seed: first.snapshotEvents() })
    expect(restoredCtx.browserWorkspace.snapshot(restored)).toEqual(replayed)
    expect(restoredCtx.sessionProjections.snapshot(restored).values.browserWorkspace).toEqual(replayed)

    const sibling = await ctx.browserWorkspace.create({
      session: first,
      profile: 'temporary',
      attach: { kind: 'workspace', workspaceId: created.target.workspaceId },
    })
    await ctx.browserWorkspace.focus({ session: first, target: extra.target, expectedRevision: 1 })
    await ctx.browserWorkspace.close({ session: first, target: extra.target, expectedRevision: 2 })
    const afterClose = ctx.browserWorkspace.snapshot(first)
    expect(afterClose.workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, revision: 0 },
    ])
    expect(afterClose.workspaces[0]?.browsers[0]?.activeTabId).toBe(created.target.tabId)
    await ctx.browserWorkspace.close({ session: first, target: sibling.target, expectedRevision: 0 })
    await ctx.browserWorkspace.close({ session: first, target: created.target, expectedRevision: 0 })
    expect(ctx.browserWorkspace.snapshot(first).workspaces).toEqual([])
    expect(ctx.browserWorkspace.snapshot(first).activeWorkspaceId).toBeNull()

  })

  it('closes leftover live tabs but retains recovery records when the owning Session leaves the store', async () => {
    const ctx = await harness()
    const leftover = ctx.sessions.prepare(SessionId('session-cleanup'))
    const detach = ctx.sessions.enter(leftover)
    ctx.sessions.announce(leftover)
    const created = await ctx.browserWorkspace.create({ session: leftover, profile: 'temporary' })
    const live = await ctx.browserWorkspace.navigate({
      session: leftover,
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://alpha.test/',
    })
    detach()
    await expect.poll(() => ctx.browserRuntime.observe({ target: live.target })).toMatchObject({ status: 'closed' })
    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(leftover))).toEqual([
      { target: live.target, revision: live.revision, url: 'https://alpha.test/' },
    ])

    const observer = ctx.browserRuntime.observe.bind(ctx.browserRuntime)
    const releaseFailure = ctx.sessions.prepare(SessionId('session-release-failure'))
    const detachReleaseFailure = ctx.sessions.enter(releaseFailure)
    ctx.sessions.announce(releaseFailure)
    const releasePage = await ctx.browserWorkspace.create({ session: releaseFailure, profile: 'temporary' })
    let markReleaseAttempt: (() => void) | undefined
    const releaseAttempted = new Promise<void>((resolve) => { markReleaseAttempt = resolve })
    ctx.browserRuntime.observe = async (request) => {
      if (request.target.tabId === releasePage.target.tabId) {
        markReleaseAttempt?.()
        throw new Error('release observe failed')
      }
      return observer(request)
    }
    detachReleaseFailure()
    await releaseAttempted
    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(releaseFailure)))
      .toEqual([{ target: releasePage.target, revision: releasePage.revision }])

    const failing = ctx.sessions.create(SessionId('session-failing-cleanup'))
    const failingPage = await ctx.browserWorkspace.create({ session: failing, profile: 'temporary' })
    ctx.browserRuntime.observe = async (request) => {
      if (request.target.tabId === failingPage.target.tabId) throw new Error('cleanup observe failed')
      return observer(request)
    }
    await expect(ctx.browserWorkspace.cleanup(failing))
      .rejects.toThrow('failed to close every archived Session tab')
    expect(ctx.browserWorkspace.snapshot(failing).workspaces).toHaveLength(1)
    ctx.browserRuntime.observe = observer
    await ctx.browserWorkspace.cleanup(failing)
    expect(ctx.browserWorkspace.snapshot(failing)).toEqual(EMPTY_BROWSER_WORKSPACE)

    const alreadyClosed = ctx.sessions.create(SessionId('session-already-closed'))
    alreadyClosed.append('browser/workspace', {
      activeWorkspaceId: live.target.workspaceId,
      workspaces: [{
        workspaceId: live.target.workspaceId,
        profileId: live.target.profileId,
        activeBrowserId: live.target.browserId,
        browsers: [{
          browserId: live.target.browserId,
          activeTabId: live.target.tabId,
          tabs: [{ tabId: live.target.tabId, revision: 0 }],
        }],
      }],
    }, { ignorable: true })
    await ctx.browserWorkspace.cleanup(alreadyClosed)
    expect(ctx.browserWorkspace.snapshot(alreadyClosed).workspaces).toEqual([])
  })

  it('closes every live tab when its Session is archived', async () => {
    const ctx = await harness()
    await expect(ctx.parallel('workspace/session-archived', SessionId('missing-session')))
      .resolves.toBeUndefined()
    const session = ctx.sessions.create(SessionId('session-archive-cleanup'))
    const first = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const second = await ctx.browserWorkspace.create({ session, profile: 'shared' })

    await ctx.parallel('workspace/session-archived', session.id)

    await expect(ctx.browserRuntime.observe({ target: first.target }))
      .resolves.toMatchObject({ status: 'closed' })
    await expect(ctx.browserRuntime.observe({ target: second.target }))
      .resolves.toMatchObject({ status: 'closed' })
    expect(ctx.browserWorkspace.snapshot(session)).toEqual(EMPTY_BROWSER_WORKSPACE)
  })

  it('records unavailable Runtime revisions without replacing remembered page facts', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-unavailable'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    ctx.browserRuntime.observe = async () => ({
      status: 'unavailable',
      target: created.target,
      revision: created.revision + 1,
      reason: 'unhealthy',
      reconnecting: true,
    })

    await expect(ctx.browserWorkspace.observe({ session, target: created.target }))
      .resolves.toMatchObject({ status: 'unavailable', revision: created.revision + 1 })
    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(session)))
      .toEqual([{ target: created.target, revision: created.revision + 1 }])
  })

  it('persists the last non-blank page URL for restart recovery', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-url-recovery'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'shared' })
    const navigated = await ctx.browserWorkspace.navigate({
      session,
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://alpha.test/',
    })

    expect(listBrowserWorkspacePages(ctx.browserWorkspace.snapshot(session))).toEqual([
      { target: created.target, revision: navigated.revision, url: 'https://alpha.test/' },
    ])
  })

  it('focuses and closes a background tab with that tab\'s listed revision', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-tab-revision'))
    const first = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const second = await ctx.browserWorkspace.create({
      session,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: first.target.workspaceId, browserId: first.target.browserId },
    })
    await ctx.browserWorkspace.navigate({
      session, target: first.target, expectedRevision: 0, url: 'https://alpha.test/',
    })
    await ctx.browserWorkspace.navigate({
      session, target: second.target, expectedRevision: 0, url: 'https://beta.test/',
    })
    const listed = ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs
    expect(listed).toEqual([
      { tabId: first.target.tabId, revision: 1, url: 'https://alpha.test/' },
      { tabId: second.target.tabId, revision: 1, url: 'https://beta.test/' },
    ])
    const firstRevision = listed?.[0]?.revision
    const secondRevision = listed?.[1]?.revision
    if (firstRevision === undefined || secondRevision === undefined) {
      throw new Error('expected listed per-tab revisions')
    }
    const focused = await ctx.browserWorkspace.focus({
      session, target: first.target, expectedRevision: firstRevision,
    })
    expect(focused.revision).toBe(2)
    await expect(ctx.browserWorkspace.close({
      session, target: second.target, expectedRevision: secondRevision,
    })).resolves.toMatchObject({ status: 'closed', revision: 2 })

    const leftover = await ctx.browserWorkspace.create({
      session,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: first.target.workspaceId, browserId: first.target.browserId },
    })
    await ctx.browserRuntime.close({ target: leftover.target, expectedRevision: leftover.revision })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs.some(
      tab => tab.tabId === leftover.target.tabId,
    )).toBe(true)
    await expect(ctx.browserWorkspace.observe({ session, target: leftover.target }))
      .resolves.toMatchObject({ status: 'closed', revision: leftover.revision + 1 })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs.some(
      tab => tab.tabId === leftover.target.tabId,
    )).toBe(false)
  })

  it('records a Runtime-internal revision bump on an owned unclosed tab', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-runtime-bump'))
    const first = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const second = await ctx.browserWorkspace.create({
      session,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: first.target.workspaceId, browserId: first.target.browserId },
    })
    const bumped = await ctx.browserRuntime.navigate({
      target: first.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    expect(bumped.revision).toBe(1)
    const listed = ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs
    expect(listed).toEqual([
      { tabId: first.target.tabId, revision: 1, url: 'https://alpha.test/' },
      { tabId: second.target.tabId, revision: 0 },
    ])
    const firstRevision = listed?.[0]?.revision
    const secondRevision = listed?.[1]?.revision
    if (firstRevision === undefined || secondRevision === undefined) {
      throw new Error('expected listed per-tab revisions')
    }
    await expect(ctx.browserWorkspace.focus({
      session, target: first.target, expectedRevision: firstRevision,
    })).resolves.toMatchObject({ revision: 2, focused: true })
    await expect(ctx.browserWorkspace.close({
      session, target: second.target, expectedRevision: secondRevision,
    })).resolves.toMatchObject({ status: 'closed', revision: 1 })
  })

  it('ignores Runtime-state for unowned or already-closed tabs', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-runtime-state-filter'))
    const owned = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const orphan = await ctx.browserRuntime.create({ profile: 'temporary' })
    ctx.emit('browser/runtime-state', {
      status: 'unavailable',
      target: owned.target,
      revision: 3,
      reason: 'crashed',
      reconnecting: true,
    })
    ctx.emit('browser/runtime-state', {
      status: 'closed',
      target: owned.target,
      revision: 4,
    })
    ctx.emit('browser/runtime-state', {
      status: 'unavailable',
      target: orphan.target,
      revision: 1,
      reason: 'reconnect-failed',
      reconnecting: false,
    })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: owned.target.tabId, revision: 3 },
    ])
    expect(JSON.stringify(ctx.browserWorkspace.snapshot(session))).not.toContain(orphan.target.tabId)
  })

  it('disposes its invariant companion', async () => {
    const ctx = await harness()
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(BrowserWorkspaceInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })

  it('persists synthetic input revisions on the same Session identities', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-control'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const navigated = await ctx.browserWorkspace.navigate({
      session,
      target: created.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, revision: 1, url: 'https://alpha.test/' },
    ])

    const inputted = await ctx.browserWorkspace.input({
      session,
      target: created.target,
      expectedRevision: navigated.revision,
      text: 'Agent input',
    })
    expect(inputted).toMatchObject({
      text: 'Agent input',
      target: created.target,
    })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, revision: 2, url: 'https://alpha.test/' },
    ])
    await expect(ctx.browserWorkspace.navigate({
      session,
      target: created.target,
      expectedRevision: navigated.revision,
      url: 'https://beta.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_REVISION_CONFLICT' })

    const replayed = foldBrowserWorkspace(session.snapshotEvents())
    expect(replayed.workspaces[0]?.browsers[0]?.tabs[0]?.revision).toBe(inputted.revision)
  })

  it('adapts Remote methods onto the Session-bound verbs', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-remote'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const binder = ctx.browserWorkspace
    const opened = await binder.remoteNavigate(
      session.id, created.target, created.revision, 'https://alpha.test/',
    )
    await expect(binder.remoteObserve(session.id, created.target)).resolves.toMatchObject({ status: 'open' })
    await expect(binder.remoteScreenshot(session.id, created.target)).resolves.toMatchObject({
      target: created.target,
    })
    const focused = await binder.remoteFocus(session.id, created.target, opened.revision)
    const navigated = await binder.remoteNavigate(
      session.id, created.target, focused.revision, 'https://beta.test/',
    )
    expect(navigated.url).toBe('https://beta.test/')
    const inputted = await binder.remoteInput(session.id, created.target, navigated.revision, {
      url: 'https://beta.test/',
      text: 'typed',
    })
    const textOnly = await binder.remoteInput(session.id, created.target, inputted.revision, { text: 'again' })
    const urlOnly = await binder.remoteInput(session.id, created.target, textOnly.revision, { url: 'https://alpha.test/' })
    expect(() => binder.remoteInput(session.id, created.target, urlOnly.revision, {}))
      .toThrow(/requires url or text/)
    await expect(binder.remoteClose(session.id, created.target, urlOnly.revision))
      .resolves.toMatchObject({ status: 'closed' })
    expect(() => binder.remoteObserve(SessionId('missing'), created.target))
      .toThrow(/not owned by this Session/)
  })

  it('creates a Session-owned tab through the Remote create verb', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-remote-create'))
    const created = await ctx.browserWorkspace.remoteCreate(session.id, { profile: 'temporary' })
    expect(created.status).toBe('open')
    expect(ctx.browserWorkspace.snapshot(session).workspaces).toHaveLength(1)
    const sibling = await ctx.browserWorkspace.remoteCreate(session.id, {
      profile: 'temporary',
      attach: {
        kind: 'browser',
        workspaceId: created.target.workspaceId,
        browserId: created.target.browserId,
      },
    })
    expect(sibling.target.workspaceId).toBe(created.target.workspaceId)
    const named = await ctx.browserWorkspace.remoteCreate(session.id, {
      profile: 'persistent',
      name: 'work',
    })
    expect(named.chrome.kind).toBe('persistent')
  })
})
