// @vitest-environment jsdom
// The member-question composite card: the chain selector claims exactly the
// member-question requests (plan-review and generic requests fall through),
// the Decision Brief banner renders the carrier's bounded faces, and the
// shared presentation's own minimize toggle folds the whole card to the
// 「远端 · 发起人」 strip without unmounting (and so without spending) the
// presentation's drafts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/src/client/contract/snapshot.ts'
import type { PendingMemberQuestionView } from '@deepseek-ai/dsh-member-question-receiver/types'
import type { ReceivingQuestionBookView } from '@deepseek-ai/dsh-api-session-controller/src/client/sessions/receiving.ts'
import { useState } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { registerDomSnapshotSerializer } from '@deepseek-ai/dsh-client-test-runtime'
import {
  BACKGROUND_CLAMP, clampBackground, memberBriefOf, selectMemberQuestion,
  selectMemberQuestionRecords,
  type MemberQuestionComposerProps,
} from '../src/client/contract/slots.ts'
import { MemberQuestionCard, MemberQuestionDock, MemberQuestionRecords } from '../src/client/MemberQuestionCard.tsx'
import { en, zh } from '../src/client/locales.ts'
import { en as questionEn, zh as questionZh } from '@deepseek-ai/dsh-client-ui-user-questions/src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

registerDomSnapshotSerializer()

afterEach(cleanup)

const SID = 's1' as SessionId

/** Seat stub over a dictionary pair mirroring the real lookup chain: package dictionary, common vocabulary, `{name}` substitution. */
const seatOver = (dict: Record<string, string>, question: Record<string, string>, common: Record<string, string>) =>
  (namespace: 'member-question' | 'question') =>
    (key: string, params?: Record<string, unknown>): string => {
      const template = (namespace === 'member-question' ? dict : question)[key] ?? common[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match)
    }

const seat = seatOver(zh, questionZh, commonZh)

/** Framework standard-kit stubs: the card consumes only the locale seats. */
const kit = {
  sessionId: SID,
  session: undefined,
  useSession: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<SessionSnapshot>,
  useSessions: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<SessionListState>,
  useWorkspaces: (() => { throw new Error('unused') }) as unknown as SnapshotSelectorHook<WorkspaceListState>,
  useProjection: (() => undefined) as never,
  useInput: ((selector: (state: { draft: string; phase: 'plain' }) => unknown) =>
    selector({ draft: '', phase: 'plain' })) as never,
  inputActions: { setDraft: () => undefined, submit: () => undefined } as never,
}

const NOW = 1_800_000_000_000

const QUESTIONS = [{
  id: 'remove-member',
  header: '成员管理',
  question: '将王小明移出项目吗？',
  options: [
    { label: '移出 (recommended)', description: '收回项目访问权。' },
    { label: '保留', description: '保持只读成员身份。' },
  ],
}]

/** Carried Decision Brief fields: origin identity, materials, and the expiry instant. */
const projection = () => ({
  origin: {
    projectName: '千帆平台',
    originSessionTitle: '整理迭代计划',
    askerAccountId: 'account-alice',
    askerDisplayName: '王小明',
    askerRole: 'admin' as const,
    askerAvatarUrl: '',
  },
  references: [
    {
      path: 'docs/roster.md',
      reason: '当前成员名单与角色',
    },
    {
      path: 'reports/activity.csv',
      reason: '近 30 天活跃度',
    },
  ],
  cachedReferences: [
    { path: 'docs/roster.md', cachedPath: '.dsh/member-questions/question-1/roster.md' },
    { path: 'reports/activity.csv', cachedPath: '.dsh/member-questions/question-1/activity.csv' },
  ],
  expiresAt: NOW + 125 * 1000,
  background: '该成员近 30 天无提交记录。',
})

