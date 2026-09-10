// @vitest-environment jsdom
/** Details-panel document focus: markdown / restricted html / bare file tab, seat owner currency, and store write-and-clear. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { EMPTY_CONVERSATION_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { DetailsDocumentFocus } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { DetailsDocumentOwnerProps, DetailsSlotProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { createChatStore } from '../src/client/stores.ts'
import { DetailsPanel } from '../src/client/details/DetailsPanel.tsx'
import { zh } from '../src/client/locale.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

const t = makeTranslate(zh, commonZh)
const SID = 's1' as SessionId
const SessionProviderStub: SessionProviderComponent = ({ children }) => children

function renderDocumentSeatProbe(owners?: DetailsDocumentOwnerProps[]): DetailsSlotProps['renderSlot'] {
  return (key, owner) => {
    if (key === 'conversation.details.document') owners?.push(owner as unknown as DetailsDocumentOwnerProps)
    return <div data-testid="document-details-seat" />
  }
}

function renderUnoccupiedFallback(): DetailsSlotProps['renderSlot'] {
  return (_key, _owner, opts) => opts?.fallback ?? null
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function sessionSnapshot(): SessionSnapshot {
  return {
    sessionId: SID,
    queue: [],
    pendingSubmissions: [],
    running: false,
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    subagent: null,
    promptRoute: 'session',
    lastAgentError: null,
    promptAttempted: true,
    awaitingFirstTurn: false,
  }
}

function renderFocused(
  document: DetailsDocumentFocus,
  renderSlot: DetailsSlotProps['renderSlot'] = renderUnoccupiedFallback(),
) {
  const chat = createChatStore().create()
  chat.actions.focusDocument(document)
  const emptyList = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  const emptyWorkspaces = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return render(
    <DetailsPanel
      SessionProvider={SessionProviderStub}
      renderSlot={renderSlot}
      sessionId={SID}
      useSession={bindSnapshotSelector(createSnapshotStore(sessionSnapshot()))}
      useChat={bindSnapshotSelector(createSnapshotStore(chatSnapshotFixture()))}
      useConversation={bindSnapshotSelector(createSnapshotStore(EMPTY_CONVERSATION_SNAPSHOT))}
      useTrajectory={(() => { throw new Error('unused') })}
      useSessions={bindSnapshotSelector(emptyList)}
      useSessionPendingInteraction={bindSnapshotSelector(
        createSnapshotStore<SessionPendingInteractionSnapshot>(new Map()),
      )}
      useWorkspaces={bindSnapshotSelector(emptyWorkspaces)}
      useProjection={(() => undefined)}
      useInput={(() => { throw new Error('unused') })}
      inputActions={{
        setDraft: () => {},
        addImages: () => true,
        removeImage: () => {},
        pruneImages: () => {},
        submit: () => {},
        addTextAnnotation: () => 'annotation-1' as never,
        updateTextAnnotation: () => {},
        removeTextAnnotation: () => {},
        discardTextAnnotations: () => {},
        addImagePin: () => 'annotation-2' as never,
        updateImagePin: () => {},
      }}
      useStore={bindSnapshotSelector(chat)}
      actions={chat.actions}
      closeDetails={vi.fn()}
      t={t}
    />,
  )
}

describe('details document focus', () => {
  it('renders a focused markdown document through the markdown renderer', () => {
    const view = renderFocused({
      path: 'docs/roster.md', filename: 'roster.md', from: '王小明',
      content: '# 成员名单\n\n张三 · 管理员',
    })
    expect(view.container.querySelector('h1')?.textContent).toBe('成员名单')
    expect(view.container.textContent).toContain('张三 · 管理员')
  })

  it('renders a focused html document as the sandboxed restricted preview', () => {
    const view = renderFocused({
      path: 'reports/brief.html', filename: 'brief.html', from: '王小明',
      content: '<meta http-equiv="refresh" content="0;url=https://example.invalid"><a href="https://example.invalid">决策简报</a><script>globalThis.compromised = true</script>',
    })
    expect(view.container.textContent).toContain('受限预览 · 脚本与网络请求已禁用')
    const frame = view.container.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute('sandbox')).toBe('')
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(frame?.getAttribute('srcdoc')).toContain("default-src 'none'")
    expect(frame?.getAttribute('srcdoc')).toContain('决策简报')
    expect(frame?.getAttribute('srcdoc')).not.toContain('<meta http-equiv="refresh"')
    expect(frame?.getAttribute('srcdoc')).not.toContain('href=')
    expect(frame?.getAttribute('srcdoc')).not.toContain('<script>')
  })

  it('renders an unrenderable document as a bare file tab without a download affordance', () => {
    const view = renderFocused({
      path: 'reports/activity.csv', filename: 'activity.csv', from: '王小明',
    })
    expect(view.container.textContent).toContain('activity.csv')
    expect(view.container.textContent).toContain('来自 王小明')
    expect(view.container.querySelector('a')).toBeNull()
    expect(view.container.querySelector('button[class*="download"]')).toBeNull()
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('hands the focused document to the document seat as the owner currency', () => {
    const owners: DetailsDocumentOwnerProps[] = []
    const focus: DetailsDocumentFocus = { path: 'docs/plan.md', filename: 'plan.md', from: '李四' }
    const view = renderFocused(focus, renderDocumentSeatProbe(owners))
    expect(view.container.querySelector('[data-testid="document-details-seat"]')).not.toBeNull()
    expect(owners).toHaveLength(1)
    expect(owners[0]?.document).toBe(focus)
  })

  it('clears the focus when the panel closes and when a tool is selected', () => {
    const chat = createChatStore().create()
    chat.actions.focusDocument({ path: 'docs/plan.md', filename: 'plan.md', from: '李四' })
    expect(chat.store.getSnapshot().documentFocus).not.toBeNull()
    chat.actions.clearDocumentFocus()
    expect(chat.store.getSnapshot().documentFocus).toBeNull()
    chat.actions.focusDocument({ path: 'docs/plan.md', filename: 'plan.md', from: '李四' })
    chat.actions.select({ turnSeq: 2, stepSeq: 1, callId: 'c1', toolName: 'read' })
    expect(chat.store.getSnapshot().documentFocus).toBeNull()
  })
})
