/**
 * Allow-only tool eligibility resolved from preset, Workspace, and Session
 * configuration.
 * @module @deepseek-ai/dsh-tools-eligibility
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
// Type-only imports install the service declarations used through Context.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'

/** Cordis plugin name. */
export const name = 'tool-eligibility'

/** User-settings namespace for Workspace and Session additions. */
export const TOOL_ELIGIBILITY_SETTINGS_NAMESPACE = settingsNamespace('tool-eligibility')

/** Positive user configuration layered above preset allowances. */
export interface Config {
  /** Tool names added for every session in the Workspace keyed by its stable id. */
  workspaces: Record<string, string[]>
  /** Tool names added for the Session keyed by its durable id. */
  sessions: Record<string, string[]>
}

/** Runtime and settings schema. Both maps are allow-only. */
export const Config: z<Config> = z.object({
  workspaces: z.dict(z.array(z.string().min(1))).default({}),
  sessions: z.dict(z.array(z.string().min(1))).default({}),
})

/** Effective allow declaration and the exact currently eligible schemas. */
export interface ToolEligibilityResolution {
  /** Sorted union of configured allowances, or absent when eligibility is unrestricted. */
  readonly allow?: readonly string[]
  /** Schemas the agent may currently expose and execute. */
  readonly tools: readonly ToolSchema[]
}

interface AgentEligibilityState {
  readonly agent: Agent
  additions: readonly string[] | undefined
  lift: (() => void) | undefined
}

const sameNames = (left: readonly string[] | undefined, right: readonly string[] | undefined): boolean =>
  left === right || (left !== undefined && right !== undefined
    && left.length === right.length && left.every((name, index) => name === right[index]))

/**
 * Host-plane eligibility resolver. A configured Workspace or Session entry
 * contributes to the same positive scope-chain union as preset declarations;
 * no declaration preserves the existing unrestricted catalog.
 */
export class ToolEligibilityService extends Service {
  static inject = ['agents', 'tools']

  private source: () => Config
  private readonly states = new Map<Agent, AgentEligibilityState>()

  /**
   * @param ctx - host context carrying agent and tool registries.
   * @param config - composition defaults beneath live user settings.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'toolEligibility')
    const entry = Config(config)
    this.source = () => entry

    ctx.on('agent/created', ({ agent }) => { this.attach(agent) })
    ctx.on('agent/disposed', ({ agent }) => { this.states.delete(agent) })
    installSettingsSection(ctx, TOOL_ELIGIBILITY_SETTINGS_NAMESPACE, Config, entry, {
      setSource: (source) => { this.source = source },
      onChange: () => { this.refreshAll() },
    })

    for (const agent of ctx.agents.list()) this.attach(agent)
  }

  /**
   * Resolve the configured allowances and live eligible catalog for an agent.
   * @param agent - live agent whose preset, Workspace, and Session apply.
   * @returns a fresh Host API projection.
   */
  resolve(agent: Agent): ToolEligibilityResolution {
    const allow = this.resolveAllow(agent)
    return {
      ...allow === undefined ? {} : { allow: [...allow] },
      tools: agent.ctx.tools.schemas(agent),
    }
  }

  /** Begin enforcing eligibility for one published agent. */
  private attach(agent: Agent): void {
    if (this.states.has(agent)) return
    const state: AgentEligibilityState = {
      agent,
      additions: undefined,
      lift: undefined,
    }
    this.states.set(agent, state)
    this.refresh(state)
  }

  /** Refresh every live agent after a settings change. */
  private refreshAll(): void {
    for (const state of this.states.values()) this.refresh(state)
  }

  /** Replace one agent's Workspace and Session allowance contribution. */
  private refresh(state: AgentEligibilityState): void {
    const additions = this.resolveAdditions(state.agent)
    if (sameNames(state.additions, additions)) return

    state.additions = additions
    const prior = state.lift
    state.lift = additions === undefined
      ? undefined
      : state.agent.ctx.tools.allowEligible(additions)
    prior?.()
  }

  /** Read the full preset, Workspace, and Session union from the tool registry. */
  private resolveAllow(agent: Agent): readonly string[] | undefined {
    return agent.ctx.tools.eligibilityAllow(agent)
  }

  /** Union Workspace and Session additions contributed by this service. */
  private resolveAdditions(agent: Agent): readonly string[] | undefined {
    const config = this.source()
    const workspace = this.workspaceFor(agent)
    const workspaceAllow = workspace === undefined ? undefined : config.workspaces[String(workspace.id)]
    const sessionAllow = config.sessions[String(agent.session.id)]
    if (workspaceAllow === undefined && sessionAllow === undefined) return undefined
    return [...new Set([...workspaceAllow ?? [], ...sessionAllow ?? []])].sort()
  }

  /** Resolve the optional Workspace owning the session cwd without I/O. */
  private workspaceFor(agent: Agent): Workspace | undefined {
    const registry = this.ctx.get('workspaceRegistry')
    const cwd = agent.session.header.cwd
    return cwd === undefined ? undefined : registry?.list().find(workspace => workspace.path === cwd)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    toolEligibility: ToolEligibilityService
  }
}

export default ToolEligibilityService
