/**
 * PROTOTYPE — three Session-header Schedule board variants, switchable via
 * `?variant=A|B|C`, mounted beside the existing Bash background-job action.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconPauseOutline16,
  IconPlayOutline16,
  IconTrashOutline16,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ScheduleBoardPrototype.module.css'

export type ScheduleBoardPrototypeProps = PropsRuntime<'conversation.session.header.actions'>

type VariantKey = 'A' | 'B' | 'C'
type ScheduleState = 'waiting' | 'overdue' | 'paused'

interface ScheduleItem {
  readonly id: string
  readonly prompt: string
  readonly rule: string
  readonly next: string
  readonly relative: string
  readonly state: ScheduleState
}

const VARIANTS: readonly VariantKey[] = ['A', 'B', 'C']
const VARIANT_NAMES: Record<VariantKey, string> = {
  A: '并列任务板',
  B: '下一次时间轴',
  C: 'Session 运行抽屉',
}

const INITIAL_ITEMS: readonly ScheduleItem[] = [
  {
    id: 'release-check',
    prompt: '检查 Desktop 发布 CI，并把失败项汇报给我',
    rule: '一次',
    next: '今天 15:30',
    relative: '18 分钟后',
    state: 'waiting',
  },
  {
    id: 'morning-brief',
    prompt: '生成今日 Agent 与 Harness 行业简报',
    rule: '每天 09:00',
    next: '明天 09:00',
    relative: '17 小时后',
    state: 'waiting',
  },
  {
    id: 'follow-up',
    prompt: '跟进用户对 Schedule 任务板原型的反馈',
    rule: '一次',
    next: '今天 14:50',
    relative: '已逾期 22 分钟',
    state: 'overdue',
  },
  {
    id: 'weekly-review',
    prompt: '汇总本周完成事项与下周风险',
    rule: '每周五 18:00',
    next: '本周五 18:00',
    relative: '已暂停',
    state: 'paused',
  },
]

function ClockGlyph({ className }: { readonly className?: string | undefined }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M7 3.8V7l2.3 1.35" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function stateLabel(state: ScheduleState): string {
  if (state === 'waiting') return '等待中'
  if (state === 'overdue') return '待补跑'
  return '已暂停'
}

function stateDot(state: ScheduleState): 'ongoing' | 'warning' | 'done' {
  if (state === 'waiting') return 'ongoing'
  if (state === 'overdue') return 'warning'
  return 'done'
}

interface VariantProps {
  readonly items: readonly ScheduleItem[]
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
  readonly toggle: (id: string) => void
  readonly remove: (id: string) => void
}

function RowActions({ item, toggle, remove }: Pick<VariantProps, 'toggle' | 'remove'> & { readonly item: ScheduleItem }) {
  return (
    <span className={css.rowActions}>
      <button
        type="button"
        className={css.iconButton}
        aria-label={item.state === 'paused' ? `恢复 ${item.prompt}` : `暂停 ${item.prompt}`}
        title={item.state === 'paused' ? '恢复' : '暂停'}
        onClick={() => { toggle(item.id) }}
      >
        {item.state === 'paused' ? <IconPlayOutline16 /> : <IconPauseOutline16 />}
      </button>
      <button
        type="button"
        className={`${css.iconButton} ${css.deleteButton}`}
        aria-label={`删除 ${item.prompt}`}
        title="删除"
        onClick={() => { remove(item.id) }}
      >
        <IconTrashOutline16 />
      </button>
    </span>
  )
}

function EmptyState() {
  return <div className={css.empty}>这个 Session 暂无定时任务</div>
}

/** Static context marker so the isolated prototype shows the requested adjacency. */
function MockBackgroundJobContext() {
  return (
    <button type="button" className={css.mockJob} title="原型上下文：现有 Bash 后台任务按钮">
      <StateDot state="ongoing" />
      <span>1 个后台任务</span>
      <IconChevronDownOutline14 />
    </button>
  )
}

