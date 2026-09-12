/** Official Sidebar file tab: viewer host, editor chrome, and embedded file tree. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SidebarRightViewerDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { IconCheckOutline16, IconFolderOpen16, IconRefreshOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { api, isOutsideWorkspaceMessage, mediaUrl, type SessionScope } from '../api.ts'
import { BinaryDownload } from '../binary-download.tsx'
import { FenceErrorNotice } from '../FenceErrorNotice.tsx'
import { createFrameBatcher } from '../frame-batcher.ts'
import { baseName } from '../FileTree.tsx'
import { saveShortcutTitle, t } from '../locales.ts'
import { openWithSshActive, openWithUrl, parseOpenWithConfig, resolveOpenWithTargets } from '../open-with.ts'
import { relativeTo } from '../paths.ts'
import { resolveSidebarPath } from '../produced-files.ts'
import { TreePanel } from '../TreePanel.tsx'
import type { EditorToolbarControls, EditorToolbarState } from '../service.ts'
import css from '../sidebar.module.css'
import { officialFileAddress, parseOfficialFileAddress } from './address.ts'
import type { OfficialFileViewerOwnerProps, OfficialFileTabPayload } from './contract.ts'
import type { OfficialFileInjected } from './face.ts'
import type { createOfficialFilesStore } from './store.ts'

type OfficialFileBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<ReturnType<typeof createOfficialFilesStore>>
  & PropsRenderSlots<'sidebar.right.file.viewer'>
  & InjectFace<OfficialFileInjected>
  & PropsLocale<'betterSidebar'>

type FileLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'binary' }
  | {
    readonly status: 'ready'
    readonly viewer: SidebarRightViewerDefinition
    readonly content?: string
    readonly truncated?: boolean
    readonly mediaUrl?: string
    readonly customData?: JsonValue | Uint8Array
  }

const TREE_WIDTH_DEFAULT = 240
const TREE_WIDTH_MIN = 160
const TREE_WIDTH_MAX = 480

/** Official navigator options preserving merged-in-pane versus split-new-tab behavior. */
export function treeSelectionOpenOptions(inPlace: boolean, paneId: string): { paneId: string } | { payload: OfficialFileTabPayload } {
  return inPlace
    ? { paneId }
    : { payload: { treeOpen: false, treeWidth: TREE_WIDTH_DEFAULT, dir: false } }
}

function payloadOf(value: JsonValue | undefined): OfficialFileTabPayload {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : {}
  return {
    treeOpen: record.treeOpen === true,
    treeWidth: typeof record.treeWidth === 'number' ? record.treeWidth : TREE_WIDTH_DEFAULT,
    dir: record.dir === true,
  }
}

function treeWidthOf(payload: OfficialFileTabPayload): number {
  const value = payload.treeWidth
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(value)))
    : TREE_WIDTH_DEFAULT
}

