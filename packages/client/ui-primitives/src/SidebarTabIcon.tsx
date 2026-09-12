/** Shared renderer for Sidebar tab descriptor icon tokens. */
import type { ReactNode } from 'react'
import {
  IconBranchOutline16,
  IconCodeOutline16,
  IconFolderOpen16,
  IconGlobeOutline14,
  IconNewChatOutline16,
  IconPhoneOutline16,
  IconThinkOutline16,
} from './icons/index.tsx'

/**
 * Render a registered Sidebar tab icon token for menus and guide cards.
 * @param token - renderer-independent token carried by the tab definition.
 * @param size - square icon size in pixels.
 * @returns the matching icon, or `undefined` for an extension-owned token.
 */
export function sidebarTabIcon(token: string | undefined, size = 16): ReactNode | undefined {
  if (token === 'files' || token === 'editor') return <IconFolderOpen16 size={size} />
  if (token === 'diff' || token === 'git') return <IconBranchOutline16 size={size} />
  if (token === 'tasks' || token === 'subagent') return <IconThinkOutline16 size={size} />
  if (token === 'sidechat') return <IconNewChatOutline16 size={size} />
  if (token === 'terminal') return <IconCodeOutline16 size={size} />
  if (token === 'browser') return <IconGlobeOutline14 size={size} />
  if (token === 'phone') return <IconPhoneOutline16 size={size} />
  return undefined
}
