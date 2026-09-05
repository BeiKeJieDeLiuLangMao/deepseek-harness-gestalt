/**
 * Loader-validated workspace plugin tunables. Invitation poll cadence is a
 * deployment field filled by schemastery defaults.
 */
import z from '@deepseek-ai/schemastery'

/** Workspace plugin configuration. */
export interface WorkspaceConfig {
  /** Inbound-invitation poll interval in milliseconds. */
  pollIntervalMs?: number
}

/** Schemastery schema for the workspace plugin configuration. */
export const Config: z<WorkspaceConfig> = z.object({
  pollIntervalMs: z.number().step(1).min(1).default(15_000),
})
