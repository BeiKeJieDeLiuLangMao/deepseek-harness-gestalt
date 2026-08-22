// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, type ConversationSnapshot, type SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  createCompanionSession,
  groupCompanionSessions,
  pageCompanionHistory,
  projectMobileCompanionHistory,
  type CompanionSessionSummary,
} from '../src/companion-history.ts'
import { MobileBrowse } from '../src/MobileBrowse.tsx'

afterEach(() => { cleanup() })

const browsePresentation = {
  locale: 'zh' as const,
  theme: 'light' as const,
  loadImage: async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
}

function conversation(): ConversationSnapshot {
  return {
    sessionId: 's1' as SessionId,
    views: EMPTY_CONVERSATION_VIEWS,
    chat: EMPTY_CHAT_SNAPSHOT,
    nodes: [{ kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: 'hello' }], source: {} }],
    turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [], pending: [], queue: [],
    running: false, subagent: null, composerPhase: 'active', removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: false, lastAgentError: null,
  }
}

const history: readonly CompanionSessionSummary[] = [
  { id: 's1', title: 'Alpha', workspace: 'Work', summary: 'alpha summary', conversation: conversation() },
  { id: 's2', title: 'Beta', project: 'Tools', summary: 'beta summary' },
  { id: 's3', title: 'Gamma', summary: 'ungrouped summary' },
]

describe('Mobile Companion browse projection', () => {
  it('groups Workspace and project rows and leaves unlabeled Sessions in Ungrouped', () => {
    expect(groupCompanionSessions(history)).toEqual({
      groups: [
        { name: 'Work', sessions: [history[0]] },
        { name: 'Tools', sessions: [history[1]] },
      ],
      ungrouped: [history[2]],
    })
  })

  it('pages history at the phone ceiling and reports spill', () => {
    const many = Array.from({ length: COMPANION_HISTORY_PAGE_SIZE + 3 }, (_, index) => ({
      id: `id-${String(index)}`,
      title: `T${String(index)}`,
      summary: 'row',
    }))
    expect(pageCompanionHistory(many, 0).visible).toHaveLength(COMPANION_HISTORY_PAGE_SIZE)
    expect(pageCompanionHistory(many, 0).spilled).toBe(3)
    expect(pageCompanionHistory(many, 1).visible).toHaveLength(3)
    expect(pageCompanionHistory(many, 1).spilled).toBe(0)
  })

  it('projects Mobile history identically to Desktop-confirmed history', () => {
    expect(projectMobileCompanionHistory(history)).toEqual(history)
  })

  it('shows the selected Desktop, connection state, and opens a live transcript full-screen', () => {
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac', connection: 'online', sessions: history, ...browsePresentation,
    }))
    expect(screen.getByText('Studio Mac')).toBeTruthy()
    expect(screen.getByText('Remote Online')).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('Ungrouped')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(screen.getByText('hello')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.click(screen.getByRole('button', { name: /Gamma/ }))
    expect(screen.getByText('ungrouped summary')).toBeTruthy()
  })

  it('creates a Workspace Session or Ungrouped Session and ignores a repeated operation id', () => {
    const committed = new Set<string>()
    const workspace = createCompanionSession(history, committed, {
      operationId: 'op-work',
      title: 'New Work',
      workspace: 'Work',
      devicePrincipalId: 'device-1',
    })
    committed.add('op-work')
    expect(workspace.created).toBe(true)
    expect(groupCompanionSessions(workspace.sessions).groups[0]?.sessions.map(session => session.title))
      .toContain('New Work')
    const replay = createCompanionSession(workspace.sessions, committed, {
      operationId: 'op-work',
      title: 'Duplicate',
      workspace: 'Work',
      devicePrincipalId: 'device-1',
    })
    expect(replay.created).toBe(false)
    expect(replay.sessions).toHaveLength(workspace.sessions.length)
    const ungrouped = createCompanionSession(workspace.sessions, committed, {
      operationId: 'op-ungrouped',
      title: 'Loose',
      devicePrincipalId: 'device-1',
    })
    expect(ungrouped.sessions.at(-1)).toMatchObject({ title: 'Loose' })
    expect(ungrouped.sessions.at(-1)?.workspace).toBeUndefined()
  })

  it('exposes Workspace-targeted and global Ungrouped create actions without a voice control', () => {
    const created: Array<{ workspace?: string }> = []
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac',
      connection: 'online',
      sessions: history,
      ...browsePresentation,
      onCreate: (input) => { created.push(input) },
    }))
    fireEvent.click(screen.getByRole('button', { name: '在 Work 新建 Session' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 Ungrouped Session' }))
    expect(created).toEqual([{ workspace: 'Work' }, {}])
    expect(screen.queryByRole('button', { name: /voice|语音/i })).toBeNull()
  })
})