function memberWait(over: Partial<{
  origin: Partial<ReturnType<typeof projection>['origin']>
  references: ReturnType<typeof projection>['references']
  cachedReferences: ReturnType<typeof projection>['cachedReferences']
  expiresAt: number
  background: string
  questions: typeof QUESTIONS
}> = {}): { carrier: PendingMemberQuestionView } {
  const carried = projection()
  const origin = { ...carried.origin, ...over.origin }
  return {
    carrier: {
      questionId: 'question-1' as never,
      receivingSessionId: SID as never,
      receivingAccountId: 'account-receiver' as never,
      revision: 1,
      arrivedAt: 100,
      operation: {
        type: 'member-question',
        operationId: 'operation-1' as never,
        questionId: 'question-1' as never,
        projectId: 'project-1' as never,
        originSessionId: 'origin-session-1' as never,
        expiresAt: over.expiresAt ?? carried.expiresAt,
        origin,
        background: over.background ?? carried.background,
        questions: over.questions ?? QUESTIONS,
        references: over.references ?? carried.references,
      },
      cachedReferences: over.cachedReferences ?? carried.cachedReferences,
    },
  }
}

function receivingView(wait?: PendingMemberQuestionView, records: readonly unknown[] = []): ReceivingQuestionBookView {
  if (wait === undefined && records.length === 0) return { byId: {} }
  return {
    byId: {
      [SID]: {
        sessionId: SID,
        title: 'member-question',
        updatedAt: 0,
        revision: wait?.revision ?? 1,
        materialized: false,
        pending: wait,
        records: records as ReceivingQuestionBookView['byId'][string]['records'],
      },
    },
  }
}

function PresentationDouble(props: {
  requestKey: string
  questions: { id: string; question: string; options?: readonly { label: string }[] }[]
  answer: (batch: { answers: { id: string; selected: string[] }[] }) => Promise<void>
  cancel: () => Promise<void>
  t: (key: string) => string
}) {
  const question = props.questions[0]
  const firstLabel = question?.options?.[0]?.label ?? ''
  const [selected, setSelected] = useState(firstLabel)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const radioName = firstLabel.replace(/ \((?:recommended|推荐)\)/i, '')
  return (
    <div data-question-presentation="" data-request-key={props.requestKey}>
      <button
        type="button"
        aria-expanded={expanded ? 'true' : 'false'}
        aria-label={expanded ? props.t('nav.minimize') : props.t('nav.maximize')}
        onClick={() => { setExpanded(open => !open) }}
      />
      {question !== undefined && <div>{question.question}</div>}
      {expanded && firstLabel !== '' && (
        <button
          type="button"
          role="radio"
          aria-checked={selected === firstLabel ? 'true' : 'false'}
          aria-label={radioName}
          onClick={() => { setSelected(firstLabel) }}
        >
          {radioName}
        </button>
      )}
      {expanded && <span>1 / 1</span>}
      {expanded && <span>推荐</span>}
      {expanded && <textarea placeholder={props.t('custom.placeholder')} />}
      {error !== null && <div role="status">{error}</div>}
      {expanded && (
        <button
          type="button"
          onClick={() => {
            if (question === undefined) return
            void props.answer({ answers: [{ id: question.id, selected: [selected] }] })
              .catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : String(cause))
              })
          }}
        >
          {props.t('submit')}
        </button>
      )}
    </div>
  )
}

function receivingProps(
  wait?: PendingMemberQuestionView,
  records: readonly unknown[] = [],
  questionT: ReturnType<typeof seat> = seat('question'),
) {
  const view = receivingView(wait, records)
  return {
    useReceivingQuestions: ((selector: (next: ReceivingQuestionBookView) => unknown) => selector(view)),
    hooks: {
      receivingQuestions: {
        getSnapshot: () => view,
        subscribe: () => () => {},
      },
    },
    settle: vi.fn(async () => {}),
    decline: vi.fn(async () => {}),
    renderSlot: ((_name: 'question.presentation', owner: {
      requestKey: string
      questions: { id: string; question: string; options?: readonly { label: string }[] }[]
      answer: (batch: { answers: { id: string; selected: string[] }[] }) => Promise<void>
      cancel: () => Promise<void>
    }) => (
      <PresentationDouble
        requestKey={owner.requestKey}
        questions={owner.questions}
        answer={owner.answer}
        cancel={owner.cancel}
        t={questionT}
      />
    )) as MemberQuestionComposerProps['renderSlot'],
  }
}

