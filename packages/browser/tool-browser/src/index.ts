/** Deferred model-facing Consumer of the Browser Runtime capability. @module @deepseek-ai/dsh-tool-browser */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserTabId,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'
import type { BrowserTarget } from '@deepseek-ai/dsh-browser-runtime'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'tool-browser'
/** Browser Runtime and tool registry required by this Consumer. */
export const inject = ['browserRuntime', 'tools']

/** Model-facing Browser tool configuration. */
export interface Config {
  /** Cooperative timeout budget in milliseconds for each Browser Runtime call. */
  readonly timeoutMs?: number
}

/** Runtime configuration schema for the Browser tool Consumer. */
export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(30_000),
})

const TARGET_PROPERTIES = {
  profileId: { type: 'string', required: true },
  workspaceId: { type: 'string', required: true },
  browserId: { type: 'string', required: true },
  tabId: { type: 'string', required: true },
} as const

const TARGET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: TARGET_PROPERTIES,
} as const

const OPEN_STATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', required: true, const: 'open' },
    target: { ...TARGET_SCHEMA, required: true },
    revision: { type: 'integer', required: true },
    url: { type: 'string', required: true },
    title: { type: 'string', required: true },
    text: { type: 'string', required: true },
    focused: { type: 'boolean', required: true },
  },
} as const

const CLOSED_STATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', required: true, const: 'closed' },
    target: { ...TARGET_SCHEMA, required: true },
    revision: { type: 'integer', required: true },
  },
} as const

const STATE_SCHEMA = { oneOf: [OPEN_STATE_SCHEMA, CLOSED_STATE_SCHEMA] } as const

const SCREENSHOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: { ...TARGET_SCHEMA, required: true },
    revision: { type: 'integer', required: true },
    url: { type: 'string', required: true },
    title: { type: 'string', required: true },
    mediaType: { type: 'string', required: true, const: 'image/png' },
    data: { type: 'string', required: true },
  },
} as const

const TARGET_PARAMETER = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: TARGET_PROPERTIES,
} as const

/** Complete Browser facts are rendered into the durable ordinary tool result. */
function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/** Convert schema-validated model strings into the Service Definition's opaque identities. */
function targetFrom(raw: {
  profileId: string
  workspaceId: string
  browserId: string
  tabId: string
}): BrowserTarget {
  for (const [key, value] of Object.entries(raw)) {
    if (value.trim().length === 0) throw new Error(`${key} must be a non-empty Browser Runtime identity`)
  }
  return {
    profileId: BrowserProfileId(raw.profileId),
    workspaceId: BrowserWorkspaceId(raw.workspaceId),
    browserId: BrowserInstanceId(raw.browserId),
    tabId: BrowserTabId(raw.tabId),
  }
}

/** Reject revisions outside the Provider's non-negative safe-integer sequence. */
function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('expectedRevision must be a non-negative safe integer')
  }
  return value
}

/**
 * Register six deferred Browser Runtime operations without presentation-specific cards.
 * @param ctx - Consumer context with Browser Runtime and tool registry services.
 * @param config - Per-call timeout configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const timeoutMs = config.timeoutMs ?? 30_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('tool-browser: config.timeoutMs must be a positive safe integer')
  }

  ctx.tools.register({
    ...defineTool({
      name: 'browser_create',
      description: 'Create one temporary Browser Profile, Browser Workspace, browser instance, and tab.',
      timeoutMs,
      parameters: {},
      output: { schema: OPEN_STATE_SCHEMA, render: renderValue },
      execute: async (_args, exec) => ctx.browserRuntime.create({ profile: 'temporary', signal: exec.signal }),
    }),
    deferLoading: true,
  })

  ctx.tools.register({
    ...defineTool({
      name: 'browser_navigate',
      description: 'Navigate one browser tab to a URL using its latest revision.',
      timeoutMs,
      parameters: {
        target: TARGET_PARAMETER,
        expectedRevision: { type: 'integer', required: true, description: 'Latest revision returned by a browser operation.' },
        url: { type: 'string', required: true, description: 'URL to open in the browser tab.' },
      },
      output: { schema: OPEN_STATE_SCHEMA, render: renderValue },
      execute: async (args, exec) => {
        if (args.url.trim().length === 0) throw new Error('url must be non-empty')
        return ctx.browserRuntime.navigate({
          target: targetFrom(args.target),
          expectedRevision: revision(args.expectedRevision),
          url: args.url,
          signal: exec.signal,
        })
      },
    }),
    deferLoading: true,
  })

  ctx.tools.register({
    ...defineTool({
      name: 'browser_observe',
      description: 'Observe the latest facts for one browser tab, including a closed receipt.',
      timeoutMs,
      parameters: { target: TARGET_PARAMETER },
      output: { schema: STATE_SCHEMA, render: renderValue },
      execute: async (args, exec) => ctx.browserRuntime.observe({ target: targetFrom(args.target), signal: exec.signal }),
    }),
    deferLoading: true,
  })

  ctx.tools.register({
    ...defineTool({
      name: 'browser_screenshot',
      description: 'Capture the deterministic PNG screenshot facts for one browser tab.',
      timeoutMs,
      parameters: { target: TARGET_PARAMETER },
      output: { schema: SCREENSHOT_SCHEMA, render: renderValue },
      execute: async (args, exec) => ctx.browserRuntime.screenshot({ target: targetFrom(args.target), signal: exec.signal }),
    }),
    deferLoading: true,
  })

  ctx.tools.register({
    ...defineTool({
      name: 'browser_focus',
      description: 'Focus one browser tab using its latest revision.',
      timeoutMs,
      parameters: {
        target: TARGET_PARAMETER,
        expectedRevision: { type: 'integer', required: true, description: 'Latest revision returned by a browser operation.' },
      },
      output: { schema: OPEN_STATE_SCHEMA, render: renderValue },
      execute: async (args, exec) => ctx.browserRuntime.focus({
        target: targetFrom(args.target),
        expectedRevision: revision(args.expectedRevision),
        signal: exec.signal,
      }),
    }),
    deferLoading: true,
  })

  ctx.tools.register({
    ...defineTool({
      name: 'browser_close',
      description: 'Close one browser tab and its temporary Browser Profile using the latest revision.',
      timeoutMs,
      parameters: {
        target: TARGET_PARAMETER,
        expectedRevision: { type: 'integer', required: true, description: 'Latest revision returned by a browser operation.' },
      },
      output: { schema: CLOSED_STATE_SCHEMA, render: renderValue },
      execute: async (args, exec) => ctx.browserRuntime.close({
        target: targetFrom(args.target),
        expectedRevision: revision(args.expectedRevision),
        signal: exec.signal,
      }),
    }),
    deferLoading: true,
  })
}