function decodeHead(headBase64: string): Uint8Array {
  const binary = atob(headBase64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function lineOf(params: unknown): number | undefined {
  if (params === null || typeof params !== 'object' || !('line' in params)) return undefined
  const line = (params as { line?: unknown }).line
  return typeof line === 'number' ? line : undefined
}

/** File viewer, editor, and tree hosted inside one official tab occurrence. */
export function OfficialEditorHost(props: OfficialFileBodyProps): ReactNode {
  const {
    useTabInfo, useSessions, useStore, renderSlot,
    useFilePreferences, useFileViewers, start, toggle, reveal, split,
    matchViewer, viewerSettings, htmlSafety, setOpenWith, disableWorkspaceFence,
    writeFile, openExternal, reference, insertText, renamed, removed,
    armEditor, retainedEditor, retainEditor, setDirty,
  } = props
  const { panel, tab } = useTabInfo()
  const homeSessionId = tab.sessionId
  const parsed = useMemo(() => parseOfficialFileAddress(tab.contentId), [tab.contentId])
  const resourceSessionId = parsed?.sessionId
  const cwd = useSessions(sessions => resourceSessionId === undefined
    ? undefined
    : sessions.byId[resourceSessionId]?.cwd)
  const path = parsed?.scope === 'session' ? resolveSidebarPath(cwd, parsed.path) : undefined
  const scope: SessionScope | undefined = resourceSessionId === undefined
    ? undefined
    : { sessionId: resourceSessionId, ...(cwd === undefined ? {} : { cwd }) }
  const payload = payloadOf(tab.payload)
  const treeRoot = payload.dir === true ? path : cwd
  const state = useStore(snapshot => snapshot.byTab[tab.id])
  const preferences = useFilePreferences(snapshot => snapshot.preferences)
  const viewerRevision = useFileViewers(viewers => viewers)
  const inPlace = preferences.editorExplorer
  const editorBlob = preferences.pluginSettings.editor ?? {}
  const openWithConfig = useMemo(() => parseOpenWithConfig(editorBlob.openWith), [editorBlob])
  const openWithTargets = useMemo(() => resolveOpenWithTargets(openWithConfig), [openWithConfig])
  const [load, setLoad] = useState<FileLoad>({ status: 'loading' })
  const [reloadSeq, setReloadSeq] = useState(0)

  useEffect(() => {
    if (treeRoot === undefined || state !== undefined || tab.signal.aborted) return
    start(tab.id, treeRoot, tab.signal)
  }, [treeRoot, state, tab.id, tab.signal, start])

  const appliedRevealRevision = useRef<number>()
  const treeReady = state !== undefined
  useEffect(() => {
    const paths = (tab.navigation.params as { readonly reveal?: readonly string[] } | undefined)?.reveal
    if (!treeReady || paths === undefined || appliedRevealRevision.current === tab.navigation.revision) return
    appliedRevealRevision.current = tab.navigation.revision
    reveal(tab.id, paths)
  }, [treeReady, tab.id, tab.navigation.params, tab.navigation.revision, reveal])

  useEffect(() => { armEditor(homeSessionId, tab.id, tab.signal) }, [armEditor, homeSessionId, tab.id, tab.signal])

  const addressFor = (absolute: string): string | undefined => resourceSessionId === undefined
    ? undefined
    : officialFileAddress(resourceSessionId, cwd, absolute)
  const openFile = (absolute: string): void => {
    const address = addressFor(absolute)
    if (address === undefined) return
    tab.actions.openResource(address, treeSelectionOpenOptions(inPlace, panel.id))
  }
  const openFileNewTab = (absolute: string): void => {
    const address = addressFor(absolute)
    if (address === undefined) return
    tab.actions.openResource(address, {
      payload: { treeOpen: false, treeWidth: TREE_WIDTH_DEFAULT, dir: false },
    })
  }
  const openFileSide = (absolute: string): void => {
    const address = addressFor(absolute)
    if (address === undefined) return
    const paneId = split(panel.id)
    if (paneId !== undefined) {
      tab.actions.openResource(address, {
        paneId,
        revealIfOpened: false,
        payload: { treeOpen: false, treeWidth: TREE_WIDTH_DEFAULT, dir: false },
      })
    }
  }
  const openWith = (targetId: string, absolute: string): void => {
    const target = openWithTargets.find(item => item.id === targetId)
    if (target === undefined) return
    if (target.kind === 'reveal') {
      void openExternal({ action: 'reveal', path: absolute }).catch(error => { console.error('open external failed', error) })
      return
    }
    const url = openWithUrl(target, absolute, openWithConfig)
    if (url !== undefined) {
      void openExternal({ action: 'url', url }).catch(error => { console.error('open external failed', error) })
    }
  }
  const toggleOpenWithPin = (targetId: string): void => {
    const pinned = openWithConfig.pinned.includes(targetId)
      ? openWithConfig.pinned.filter(id => id !== targetId)
      : [...openWithConfig.pinned, targetId]
    void setOpenWith({
      sshHost: openWithConfig.sshHost,
      customEditors: openWithConfig.customEditors.map(editor => ({
        id: editor.id,
        name: editor.name,
        urlTemplate: editor.urlTemplate,
        isVscodeFamily: editor.isVscodeFamily,
      })),
      pinned,
    })
  }

  const [toolbar, setToolbar] = useState<EditorToolbarState | null>(null)
  const controlsRef = useRef<EditorToolbarControls | null>(null)
  const onToolbarState = useCallback((next: EditorToolbarState) => {
    setToolbar(previous => previous !== null && JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
  }, [])
  const onToolbarControls = useCallback((controls: EditorToolbarControls | null) => {
    controlsRef.current = controls
  }, [])

  const refreshFile = (): void => {
    if (toolbar?.dirty === true && (typeof window.confirm !== 'function' || !window.confirm(t('refreshUnsavedConfirm')))) return
    setReloadSeq(sequence => sequence + 1)
  }

  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const pendingWidthRef = useRef(0)
  const dragBatcher = useRef(createFrameBatcher()).current
  useEffect(() => () => dragBatcher.dispose(), [dragBatcher])
  const treeWidth = dragWidth ?? treeWidthOf(payload)
  const onResizeStart = (event: React.PointerEvent): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: treeWidth }
  }
  const onResizeMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    pendingWidthRef.current = Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(drag.startWidth + drag.startX - event.clientX)))
    dragBatcher.schedule(() => { setDragWidth(pendingWidthRef.current) })
  }
  const onResizeEnd = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    dragBatcher.flushNow()
    dragRef.current = null
    const width = Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(drag.startWidth + drag.startX - event.clientX)))
    setDragWidth(null)
    if (width !== treeWidthOf(payload)) tab.actions.update({ payload: { ...payload, treeWidth: width } })
  }

  useEffect(() => {
    setToolbar(null)
    if (path === undefined || scope === undefined || payload.dir === true) return
    const controller = new AbortController()
    const abort = (): void => { controller.abort() }
    tab.signal.addEventListener('abort', abort, { once: true })
    setLoad({ status: 'loading' })
    const settleViewer = async (viewer: SidebarRightViewerDefinition): Promise<void> => {
      switch (viewer.fetchStrategy) {
        case 'binary-download':
          setLoad({ status: 'ready', viewer })
          return
        case 'mediaUrl':
        case 'none':
          setLoad({ status: 'ready', viewer, mediaUrl: mediaUrl(scope, path) })
          return
        case 'custom': {
          if (viewer.load === undefined) throw new Error(`file viewer "${viewer.id}" has no loader`)
          const customData = await viewer.load({
            address: tab.contentId,
            path,
            sessionId: resourceSessionId,
            signal: controller.signal,
            settings: viewerSettings(viewer.id),
          })
          if (!controller.signal.aborted) setLoad({ status: 'ready', viewer, customData })
          return
        }
        case 'fsRead': {
          const result = await api.fsRead(scope, path, controller.signal)
          if (controller.signal.aborted) return
          if (result.kind === 'text') {
            setLoad({ status: 'ready', viewer, content: result.content, truncated: result.truncated })
            return
          }
          const claimed = matchViewer(tab.contentId, path, decodeHead(result.head))
          if (claimed === undefined || claimed.fetchStrategy === 'fsRead') {
            setLoad({ status: 'binary' })
            return
          }
          await settleViewer(claimed)
        }
      }
    }
    const viewer = matchViewer(tab.contentId, path)
    if (viewer === undefined) setLoad({ status: 'binary' })
    else void settleViewer(viewer).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => {
      tab.signal.removeEventListener('abort', abort)
      controller.abort()
    }
  }, [resourceSessionId, cwd, tab.contentId, tab.signal, path, payload.dir, reloadSeq, viewerRevision])

  const previousSaveState = useRef<EditorToolbarState['saveState']>()
  useEffect(() => {
    const current = toolbar?.saveState
    if (previousSaveState.current !== 'saved' && current === 'saved' && toolbar?.mode === 'preview') {
      setReloadSeq(sequence => sequence + 1)
    }
    previousSaveState.current = current
  }, [toolbar?.mode, toolbar?.saveState])

  if (path === undefined || resourceSessionId === undefined || scope === undefined) {
    return <div className={css.editorError}>{t('error')}</div>
  }

  const treeOpen = payload.treeOpen === true
  const line = lineOf(tab.navigation.params)
  const saveLabel = toolbar === null ? ''
    : toolbar.saveState === 'saving' ? t('loading')
      : toolbar.saveState === 'saved' ? t('saved')
        : toolbar.saveState === 'failed' ? t('saveFailed') : ''

  const tree = (
    <TreePanel
      full={payload.dir === true}
      sessionId={resourceSessionId}
      cwd={treeRoot}
      disableWorkspaceFence={disableWorkspaceFence}
      expanded={state?.expanded ?? []}
      revealed={state?.revealed ?? []}
      onToggle={entry => { toggle(tab.id, entry) }}
      onOpenFile={openFile}
      onOpenFileNewTab={openFileNewTab}
      onOpenFileSide={openFileSide}
      openWithTargets={openWithTargets}
      openWithPinned={openWithConfig.pinned}
      openWithSsh={openWithSshActive(openWithConfig)}
      onOpenWith={openWith}
      onToggleOpenWithPin={toggleOpenWithPin}
      onReferenceFile={(entry, isDir) => { reference(resourceSessionId, entry, isDir, cwd) }}
      onPathRenamed={(oldPath, newPath) => {
        renamed(homeSessionId, resourceSessionId, oldPath, newPath, cwd)
      }}
      onPathDeleted={(entry) => { removed(homeSessionId, resourceSessionId, entry, cwd) }}
    />
  )
  if (payload.dir === true) return <div className={css.editor}>{tree}</div>

  let viewer: ReactNode
  if (load.status === 'loading') viewer = <div className={css.editorPlaceholder}>{t('loading')}</div>
  else if (load.status === 'error') {
    viewer = isOutsideWorkspaceMessage(load.message)
      ? <FenceErrorNotice disable={disableWorkspaceFence} onDisabled={refreshFile} />
      : <div className={css.editorError}>{load.message}</div>
  } else if (load.status === 'binary') viewer = <BinaryDownload scope={scope} path={path} />
  else {
    const owner: OfficialFileViewerOwnerProps = {
      address: tab.contentId,
      scope,
      path,
      title: tab.title,
      viewerId: load.viewer.id,
      content: load.content,
      truncated: load.truncated,
      mediaUrl: load.mediaUrl,
      customData: load.customData,
      line,
      navigationRevision: tab.navigation.revision,
      toolbar: 'host',
      onToolbarState,
      onToolbarControls,
      writeFile: content => writeFile(resourceSessionId, cwd, path, content),
      insertIntoConversation: text => { insertText(resourceSessionId, text) },
      htmlSafety: htmlSafety(),
      retained: retainedEditor(homeSessionId, tab.id),
      onRetain: retained => { retainEditor(homeSessionId, tab.id, retained) },
      onDirtyChange: dirty => { setDirty(homeSessionId, tab.id, dirty) },
    }
    viewer = renderSlot('sidebar.right.file.viewer', owner, {
      entryKey: load.viewer.id,
      fallback: <div className={css.editorError}>{t('renderError', { message: load.viewer.id })}</div>,
    })
  }

  return (
    <div className={css.editor} data-official-file-host={tab.contentId}>
      <div className={css.editorHeader}>
        <EditorPathInput path={path} cwd={cwd} onOpen={openFile} />
        {toolbar?.modes === true && (
          <div className={css.editorModeToggle}>
            <button type="button" className={clsx(css.editorModeButton, toolbar.mode === 'preview' && css.editorModeActive)} onClick={() => {
              if (toolbar.mode === 'edit' && !toolbar.dirty && toolbar.saveState !== 'failed') setReloadSeq(sequence => sequence + 1)
              controlsRef.current?.setMode('preview')
            }}>{t('preview')}</button>
            <button type="button" className={clsx(css.editorModeButton, toolbar.mode === 'edit' && css.editorModeActive)} onClick={() => { controlsRef.current?.setMode('edit') }}>{t('edit')}</button>
          </div>
        )}
        {toolbar?.dirty === true && <span className={css.dirtyDot} title={t('unsaved')} />}
        {toolbar?.editable === true && (
          <button type="button" className={css.iconButton} aria-label={t('save')} title={saveShortcutTitle()} onClick={() => { controlsRef.current?.save() }}>
            <IconCheckOutline16 size={14} />
          </button>
        )}
        {saveLabel !== '' && <span className={clsx(css.editorStatus, toolbar?.saveState === 'failed' && css.editorStatusError)}>{saveLabel}</span>}
        {toolbar !== null && (
          <button type="button" className={css.iconButton} aria-label={t('refresh')} title={t('refresh')} onClick={refreshFile}>
            <IconRefreshOutline14 size={14} />
          </button>
        )}
        <button type="button" className={clsx(css.iconButton, treeOpen && css.editorTreeToggleActive)} aria-label={t('editorTreeToggle')} title={t('editorTreeToggle')} aria-pressed={treeOpen} onClick={() => { tab.actions.update({ payload: { ...payload, treeOpen: !treeOpen } }) }}>
          <IconFolderOpen16 size={14} />
        </button>
      </div>
      <div className={css.editorBody}>
        <div className={css.editorMain}>{viewer}</div>
        {treeOpen && (
          <div className={css.editorTreeDock} style={{ width: treeWidth }}>
            <div className={css.editorTreeResize} role="separator" aria-orientation="vertical" aria-label={t('editorTreeToggle')} onPointerDown={onResizeStart} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd} />
            {tree}
          </div>
        )}
      </div>
    </div>
  )
}

function EditorPathInput({ path, cwd, onOpen }: { path: string; cwd: string | undefined; onOpen: (path: string) => void }): ReactNode {
  const display = relativeTo(cwd ?? '', path)
  const [value, setValue] = useState(display)
  useEffect(() => { setValue(display) }, [display])
  const commit = (): void => {
    const input = value.trim()
    if (input !== '' && input !== display) onOpen(resolveSidebarPath(cwd, input))
    setValue(display)
  }
  return (
    <input
      className={css.editorPathInput}
      value={value}
      placeholder={t('editorPathPlaceholder')}
      title={path}
      spellCheck={false}
      onChange={event => { setValue(event.target.value) }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        else if (event.key === 'Escape') setValue(display)
      }}
      onBlur={() => { setValue(display) }}
    />
  )
}