function renderCard(
  carrier: PendingMemberQuestionView,
  focusDocument: MemberQuestionComposerProps['focusDocument'] = () => {},
  openReference: MemberQuestionComposerProps['openReference'] = () => {},
) {
  return render(
    <MemberQuestionCard
      matched={carrier}
      {...kit}
      {...receivingProps(carrier)}
      t={seat('member-question')}
      focusDocument={focusDocument}
      openReference={openReference}
    />,
  )
}

/**
 * Tidy print-noise text before a snapshot: blank the shared answer field's
 * sizing mirrors (the mirror renders the draft plus a trailing newline to own
 * its grid row height, see QuestionComposer's AnswerField) and trim the
 * whitespace the shared pager's JSX text nodes carry, neither of which is
 * content the snapshots pin — both would otherwise trail snapshot lines as
 * whitespace the repository's text gates reject.
 */
function tidyDomForSnapshot(root: HTMLElement): void {
  root.querySelectorAll('[data-member-presentation] div[aria-hidden="true"]')
    .forEach((node) => { if (node.textContent?.trim() === '') node.textContent = '' })
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeValue !== node.nodeValue?.trim()) node.nodeValue = node.nodeValue?.trim() ?? ''
  }
}

describe('member-question routing', () => {
  it('renders the pending card or terminal bands in the additive product-composer dock', () => {
    const { carrier } = memberWait()
    const props = {
      ...kit,
      input: { draft: '', phase: 'plain' },
      session: {},
      t: seat('member-question'),
      focusDocument: () => {},
      openReference: () => {},
      ...receivingProps(carrier),
    }
    const pending = render(MemberQuestionDock(props as never))
    expect(pending.container.querySelector('[data-member-presentation]')).not.toBeNull()
    pending.unmount()
    const terminal = render(MemberQuestionDock({
      ...props,
      ...receivingProps(undefined, [{
        questionId: 'terminal', state: 'withdrawn', askedAt: 100, terminalAt: 200,
        intent: { kind: 'member-question', questionId: 'terminal' },
      }]),
    } as never))
    expect(terminal.container.querySelector('[data-record-state="withdrawn"]')).not.toBeNull()
    terminal.unmount()
    const empty = render(MemberQuestionDock({
      ...props,
      ...receivingProps(),
    } as never))
    expect(empty.container.innerHTML).toBe('')
  })

  it('claims only non-empty terminal record projections', () => {
    expect(selectMemberQuestionRecords({ session: undefined })).toBeNull()
    expect(selectMemberQuestionRecords({ session: {
      memberQuestionRecords: [],
    } })).toBeNull()
    const records = [{ questionId: 'q' }] as never
    expect(selectMemberQuestionRecords({ session: {
      memberQuestionRecords: records,
    } })).toBe(records)
  })

  it('claims a Host pending member-question row', () => {
    const { carrier } = memberWait()
    expect(selectMemberQuestion({ pending: carrier })).toBe(carrier)
    expect(selectMemberQuestion({ pending: undefined })).toBeNull()
  })
})

describe('clampBackground and memberBriefOf', () => {
  it('clamps the background at the code-point budget without splitting a surrogate pair', () => {
    const emoji = '🚀'
    const long = emoji.repeat(BACKGROUND_CLAMP + 10)
    const clamped = clampBackground(long)
    expect(Array.from(clamped)).toHaveLength(BACKGROUND_CLAMP)
    expect(clampBackground('短背景')).toBe('短背景')
  })

  it('builds the brief from the carrier: clamped background, chip filenames, projection faces', () => {
    const { carrier } = memberWait({
      origin: projection().origin,
      references: projection().references,
      expiresAt: NOW + 3_600_000,
    })
    const brief = memberBriefOf(carrier)
    expect(brief.origin).toEqual({
      projectName: '千帆平台',
      originSessionTitle: '整理迭代计划',
      askerDisplayName: '王小明',
      askerRole: 'admin',
    })
    expect(brief.references).toEqual([
      {
        filename: 'roster.md',
        reason: '当前成员名单与角色',
        path: 'docs/roster.md',
        cachedPath: '.dsh/member-questions/question-1/roster.md',
      },
      {
        filename: 'activity.csv',
        reason: '近 30 天活跃度',
        path: 'reports/activity.csv',
        cachedPath: '.dsh/member-questions/question-1/activity.csv',
      },
    ])
    expect(brief.expiresAt).toBe(NOW + 3_600_000)
    expect(brief.background).toBe('该成员近 30 天无提交记录。')
  })

  it('omits an empty Host background', () => {
    const { carrier } = memberWait({ background: '' })
    expect(memberBriefOf(carrier).background).toBeUndefined()
  })
})

