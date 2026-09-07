/** Companion codec coverage for an external HTTP carrier status failure. */

import { beforeAll, describe, expect, it } from 'vitest'
import {
  createCompanionNegotiationChannel,
  createCompanionVersionOffer,
  decodeCompanionMessage,
  negotiateCompanionProtocol,
} from '@deepseek-ai/dsh-remote-protocol'
import { generateDesktopHostTypertArtifacts } from './shipped-web-host.ts'

let runHost400CodecProbe: typeof import('./host-400-codec-probe.ts').runHost400CodecProbe

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ runHost400CodecProbe } = await import('./host-400-codec-probe.ts'))
}, 120_000)

describe('Companion external HTTP carrier failure codec', () => {
  it('decodes one real TCP HTTP 400 with its exact operation and failure', async () => {
    const encoded = await runHost400CodecProbe()
    const protocol = negotiateCompanionProtocol(
      createCompanionNegotiationChannel(),
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    expect(decodeCompanionMessage(protocol, encoded)).toEqual({
      type: 'result',
      result: {
        type: 'operation-failed',
        operationId: 'visible-host-400',
        failure: {
          kind: 'http', code: 'HOST_HTTP_STATUS',
          message: 'Desktop Host returned HTTP 400', status: 400,
        },
      },
    })
  })
})
