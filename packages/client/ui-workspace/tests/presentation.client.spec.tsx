// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  SessionListPresentation, workspacePresentationTranslate,
} from '../src/presentation.tsx'
import type { SessionNode } from '../src/client/tree.ts'
import { SessionNodeItem } from '../src/client/rows/Rows.tsx'

afterEach(() => {
  document.body.innerHTML = ''
})

const t = workspacePresentationTranslate('zh')
const sid = (id: string) => id as SessionId
const node = (id: string, title = id): SessionNode => ({
  id: sid(id), title, blank: false, running: false,
  runningSubagentCount: 0, completed: false, hasActiveSchedule: false, updatedAt: 0,
})

describe('shared Session list presentation', () => {
  it('hides mutation menu items when no mutation callbacks are supplied', () => {
    render(<SessionListPresentation
      label="sessions"
      nodes={[node('one', 'One')]}
      now={0}
      onOpen={vi.fn()}
      t={t}
    />)
    expect(screen.queryByRole('button', { name: '会话“One”的操作' })).toBeNull()
    fireEvent.click(screen.getByText('One'))
  })

  it('dispatches supplied mutation callbacks with the row id and keeps onOpen', () => {
    const onOpen = vi.fn()
    const onRename = vi.fn()
    const onFork = vi.fn()
    const onArchive = vi.fn()
    render(<SessionListPresentation
      label="sessions"
      nodes={[node('one', 'One')]}
      now={0}
      onOpen={onOpen}
      onRename={onRename}
      onFork={onFork}
      onArchive={onArchive}
      t={t}
    />)
    fireEvent.click(screen.getByText('One'))
    expect(onOpen).toHaveBeenCalledWith(sid('one'))
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledWith(sid('one'), 'One')
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '分叉会话' }))
    expect(onFork).toHaveBeenCalledWith(sid('one'))
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '归档会话' }))
    expect(onArchive).toHaveBeenCalledWith(sid('one'))
  })

  it('omits only the missing mutation verbs from a partial permission set', () => {
    render(<SessionNodeItem
      node={node('one', 'One')}
      currentId={undefined}
      now={0}
      onOpen={vi.fn()}
      onRename={vi.fn()}
      t={t}
    />)
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: '分叉会话' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '归档会话' })).toBeNull()
  })

  it('moves roving tree focus with arrow keys without opening the session', () => {
    const onOpen = vi.fn()
    render(<SessionListPresentation
      label="sessions"
      nodes={[node('one', 'One'), node('two', 'Two')]}
      now={0}
      onOpen={onOpen}
      t={t}
    />)
    const first = screen.getByText('One').closest('[role="treeitem"]') as HTMLElement
    const second = screen.getByText('Two').closest('[role="treeitem"]') as HTMLElement
    expect(first.tabIndex).toBe(0)
    expect(second.tabIndex).toBe(-1)
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(onOpen).not.toHaveBeenCalled()
    expect(second.tabIndex).toBe(0)
    expect(first.tabIndex).toBe(-1)
  })
})