describe('MemberQuestionCard', () => {
  it('renders the Decision Brief banner over the shared question presentation', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    try {
      const { carrier } = memberWait()
      const { container } = renderCard(carrier)

      expect(screen.getByText('远端')).toBeTruthy()
      expect(screen.getByText('王小明')).toBeTruthy()
      expect(screen.getByText('管理员')).toBeTruthy()
      expect(screen.getByText('项目')).toBeTruthy()
      expect(screen.getByText('千帆平台')).toBeTruthy()
      expect(screen.getByText('来源会话')).toBeTruthy()
      expect(screen.getByText('整理迭代计划')).toBeTruthy()
      // Countdown formats as hh:mm:ss.
      expect(screen.getByText(/⏳ 00:02:05/)).toBeTruthy()
      expect(screen.getByText('背景')).toBeTruthy()
      expect(screen.getAllByText('该成员近 30 天无提交记录。').length).toBeGreaterThan(0)
      expect(screen.getByText('材料')).toBeTruthy()
      expect(screen.getByText('roster.md')).toBeTruthy()
      expect(screen.getByText('当前成员名单与角色')).toBeTruthy()
      // The shared presentation keeps its native flow: pagination, recommendation, options.
      expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy()
      expect(screen.getByText('1 / 1')).toBeTruthy()
      expect(screen.getByText('推荐')).toBeTruthy()
      expect(screen.getByRole('radio', { name: '移出' })).toBeTruthy()
      expect(screen.getByPlaceholderText('输入你的答案')).toBeTruthy()
      expect(container.querySelector('[data-folded]')).toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('falls back to the initial avatar and the expired label on their boundary faces', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    try {
      const { carrier } = memberWait({
        origin: { ...projection().origin, askerDisplayName: 'Alice', askerRole: 'owner' },
        expiresAt: NOW - 1000,
      })
      renderCard(carrier)
      // No avatar URL: the display name's first code point stands in.
      expect(screen.getByText('A', { selector: 'span' })).toBeTruthy()
      expect(screen.getByText('所有者')).toBeTruthy()
      expect(screen.getByText('已过期')).toBeTruthy()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('renders an avatar URL and tolerates an empty fallback display name', () => {
    const withImage = memberWait({
      origin: { ...projection().origin, askerAvatarUrl: 'https://example.test/avatar.png' },
      expiresAt: NOW + 1_000,
    }).carrier
    const first = renderCard(withImage)
    expect(first.container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/avatar.png')
    cleanup()
    const emptyName = memberWait({
      origin: { ...projection().origin, askerDisplayName: '' },
      expiresAt: NOW + 1_000,
    }).carrier
    expect(renderCard(emptyName).container.querySelector('span[aria-hidden="true"]')?.textContent).toBe('')
  })

  it('updates the display-only countdown while mounted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
      renderCard(memberWait().carrier)
      expect(screen.getByText(/00:02:05/u)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1_000) })
      expect(screen.getByText(/00:02:04/u)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders hour-scale countdowns and the member role', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    try {
      const { carrier } = memberWait({
        origin: { ...projection().origin, askerRole: 'member' },
        expiresAt: NOW + 2 * 3_600_000 + 60_000,
      })
      const { container } = renderCard(carrier)
      expect(container.textContent).toContain('02:01:00')
      expect(screen.getByText('成员')).toBeTruthy()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('folds with the presentation minimize toggle and unfolds from the strip, drafts intact', async () => {
    const { carrier } = memberWait()
    const { container } = renderCard(carrier)

    fireEvent.click(screen.getByRole('button', { name: '收起问题卡片' }))
    await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeTruthy() })
    // The whole card folded: the presentation stays mounted but hidden, and
    // the strip carries the collapse mark.
    expect(screen.getByText('远端 · 王小明')).toBeTruthy()
    expect(screen.getByText('已收起')).toBeTruthy()
    const presentation = container.querySelector('[data-member-presentation]')
    expect(presentation?.className).toContain('bodyHidden')

    // Revealing from the strip shows the presentation still minimized — the
    // shared component's own maximize toggle stays the way back in.
    fireEvent.click(screen.getByRole('button', { name: '远端 · 王小明' }))
    await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeNull() })
    expect(screen.getByRole('button', { name: '展开问题卡片' })).toBeTruthy()

    // Re-expanding the presentation clears the linkage state.
    fireEvent.click(screen.getByRole('button', { name: '展开问题卡片' }))
    await waitFor(() => { expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy() })
    expect(screen.getByRole('button', { name: '收起问题卡片' })).toBeTruthy()
  })

  it('opens a referenced document through Files and restores the decision beside the open details panel', async () => {
    const openReference = vi.fn()
    const { carrier } = memberWait()
    const { container } = renderCard(carrier, undefined, openReference)

    fireEvent.click(screen.getByRole('button', { name: /roster\.md/ }))
    expect(openReference).toHaveBeenCalledWith(
      SID, '.dsh/member-questions/question-1/roster.md', 'roster.md',
    )
    fireEvent.click(screen.getByRole('button', { name: /activity\.csv/u }))
    expect(openReference).toHaveBeenLastCalledWith(
      SID, '.dsh/member-questions/question-1/activity.csv', 'activity.csv',
    )

    // Panel opens → the card folds to its strip; panel closes → restored.
    // The linkage rides the persistent details column's aria-expanded. The
    // panel mounts first, so the attribute flips are observed mutations.
    const panel = document.createElement('div')
    panel.setAttribute('data-details-panel', '')
    document.body.appendChild(panel)
    try {
      panel.setAttribute('aria-expanded', 'true')
      await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeTruthy() })
      expect(screen.getByText('远端 · 王小明')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: '远端 · 王小明' }))
      await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeNull() })
      expect(panel.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: '收起问题卡片' }))
      await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeTruthy() })
      fireEvent.click(screen.getByRole('button', { name: '远端 · 王小明' }))
      await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeNull() })
      fireEvent.click(screen.getByRole('button', { name: '展开问题卡片' }))
      await waitFor(() => { expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy() })

      panel.setAttribute('aria-expanded', 'false')
      await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeNull() })
      panel.setAttribute('aria-expanded', 'true')
      await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeTruthy() })
    } finally {
      panel.remove()
    }
  })

  it('does not open a chip without a receiver-owned cached path', () => {
    const openReference = vi.fn()
    const { carrier } = memberWait({
      origin: projection().origin,
      references: [{ path: 'docs/roster.md', reason: '当前成员名单与角色' }],
      cachedReferences: [],
    })
    renderCard(carrier, undefined, openReference)
    fireEvent.click(screen.getByRole('button', { name: /roster\.md/ }))
    expect(openReference).not.toHaveBeenCalled()
  })

  it('snapshots the full banner and the shared presentation (light)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    try {
      const { carrier } = memberWait()
      const { container } = renderCard(carrier)
      tidyDomForSnapshot(container)
      expect(container).toMatchSnapshot()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('renders answered-elsewhere terminal metadata as a passive record band', () => {
    const intent = { kind: 'member-question', questionId: 'question-1' } as never
    render(<MemberQuestionRecords matched={[{
      questionId: 'question-1',
      state: 'answered-elsewhere',
      askedAt: NOW - 1_000,
      terminalAt: NOW,
      intent,
      settledByDeviceName: 'Office Mac',
    }]} t={seat('member-question')} />)
    expect(screen.getByText('已在 Office Mac 回答')).toBeTruthy()
    expect(document.querySelector('[data-record-state="answered-elsewhere"] time')?.getAttribute('datetime'))
      .toBe(new Date(NOW).toISOString())
  })

  it('renders every terminal state and the answered-elsewhere device fallback', () => {
    const intent = { kind: 'member-question', questionId: 'question-1' } as never
    const states = ['answered', 'declined', 'expired', 'withdrawn', 'superseded'] as const
    render(<MemberQuestionRecords matched={[
      ...states.map((state, index) => ({
        questionId: `question-${String(index)}`, state, askedAt: NOW - 1_000,
        terminalAt: NOW + index, intent,
      })),
      {
        questionId: 'question-elsewhere', state: 'answered-elsewhere' as const,
        askedAt: NOW - 1_000, terminalAt: NOW + 10, intent,
      },
    ]} t={seat('member-question')} />)
    expect(screen.getByText('已回答')).toBeTruthy()
    expect(screen.getByText('已拒绝')).toBeTruthy()
    expect(screen.getByText('已过期')).toBeTruthy()
    expect(screen.getByText('已撤回')).toBeTruthy()
    expect(screen.getByText('已被新问题取代')).toBeTruthy()
    expect(screen.getByText('已在 成员 回答')).toBeTruthy()
    cleanup()
    expect(render(<MemberQuestionRecords matched={[]} t={seat('member-question')} />).container.innerHTML).toBe('')
  })

  it('snapshots the full banner under the dark theme attribute', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    document.documentElement.setAttribute('data-ds-dark-theme', 'dark')
    try {
      const { carrier } = memberWait()
      const { container } = renderCard(carrier)
      tidyDomForSnapshot(container)
      expect(container).toMatchSnapshot()
    } finally {
      document.documentElement.removeAttribute('data-ds-dark-theme')
      vi.restoreAllMocks()
    }
  })

  it('snapshots the folded strip with Host origin identity', async () => {
    const { carrier } = memberWait()
    const { container } = renderCard(carrier)
    fireEvent.click(screen.getByRole('button', { name: '收起问题卡片' }))
    await waitFor(() => { expect(container.querySelector('[data-folded]')).toBeTruthy() })
    expect(screen.getByText('远端 · 王小明')).toBeTruthy()
    tidyDomForSnapshot(container)
    expect(container).toMatchSnapshot()
  })

  it('snapshots the English copy', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    try {
      const { carrier } = memberWait()
      const seatEn = seatOver(en, questionEn, commonEn)
      const { container } = render(
        <MemberQuestionCard
          matched={carrier}
          {...kit}
          {...receivingProps(carrier, [], seatEn('question'))}
          t={seatEn('member-question')}
          focusDocument={() => {}}
          openReference={() => {}}
        />,
      )
      expect(screen.getByText('Remote')).toBeTruthy()
      expect(screen.getByText('Project')).toBeTruthy()
      tidyDomForSnapshot(container)
      expect(container).toMatchSnapshot()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('keeps QuestionComposer drafts when Host settle fails and retries through the presentation slot', async () => {
    const { carrier } = memberWait()
    const extras = receivingProps(carrier)
    extras.settle
      .mockRejectedValueOnce(new Error('exact payload required'))
      .mockResolvedValueOnce(undefined)
    render(
      <MemberQuestionCard
        matched={carrier}
        {...kit}
        {...extras}
        t={seat('member-question')}
        focusDocument={() => {}}
        openReference={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '移出' }))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    expect(await screen.findByText('exact payload required')).toBeTruthy()
    expect(screen.getByRole('radio', { name: '移出' }).getAttribute('aria-checked')).toBe('true')
    expect(extras.settle).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => { expect(extras.settle).toHaveBeenCalledTimes(2) })
    expect(extras.settle.mock.calls[1]?.[1]).toEqual([
      { id: 'remove-member', selected: ['移出 (recommended)'] },
    ])
  })

  it('clears the pending card when the book projection has no pending row', () => {
    const { carrier } = memberWait()
    const pending = render(MemberQuestionDock({
      ...kit,
      ...receivingProps(carrier),
      t: seat('member-question'),
      focusDocument: () => {},
      openReference: () => {},
    } as never))
    expect(pending.container.querySelector('[data-member-presentation]')).not.toBeNull()
    pending.rerender(MemberQuestionDock({
      ...kit,
      ...receivingProps(undefined, [{
        questionId: 'question-1', state: 'expired', askedAt: 100, terminalAt: 200,
        intent: { kind: 'member-question', questionId: 'question-1' },
      }]),
      t: seat('member-question'),
      focusDocument: () => {},
      openReference: () => {},
    } as never))
    expect(pending.container.querySelector('[data-member-presentation]')).toBeNull()
    expect(pending.container.querySelector('[data-record-state="expired"]')).not.toBeNull()
  })
})
