/**
 * Durable Workspace Reference preferences. Shared by the Host schema and the
 * browser settings section.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the Workspace Reference plugins. */
export const WORKSPACE_REFERENCE_SETTINGS_NAMESPACE = 'workspace-reference'

/** Default product preferences. */
export const DEFAULT_WORKSPACE_REFERENCE_SETTINGS = {
  enable: true,
  pasteIgnore: true,
  exact: '',
  regex: '',
} as const

/** Durable Workspace Reference section. */
export interface WorkspaceReferenceSettings {
  /** When false, the picker and paste rewrite stay off. */
  enable: boolean
  /** When true, pasted `@` tokens receive a word joiner so they are not scanned. */
  pasteIgnore: boolean
  /** Basename substring filter; empty disables it. */
  exact: string
  /** Basename regular expression filter; empty or invalid disables it. */
  regex: string
}

/** Durable schema; also the wire envelope the browser scope validates against. */
export const WorkspaceReferenceSettingsSchema: z<WorkspaceReferenceSettings> = z.object({
  enable: z.boolean().default(DEFAULT_WORKSPACE_REFERENCE_SETTINGS.enable),
  pasteIgnore: z.boolean().default(DEFAULT_WORKSPACE_REFERENCE_SETTINGS.pasteIgnore),
  exact: z.string().default(DEFAULT_WORKSPACE_REFERENCE_SETTINGS.exact),
  regex: z.string().default(DEFAULT_WORKSPACE_REFERENCE_SETTINGS.regex),
})
