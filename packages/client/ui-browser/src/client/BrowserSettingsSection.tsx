/**
 * Browser Profile settings section: default create identity and the named
 * persistent roster. The page does not create Browser Workspaces; Dock and
 * `browser_create` read these defaults.
 */

import { useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  Button, IconEditOutline16, IconGlobeOutline14, IconPlusOutline16, IconTrashOutline16, Input, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  isBrowserProfileName,
  type BrowserProfileKindSetting,
  type BrowserSettings,
} from '../browser-settings.ts'
import type { BrowserKey } from './locales.ts'
import css from './BrowserSettingsSection.module.css'

/** Registration-side business face: live preferences + durable writes. */
export interface BrowserSettingsInjected {
  hooks: {
    /** Durable Browser Profile preferences bound as useSettings. */
    settings: SnapshotStore<BrowserSettings>
  }
  /** Persist the omit-profile create identity. */
  setDefaultKind: (kind: BrowserProfileKindSetting) => void
  /** Persist the persistent name used when {@link BrowserSettings.defaultKind} is persistent. */
  setDefaultPersistentName: (name: string) => void
  /** Append one named Profile to the roster. */
  addNamedProfile: (name: string) => void
  /**
   * Replace one roster name. The persistent default follows the rename when
   * it still pointed at the old name.
   */
  renameNamedProfile: (from: string, to: string) => void
  /** Remove one named Profile and clear it as the persistent default when it was selected. */
  removeNamedProfile: (name: string) => void
}

/** Full settings section props. */
export type BrowserSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'browser'>
  & InjectFace<BrowserSettingsInjected>

const KINDS: readonly { id: BrowserProfileKindSetting; labelKey: BrowserKey }[] = [
  { id: 'shared', labelKey: 'settings.kind.shared' },
  { id: 'temporary', labelKey: 'settings.kind.temporary' },
  { id: 'persistent', labelKey: 'settings.kind.persistent' },
]

/**
 * Render the Browser Profile settings section.
 * @param props - composed slot props.
 */
