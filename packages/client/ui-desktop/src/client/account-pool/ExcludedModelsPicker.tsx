/** Searchable multi-select for exact excluded model ids. */
import { useMemo, useState } from 'react'
import type { AccountPoolCopy } from './quota-display.ts'
import css from './ExcludedModelsPicker.module.css'

export interface ExcludedModelOption {
  readonly id: string
  readonly name?: string
}

export function ExcludedModelsPicker({
  t,
  models,
  selected,
  onChange,
}: {
  t: AccountPoolCopy
  models: readonly ExcludedModelOption[]
  selected: readonly string[]
  onChange: (next: readonly string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const options = useMemo(() => mergeOptions(models, selected), [models, selected])
  const chosen = new Set(selected)
  const filtered = options.filter((item) => {
    const haystack = `${item.id} ${item.name ?? ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })
  const summary = chosen.size === 0 ? t('sub2api.excludedNone') : t('sub2api.excludedSome', { count: chosen.size })
  return (
    <div className={css.wrap}>
      <button
        type="button"
        id="account-pool-excluded"
        className={css.trigger}
        aria-expanded={open}
        aria-label={t('sub2api.fieldExcluded')}
        onClick={() => { setOpen(current => !current) }}
      >
        <span>{summary}</span>
        <span className={css.caret} aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={css.panel} data-testid="excluded-models-panel">
          <input
            className={css.search}
            value={query}
            placeholder={t('sub2api.searchModels')}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          <ul className={css.list}>
            {filtered.length === 0 ? (
              <li className={css.empty}>{t('sub2api.noMatchingModels')}</li>
            ) : filtered.map((item) => {
              const checked = chosen.has(item.id)
              return (
                <li key={item.id}>
                  <label className={css.row}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        onChange(checked ? selected.filter(id => id !== item.id) : [...selected, item.id])
                      }}
                    />
                    <span>
                      <strong>{item.id}</strong>
                      {item.name !== undefined && item.name !== item.id && <em>{item.name}</em>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className={css.footer}>
            <span>{t('sub2api.excludedProgress', { selected: chosen.size, total: options.length })}</span>
            <span className={css.actions}>
              <button type="button" className={css.link} onClick={() => { onChange(options.map(item => item.id)) }}>{t('sub2api.excludeAll')}</button>
              <button type="button" className={css.link} onClick={() => { onChange([]) }}>{t('sub2api.clearExcluded')}</button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function mergeOptions(
  models: readonly ExcludedModelOption[],
  selected: readonly string[],
): readonly ExcludedModelOption[] {
  const seen = new Set<string>()
  const out: ExcludedModelOption[] = []
  for (const item of models) {
    if (item.id.length === 0 || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  for (const id of selected) {
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    out.push({ id })
  }
  return out
}
