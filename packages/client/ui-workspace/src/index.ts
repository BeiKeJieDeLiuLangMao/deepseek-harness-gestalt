/**
 * Workspace picker plugin, node half. Pure UI plugin: the empty apply exists
 * so the plugin appears in the host cordis.yml / Loader (load and lifecycle
 * follow the host; the browser half ships via exports["./client"], discovered
 * through the package.json dsh.client declaration).
 */
export { Config } from './config.ts'
export type { WorkspaceConfig } from './config.ts'

/** Host plugin body — no host-side behavior for the workspace picker plugin. */
export function apply(): void {}