export function BrowserSettingsSection({
  t, useSettings, setDefaultKind, setDefaultPersistentName,
  addNamedProfile, renameNamedProfile, removeNamedProfile,
}: BrowserSettingsSectionProps) {
  const defaultKind = useSettings(s => s.defaultKind)
  const defaultPersistentName = useSettings(s => s.defaultPersistentName)
  const namedProfiles = useSettings(s => s.namedProfiles)
  const [addOpen, setAddOpen] = useState(false)
  const [addDraft, setAddDraft] = useState('')
  const addOpener = useRef<HTMLButtonElement | null>(null)
  const [renameFrom, setRenameFrom] = useState<string>()
  const [renameDraft, setRenameDraft] = useState('')
  const addName = addDraft.trim()
  const addInvalid = addName.length > 0 && !isBrowserProfileName(addName)
  const addDuplicate = namedProfiles.includes(addName)
  const addBlocked = addName.length === 0 || addInvalid || addDuplicate
  const closeAdd = (): void => {
    setAddOpen(false)
    setAddDraft('')
    addOpener.current?.focus()
    addOpener.current = null
  }
  const closeRename = (): void => {
    setRenameFrom(undefined)
    setRenameDraft('')
  }
  const commitRename = (): void => {
    if (renameFrom === undefined) return
    const next = renameDraft.trim()
    if (next === renameFrom || !isBrowserProfileName(next) || namedProfiles.includes(next)) return
    renameNamedProfile(renameFrom, next)
    closeRename()
  }
  return (
    <section
      className={css.section}
      data-browser-settings
      onKeyDown={(event) => {
        if (!addOpen || event.key !== 'Escape') return
        event.stopPropagation()
        closeAdd()
      }}
    >
      <h2 className={css.title}>{t('settings.title')}</h2>
      <p className={css.intro}>{t('settings.intro')}</p>
      <div className={css.identityCard}>
        <span id="browser-default-kind" className={css.cardLabel}>{t('settings.defaultKind')}</span>
        <div className={css.kinds} role="radiogroup" aria-labelledby="browser-default-kind">
          {KINDS.map(({ id, labelKey }) => (
            <label key={id} className={css.kindOption} data-selected={defaultKind === id || undefined}>
              <input
                className={css.srOnly}
                type="radio"
                name="browser-default-kind"
                checked={defaultKind === id}
                onChange={() => { setDefaultKind(id) }}
              />
              <span>{t(labelKey)}</span>
            </label>
          ))}
        </div>
        {defaultKind === 'persistent'
          ? (
            <label className={css.persistentField}>
              <span className={css.fieldLabel}>{t('settings.defaultPersistentName')}</span>
              <select
                className={css.select}
                value={defaultPersistentName}
                onChange={(event) => { setDefaultPersistentName(event.target.value) }}
              >
                <option value="">{t('settings.defaultPersistentName.empty')}</option>
                {namedProfiles.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )
          : null}
      </div>
      <div className={css.rosterSection}>
        <div className={css.rosterHeader}>
          <h3 className={css.rosterTitle}>{t('settings.roster')}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<IconPlusOutline16 size={14} />}
            onClick={(event) => {
              closeRename()
              addOpener.current = event.currentTarget
              setAddOpen(true)
            }}
          >
            {t('settings.roster.openAdd')}
          </Button>
        </div>
        {namedProfiles.length === 0
          ? <p className={css.empty}>{t('settings.roster.empty')}</p>
          : (
            <ul className={css.roster}>
              {namedProfiles.map((name) => {
                const editing = renameFrom === name
                const next = renameDraft.trim()
                const renameInvalid = next.length > 0 && !isBrowserProfileName(next)
                const renameDuplicate = next !== name && namedProfiles.includes(next)
                const canRename = next !== name && !renameInvalid && !renameDuplicate
                if (editing) {
                  return (
                    <li key={name} className={`${css.rosterRow} ${css.rosterRowEditing}`}>
                      <form
                        className={css.renameForm}
                        onSubmit={(event) => {
                          event.preventDefault()
                          commitRename()
                        }}
                      >
                        <div className={css.renameLine}>
                          <Input
                            className={`${css.renameInput} ${renameInvalid || renameDuplicate ? css.inputInvalid : ''}`}
                            type="text"
                            value={renameDraft}
                            autoFocus
                            spellCheck={false}
                            aria-label={`${t('settings.roster.name')}: ${name}`}
                            aria-invalid={renameInvalid || renameDuplicate || undefined}
                            aria-describedby={renameInvalid || renameDuplicate ? 'browser-profile-rename-error' : undefined}
                            onChange={(event) => { setRenameDraft(event.target.value) }}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                closeRename()
                              } else if (event.key === 'Enter') {
                                event.preventDefault()
                                commitRename()
                              }
                            }}
                          />
                          <span className={css.renameActions}>
                            <Button type="button" variant="outline" size="sm" onClick={closeRename}>
                              {t('settings.cancel')}
                            </Button>
                            <Button type="submit" variant="primary" size="sm" disabled={!canRename}>
                              {t('settings.roster.save')}
                            </Button>
                          </span>
                        </div>
                        {renameInvalid || renameDuplicate
                          ? (
                            <p id="browser-profile-rename-error" className={css.error} role="alert">
                              {t(renameInvalid ? 'settings.roster.invalid' : 'settings.roster.duplicate')}
                            </p>
                          )
                          : null}
                      </form>
                    </li>
                  )
                }
                return (
                  <li key={name} className={css.rosterRow}>
                    <span className={css.profileIdentity}>
                      <span className={css.profileIcon} aria-hidden="true">
                        <IconGlobeOutline14 size={14} />
                      </span>
                      <span className={css.profileName}>{name}</span>
                    </span>
                    <span className={css.rosterActions}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={css.iconAction}
                        icon={<IconEditOutline16 size={14} />}
                        aria-label={`${t('settings.roster.rename')}: ${name}`}
                        title={t('settings.roster.rename')}
                        onClick={() => {
                          setRenameFrom(name)
                          setRenameDraft(name)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`${css.iconAction} ${css.removeAction}`}
                        icon={<IconTrashOutline16 size={14} />}
                        aria-label={`${t('settings.roster.remove')}: ${name}`}
                        title={t('settings.roster.remove')}
                        onClick={() => { removeNamedProfile(name) }}
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
      </div>
      <Modal
        open={addOpen}
        onClose={closeAdd}
        title={t('settings.roster.addTitle')}
        closeLabel={t('settings.close')}
        className={css.dialog as string}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={closeAdd}>{t('settings.cancel')}</Button>
            <Button
              type="submit"
              variant="primary"
              form="browser-profile-add-form"
              disabled={addBlocked}
            >
              {t('settings.roster.submit')}
            </Button>
          </>
        )}
      >
        <form
          id="browser-profile-add-form"
          className={css.dialogField}
          onSubmit={(event) => {
            event.preventDefault()
            if (addBlocked) return
            addNamedProfile(addName)
            closeAdd()
          }}
        >
          <label className={css.fieldLabel} htmlFor="browser-profile-add-name">
            {t('settings.roster.add')}
          </label>
          <Input
            id="browser-profile-add-name"
            className={`${css.modalInput} ${addInvalid || addDuplicate ? css.inputInvalid : ''}`}
            type="text"
            value={addDraft}
            autoFocus
            spellCheck={false}
            aria-invalid={addInvalid || addDuplicate || undefined}
            aria-describedby={addInvalid || addDuplicate ? 'browser-profile-name-error' : undefined}
            onChange={(event) => { setAddDraft(event.target.value) }}
          />
          {addInvalid || addDuplicate
            ? (
              <p id="browser-profile-name-error" className={css.error} role="alert">
                {t(addInvalid ? 'settings.roster.invalid' : 'settings.roster.duplicate')}
              </p>
            )
            : null}
        </form>
      </Modal>
    </section>
  )
}
