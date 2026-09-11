/** Keyless real-sender composition for the Project Members transcript. */

import crypto from 'node:crypto'
import { Module } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import CompanionMemberQuestionSender, {
  type MemberQuestionDeliveryPort,
} from '../../../packages/interaction/member-question-sender/src/index.ts'
import { parseInstallationId } from '../../../packages/platform/platform-account/src/index.ts'
import type { CompanionMemberQuestionSettledResult } from '../../../packages/platform/remote-protocol/src/index.ts'

export const name = 'project-members-memory-member-question'

/**
 * Module-scoped sequence preserves first-round golden question id and avoids
 * collisions across re-applies of the same module instance. Cache-busted module
 * reload is not claimed.
 */
let sequence = 0

interface ActivePatch {
  readonly owner: symbol
  readonly patched: typeof crypto.randomUUID
}

const patchStack: ActivePatch[] = []
let rootOriginalRandomUUID: typeof crypto.randomUUID | undefined

/** Compose the production sender with an immediate keyless member answer. */
export async function apply(ctx: Context): Promise<void> {
  const owner = Symbol(name)
  if (rootOriginalRandomUUID === undefined) {
    rootOriginalRandomUUID = crypto.randomUUID
  }

  // Pin dashless `mq` question ids; identity redaction matches hyphenated UUIDs only.
  const patchedRandomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    sequence += 1
    return `36f683c1-23df-4b88-9d68-${sequence.toString(16).padStart(12, '0')}`
  }

  patchStack.push({ owner, patched: patchedRandomUUID })
  crypto.randomUUID = patchedRandomUUID
  Module.syncBuiltinESMExports()

  let restored = false
  const restore = (): void => {
    if (restored) return
    restored = true
    const index = patchStack.findIndex(entry => entry.owner === owner)
    if (index === -1) return
    const wasTop = index === patchStack.length - 1
    patchStack.splice(index, 1)

    if (wasTop) {
      const nextTop = patchStack.at(-1)
      if (nextTop !== undefined) {
        crypto.randomUUID = nextTop.patched
      } else if (rootOriginalRandomUUID !== undefined) {
        crypto.randomUUID = rootOriginalRandomUUID
        rootOriginalRandomUUID = undefined
      }
      Module.syncBuiltinESMExports()
    }
  }

  try {
    ctx.effect(() => () => {
      restore()
    }, `${name}: randomUUID lifecycle restore`)

    const terminals = new Map<string, CompanionMemberQuestionSettledResult>()
    const delivery: MemberQuestionDeliveryPort = {
      deliver: async (encoded) => {
        queueMicrotask(() => {
          void sender.settle(encoded.questionId, {
            outcome: 'answered',
            answers: [{ id: 'rollout', selected: ['approve'] }],
            settledByInstallationId: parseInstallationId('installation-demo-member'),
            settledByDeviceName: 'Demo Member Desktop',
            settledAt: 1_756_000_300_000,
          })
        })
      },
      publishTerminal: async (terminal) => {
        const retained = terminals.get(terminal.questionId)
        if (retained !== undefined) return { claimed: false, terminal: retained }
        terminals.set(terminal.questionId, terminal)
        return { claimed: true, terminal }
      },
      queryTerminal: async questionId => terminals.get(questionId),
    }
    const sender = new CompanionMemberQuestionSender(ctx, {
      delivery,
      presenceLookup: async () => 'online',
    })
  } catch (error) {
    restore()
    throw error
  }
}