/** Closest to the current Bash background-job control. */
function VariantA({ items, open, setOpen, toggle, remove }: VariantProps) {
  const active = items.filter(item => item.state !== 'paused').length
  return (
    <div className={css.anchor}>
      <button
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={`${active} 个定时任务等待中`}
        onClick={() => { setOpen(!open) }}
      >
        <ClockGlyph className={css.clock} />
        <span>{active > 0 ? `${active} 个定时任务` : '定时任务'}</span>
        <IconChevronDownOutline14 className={open ? css.chevronOpen : undefined} />
      </button>
      {open && (
        <section className={`${css.popover} ${css.popoverTable}`} aria-label="定时任务">
          <header className={css.popoverHeader}>
            <div>
              <strong>定时任务</strong>
              <span>仅在此 Session 内执行</span>
            </div>
            <span className={css.headerCount}>{items.length}</span>
          </header>
          {items.length === 0 ? <EmptyState /> : (
            <ul className={css.tableList}>
              {items.map(item => (
                <li key={item.id} className={css.tableRow}>
                  <StateDot state={stateDot(item.state)} className={css.rowDot} />
                  <span className={css.rule}>{item.rule}</span>
                  <span className={css.taskCopy}>
                    <strong title={item.prompt}>{item.prompt}</strong>
                    <small>{item.next} · {item.relative}</small>
                  </span>
                  <span className={css.status}>{stateLabel(item.state)}</span>
                  <RowActions item={item} toggle={toggle} remove={remove} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

/** Makes the next trigger the primary fact and the rest a temporal sequence. */
function VariantB({ items, open, setOpen, toggle, remove }: VariantProps) {
  const next = items.find(item => item.state === 'waiting')
  const attention = items.some(item => item.state === 'overdue')
  return (
    <div className={css.anchor}>
      <button
        type="button"
        className={`${css.nextTrigger} ${attention ? css.nextTriggerAttention : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.orbit}><ClockGlyph /></span>
        <span className={css.nextTriggerCopy}>
          <small>下一项</small>
          <strong>{next?.next ?? '无计划'}</strong>
        </span>
        <span className={css.nextBadge}>{items.length}</span>
      </button>
      {open && (
        <section className={`${css.popover} ${css.timelinePopover}`} aria-label="定时任务时间轴">
          {next === undefined ? <EmptyState /> : (
            <div className={css.nextHero}>
              <span className={css.heroEyebrow}>NEXT · {next.relative}</span>
              <strong>{next.next}</strong>
              <p>{next.prompt}</p>
            </div>
          )}
          <ol className={css.timeline}>
            {items.map(item => (
              <li key={item.id} className={`${css.timelineItem} ${css[`timeline_${item.state}`]}`}>
                <span className={css.timelineNode} />
                <div className={css.timelineCopy}>
                  <time>{item.next}</time>
                  <strong>{item.prompt}</strong>
                  <span>{item.rule} · {stateLabel(item.state)}</span>
                </div>
                <RowActions item={item} toggle={toggle} remove={remove} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

/** Treats schedules as a persistent Session runtime surface, not a popover list. */
function VariantC({ items, open, setOpen, toggle, remove }: VariantProps) {
  const overdue = items.filter(item => item.state === 'overdue').length
  return (
    <div className={css.anchor}>
      <button
        type="button"
        className={css.drawerTrigger}
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <ClockGlyph />
        <span>定时</span>
        <span className={overdue > 0 ? css.drawerBadgeAttention : css.drawerBadge}>{items.length}</span>
      </button>
      {open && (
        <aside className={css.drawer} aria-label="Session 定时任务面板">
          <header className={css.drawerHeader}>
            <div>
              <span className={css.heroEyebrow}>SESSION RUNTIME</span>
              <h2>定时任务</h2>
            </div>
            <button type="button" className={css.closeButton} onClick={() => { setOpen(false) }}>关闭</button>
          </header>
          <div className={css.drawerSummary}>
            <div><strong>{items.filter(item => item.state === 'waiting').length}</strong><span>等待</span></div>
            <div><strong>{overdue}</strong><span>待补跑</span></div>
            <div><strong>{items.filter(item => item.state === 'paused').length}</strong><span>暂停</span></div>
          </div>
          {items.length === 0 ? <EmptyState /> : (
            <ul className={css.drawerList}>
              {items.map(item => (
                <li key={item.id} className={css.drawerCard}>
                  <div className={css.drawerCardTop}>
                    <span className={css.stateChip} data-state={item.state}>{stateLabel(item.state)}</span>
                    <span>{item.rule}</span>
                  </div>
                  <strong>{item.prompt}</strong>
                  <div className={css.drawerTime}>
                    <ClockGlyph />
                    <span>{item.next}</span>
                    <small>{item.relative}</small>
                  </div>
                  <RowActions item={item} toggle={toggle} remove={remove} />
                </li>
              ))}
            </ul>
          )}
          <footer className={css.drawerFoot}>定时任务由当前 Session 持有；关闭 Session 后不会在系统层通知。</footer>
        </aside>
      )}
    </div>
  )
}

function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get('variant')
  return value === 'B' || value === 'C' ? value : 'A'
}

interface SwitcherProps {
  readonly variant: VariantKey
  readonly setVariant: (variant: VariantKey) => void
  readonly items: readonly ScheduleItem[]
}

function PrototypeSwitcher({ variant, setVariant, items }: SwitcherProps) {
  const cycle = (delta: number): void => {
    const current = VARIANTS.indexOf(variant)
    setVariant(VARIANTS[(current + delta + VARIANTS.length) % VARIANTS.length] ?? 'A')
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (target instanceof HTMLElement && target.isContentEditable) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [variant])

  return (
    <div className={css.switcher}>
      <button type="button" aria-label="上一个方案" onClick={() => { cycle(-1) }}><IconChevronLeftOutline14 /></button>
      <div className={css.switcherLabel}>
        <small>PROTOTYPE</small>
        <strong>{variant} — {VARIANT_NAMES[variant]}</strong>
      </div>
      <details className={css.stateInspector}>
        <summary>状态 {items.length}</summary>
        <pre>{JSON.stringify(items, null, 2)}</pre>
      </details>
      <button type="button" aria-label="下一个方案" onClick={() => { cycle(1) }}><IconChevronRightOutline14 /></button>
    </div>
  )
}

/** Development-only host for all three throwaway Schedule board variants. */
export function ScheduleBoardPrototype(_props: ScheduleBoardPrototypeProps) {
  const [variant, setVariantState] = useState<VariantKey>(readVariant)
  const [items, setItems] = useState<readonly ScheduleItem[]>(INITIAL_ITEMS)
  const [open, setOpen] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  const setVariant = (next: VariantKey): void => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState(window.history.state, '', url)
    setVariantState(next)
    setOpen(true)
  }

  const toggle = (id: string): void => {
    setItems(current => current.map(item => item.id === id
      ? { ...item, state: item.state === 'paused' ? 'waiting' : 'paused', relative: item.state === 'paused' ? item.relative.replace('已暂停', '等待中') : '已暂停' }
      : item))
  }
  const remove = (id: string): void => { setItems(current => current.filter(item => item.id !== id)) }

  const shared = useMemo<VariantProps>(() => ({ items, open, setOpen, toggle, remove }), [items, open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={css.prototypeRoot} onKeyDown={onKeyDown}>
      <MockBackgroundJobContext />
      {variant === 'A' && <VariantA {...shared} />}
      {variant === 'B' && <VariantB {...shared} />}
      {variant === 'C' && <VariantC {...shared} />}
      <PrototypeSwitcher variant={variant} setVariant={setVariant} items={items} />
    </div>
  )
}
