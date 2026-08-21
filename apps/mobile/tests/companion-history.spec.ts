// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  createCompanionSession,
  companionSessionPending,
  filterCompanionSessions,
  groupCompanionSessions,
  pageCompanionHistory,
  revealCompanionHistory,
  projectMobileCompanionHistory,
  type CompanionSessionSummary,
} from '../src/companion-history.ts'
import { MobileBrowse } from '../src/MobileBrowse.tsx'

afterEach(() => { cleanup() })

const history: readonly CompanionSessionSummary[] = [
  { id: 's1', title: 'Alpha', workspace: 'Work', summary: 'alpha summary', live: true, transcript: ['hello'] },
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
    expect(revealCompanionHistory(many, 1).visible).toHaveLength(COMPANION_HISTORY_PAGE_SIZE)
    expect(revealCompanionHistory(many, 2).visible).toHaveLength(COMPANION_HISTORY_PAGE_SIZE + 3)
    expect(revealCompanionHistory(many, 2).spilled).toBe(0)
  })

  it('projects Mobile history identically to Desktop-confirmed history', () => {
    expect(projectMobileCompanionHistory(history)).toEqual(history)
  })

  it('filters history by title and marks unsettled interactions', () => {
    const pending: CompanionSessionSummary = {
      id: 's4',
      title: 'Needs review',
      summary: 'approval',
      blocks: [{ kind: 'approval', summary: 'Allow write' }],
    }
    expect(filterCompanionSessions(history, 'alpha').map(session => session.title)).toEqual(['Alpha'])
    expect(filterCompanionSessions([
      { id: 's5', title: 'Quiet', summary: 'row', snippet: 'needle in the Host transcript' },
    ], 'needle').map(session => session.id)).toEqual(['s5'])
    expect(companionSessionPending(pending)).toBe(true)
    expect(companionSessionPending(history[1]!)).toBe(false)
  })

  it('hides Workspace and Session rows before pairing', () => {
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac',
      connection: 'unpaired',
      sessions: history,
    }))
    expect(screen.getByText('未连接')).toBeTruthy()
    expect(screen.queryByText('项目')).toBeNull()
    expect(screen.queryByText('Work')).toBeNull()
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(screen.queryByText('Ungrouped')).toBeNull()
    expect(screen.getByText('扫码连接 Desktop 后即可查看 Session')).toBeTruthy()
  })

  it('shows the selected Desktop, connection state, and opens a live transcript full-screen', () => {
    render(createElement(MobileBrowse, { desktopName: 'Studio Mac', connection: 'online', sessions: history }))
    expect(screen.getByText('Studio Mac')).toBeTruthy()
    expect(screen.getByText('Remote Online')).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('Ungrouped')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(screen.getByText('hello')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.click(screen.getByRole('button', { name: /Gamma/ }))
    expect(screen.getByText('正在从 Desktop 读取对话…')).toBeTruthy()
  })

  it('asks Desktop to search and shows Host hits instead of the full catalog', () => {
    const queries: string[] = []
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac',
      connection: 'online',
      sessions: history,
      searchHits: [{ id: 's1', title: 'Alpha', workspace: 'Work', summary: 'alpha summary', snippet: 'hello from Host' }],
      searchStatus: 'ready',
      onSearch: (query) => { queries.push(query) },
    }))
    fireEvent.change(screen.getByLabelText('搜索聊天记录'), { target: { value: 'hello' } })
    expect(screen.getByText('hello from Host')).toBeTruthy()
    expect(screen.queryByText('Beta')).toBeNull()
    expect(screen.queryByText('Gamma')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('opens a Host search hit that is not on the current catalog page', () => {
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac',
      connection: 'online',
      sessions: history,
      searchHits: [{ id: 's-search', title: 'Needle', summary: 'from host', snippet: 'deep hit' }],
      searchStatus: 'ready',
      onSubmit: () => {},
    }))
    fireEvent.change(screen.getByLabelText('搜索聊天记录'), { target: { value: 'needle' } })
    fireEvent.click(screen.getByRole('button', { name: /Needle/ }))
    expect(screen.getByText('正在从 Desktop 读取对话…')).toBeTruthy()
    expect(screen.getByLabelText('继续会话')).toBeTruthy()
  })

  it('keeps earlier rows when loading more history', () => {
    const many = Array.from({ length: COMPANION_HISTORY_PAGE_SIZE + 2 }, (_, index) => ({
      id: `id-${String(index)}`,
      title: `Row ${String(index)}`,
      summary: 'row',
    }))
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac',
      connection: 'online',
      sessions: many,
    }))
    expect(screen.getByText('Row 0')).toBeTruthy()
    expect(screen.queryByText(`Row ${String(COMPANION_HISTORY_PAGE_SIZE)}`)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }))
    expect(screen.getByText('Row 0')).toBeTruthy()
    expect(screen.getByText(`Row ${String(COMPANION_HISTORY_PAGE_SIZE)}`)).toBeTruthy()
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
      onCreate: (input) => { created.push(input) },
    }))
    fireEvent.click(screen.getByRole('button', { name: '在 Work 新建 Session' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 Ungrouped Session' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 Workspace' }))
    fireEvent.change(screen.getByLabelText('Workspace 名称'), { target: { value: 'Docs' } })
    fireEvent.click(screen.getByRole('button', { name: '在新 Workspace 新建 Session' }))
    expect(created).toEqual([{ workspace: 'Work' }, {}, { workspace: 'Docs' }])
    expect(screen.queryByRole('button', { name: /voice|语音/i })).toBeNull()
  })

  it('opens a created Session into the conversation composer after Desktop confirmation', () => {
    const submitted: Array<{ id: string; text: string }> = []
    const created = createCompanionSession([], new Set(), {
      operationId: 'session-composer',
      title: 'Ungrouped Session',
      devicePrincipalId: 'device-1',
    })
    render(createElement(MobileBrowse, {
      desktopName: 'Studio Mac',
      connection: 'online',
      sessions: created.sessions,
      onSubmit: (sessionId, text) => { submitted.push({ id: sessionId, text }) },
    }))
    fireEvent.click(screen.getByRole('button', { name: /Ungrouped Session/ }))
    fireEvent.change(screen.getByLabelText('继续会话'), { target: { value: 'hello from Mobile' } })
    fireEvent.submit(screen.getByLabelText('继续会话').closest('form')!)
    expect(submitted).toEqual([{ id: 'session-composer', text: 'hello from Mobile' }])
  })
})
