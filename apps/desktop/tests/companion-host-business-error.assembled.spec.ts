/** Companion encoding of a shipped Host structured business rejection. */

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  createCompanionNegotiationChannel,
  createCompanionVersionOffer,
  decodeCompanionMessage,
  encodeCompanionMessage,
  negotiateCompanionProtocol,
  parseCompanionOperationId,
  REMOTE_PROTOCOL_LIMITS,
} from '@deepseek-ai/dsh-remote-protocol'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import { bootstrapDesktopHostCookie } from '../src/host-rpc.ts'
import {
  generateDesktopHostTypertArtifacts, startShippedWebHost, stopShippedWebHosts,
} from './shipped-web-host.ts'

const children: RunningWebHost[] = []
const homes: string[] = []
const uninstalls: Array<() => void> = []
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

afterEach(async () => {
  try {
    for (const uninstall of uninstalls.splice(0).reverse()) uninstall()
  } finally {
    await stopShippedWebHosts(children, homes)
  }
})

describe('assembled Desktop Companion Host business error on shipped dsh web', () => {
  it('preserves one generated Gateway bad-request through Companion encoding', async () => {
    const first = await startShippedWebHost({ children, homes })
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    uninstalls.push(owner.installHost(first.running.url, cookie))
    const operationId = parseCompanionOperationId('desktop-host-business-bad-request')
    const result = await owner.handle({
      type: 'search-sessions', operationId, query: '',
    }, {
      pairingId: parsePersonalPairingId('desktop-host-business-pairing'),
      attachmentKey: new Uint8Array(32), now: Date.now,
      generation: 1, desktopRevision: 1, desktopName: 'Assembled Desktop',
      downloadAttachment: () => Promise.reject(new Error('search must not download')),
      submitAttachment: () => Promise.reject(new Error('search must not submit')),
      resolveInteraction: () => undefined, pendingInteractions: () => [],
    })
    expect(result).toEqual({
      type: 'operation-failed', operationId,
      failure: {
        kind: 'business', code: 'bad-request',
        message: '[gateway/bad-request] session search query must not be empty',
      },
    })
    if (!('type' in result) || result.type !== 'operation-failed') {
      throw new Error('expected one Companion operation failure')
    }
    const protocol = negotiateCompanionProtocol(
      createCompanionNegotiationChannel(),
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    expect(decodeCompanionMessage(protocol, encodeCompanionMessage(protocol, {
      type: 'result', result,
    }))).toEqual({ type: 'result', result })
  }, 180_000)
})
