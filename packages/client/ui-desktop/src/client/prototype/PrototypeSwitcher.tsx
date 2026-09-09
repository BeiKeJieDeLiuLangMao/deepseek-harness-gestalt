/**
 * Prototype switcher floating bar at the bottom center of the screen.
 * Strictly scaffolding; hidden in production or when not in prototype mode.
 */

import clsx from 'clsx'
import css from './PrototypeSwitcher.module.css'

export interface PrototypeSwitcherProps {
  current: string
  variants: Array<{ id: string; label: string; description: string }>
  onChange: (id: string) => void
}

export function PrototypeSwitcher({ current, variants, onChange }: PrototypeSwitcherProps) {
  const currentIndex = variants.findIndex(v => v.id === current)
  const prev = () => {
    const nextIdx = (currentIndex - 1 + variants.length) % variants.length
    onChange(variants[nextIdx].id)
  }
  const next = () => {
    const nextIdx = (currentIndex + 1) % variants.length
    onChange(variants[nextIdx].id)
  }

  const active = variants[currentIndex] ?? variants[0]

  return (
    <aside className={css.switcher} aria-label="Prototype Variant Switcher">
      <div className={css.controls}>
        <button type="button" className={css.navBtn} onClick={prev} aria-label="Previous variant">
          ←
        </button>
        <div className={css.info}>
          <span className={css.badge}>PROTOTYPE DRAFT</span>
          <strong className={css.title}>{active.id}: {active.label}</strong>
          <span className={css.desc}>{active.description}</span>
        </div>
        <button type="button" className={css.navBtn} onClick={next} aria-label="Next variant">
          →
        </button>
      </div>
      <div className={css.pills}>
        {variants.map(v => (
          <button
            key={v.id}
            type="button"
            className={clsx(css.pill, v.id === current && css.pillActive)}
            onClick={() => { onChange(v.id) }}
          >
            {v.id}
          </button>
        ))}
      </div>
    </aside>
  )
}
