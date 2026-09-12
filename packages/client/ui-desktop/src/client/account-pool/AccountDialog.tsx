/** Shared overlay dialog for account-pool models and settings. */
import type { ReactNode } from 'react'
import css from './LoginModal.module.css'

export interface AccountDialogProps {
  title: string
  description?: string
  closeLabel?: string
  children: ReactNode
  onClose: () => void
}

export function AccountDialog({ title, description, closeLabel = 'Close', children, onClose }: AccountDialogProps) {
  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.dialog} onClick={(event) => { event.stopPropagation() }} role="dialog" aria-modal="true" aria-labelledby="account-pool-dialog-title">
        <header className={css.header}>
          <div className={css.headerTitle}>
            <h3 id="account-pool-dialog-title">{title}</h3>
            {description !== undefined && <p>{description}</p>}
          </div>
          <button type="button" className={css.closeBtn} onClick={onClose} aria-label={closeLabel}>✕</button>
        </header>
        <div className={css.body}>{children}</div>
      </div>
    </div>
  )
}
