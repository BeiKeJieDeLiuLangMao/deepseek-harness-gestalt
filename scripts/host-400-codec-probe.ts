import { createServer } from 'node:http'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  createCompanionNegotiationChannel,
  createCompanionVersionOffer,
  encodeCompanionMessage,
  negotiateCompanionProtocol,
  parseCompanionOperationId,
  REMOTE_PROTOCOL_LIMITS,
} from '@deepseek-ai/dsh-remote-protocol'
import { DesktopCompanionProductOwner } from '../apps/desktop/src/companion-product.ts'

const server = createServer((_request, response) => {
  response.writeHead(400).end('carrier rejected the request')
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
try {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected Host TCP address')
  const owner = new DesktopCompanionProductOwner({
    timeoutMs: 1_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
  })
  owner.installHost(`http://127.0.0.1:${String(address.port)}`)
  const operationId = parseCompanionOperationId('visible-host-400')
  const result = await owner.handle({
    type: 'search-sessions', operationId, query: 'Host 400 visible alert',
  }, {
    pairingId: parsePersonalPairingId('visible-host-400-pairing'),
    pairingKey: new Uint8Array(32),
    now: Date.now,
    downloadAttachment: () => Promise.reject(new Error('search must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('search must not submit an attachment')),
  })
  const protocol = negotiateCompanionProtocol(
    createCompanionNegotiationChannel(),
    createCompanionVersionOffer('mobile'),
    createCompanionVersionOffer('desktop'),
  )
  process.stdout.write(Buffer.from(encodeCompanionMessage(protocol, { type: 'result', result })).toString('base64'))
} finally {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
}
