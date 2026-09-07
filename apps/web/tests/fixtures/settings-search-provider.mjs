import { createServer } from 'node:http'

const kimiKey = process.env.DSH_TEST_KIMI_SEARCH_KEY
const anthropicKey = process.env.DSH_TEST_ANTHROPIC_SEARCH_KEY
if (kimiKey === undefined || anthropicKey === undefined) process.exit(64)

const requests = []

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function credentialKind(value) {
  if (value === undefined) return 'absent'
  if (value === `Bearer ${kimiKey}` || value === kimiKey) return 'kimi'
  if (value === `Bearer ${anthropicKey}` || value === anthropicKey) return 'anthropic'
  return 'unexpected'
}

async function readBody(request) {
  let raw = ''
  for await (const chunk of request) raw += chunk
  return JSON.parse(raw)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/requests') {
      json(response, 200, requests)
      return
    }
    if (request.method !== 'POST') {
      json(response, 404, { error: 'not found' })
      return
    }

    const body = await readBody(request)
    const record = {
      path: url.pathname,
      authorization: credentialKind(request.headers.authorization),
      apiKey: credentialKind(request.headers['x-api-key']),
      body,
    }
    requests.push(record)

    if (url.pathname === '/kimi/search') {
      if (record.authorization !== 'kimi' || record.apiKey !== 'absent') {
        json(response, 401, { error: 'unexpected Kimi credentials' })
        return
      }
      json(response, 200, {
        search_results: [{
          url: 'https://kimi.example.test/result',
          title: 'Kimi assembled result',
          snippet: 'Kimi selection reached the Moonshot protocol.',
        }],
      })
      return
    }

    if (url.pathname === '/anthropic/messages') {
      if (record.authorization !== 'anthropic' || record.apiKey !== 'anthropic') {
        json(response, 401, { error: 'unexpected Anthropic credentials' })
        return
      }
      json(response, 200, {
        content: [
          { type: 'text', text: 'ok' },
          {
            type: 'web_search_tool_result',
            content: [{
              type: 'web_search_result',
              url: 'https://anthropic.example.test/result',
              title: 'Anthropic assembled result',
            }],
          },
        ],
      })
      return
    }

    json(response, 404, { error: 'unknown provider path' })
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (address === null || typeof address === 'string') process.exit(64)
  process.stdout.write(`${JSON.stringify({ baseURL: `http://127.0.0.1:${address.port}` })}\n`)
})

let closing = false
function close() {
  if (closing) return
  closing = true
  server.close(() => { process.exit(0) })
}

process.on('SIGINT', close)
process.on('SIGTERM', close)
