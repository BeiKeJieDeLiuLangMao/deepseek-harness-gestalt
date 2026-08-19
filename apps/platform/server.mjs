#!/usr/bin/env node
/**
 * Platform listen process. Secrets come from deployment injection.
 * Account and Relay composition is not mounted in this image yet.
 */
import { createServer } from 'node:http'

const REQUIRED = [
  'PLATFORM_ORIGIN',
  'PLATFORM_GITHUB_CLIENT_ID',
  'PLATFORM_GITHUB_CLIENT_SECRET',
  'PLATFORM_POSTGRES_HOST',
  'PLATFORM_POSTGRES_USER',
  'PLATFORM_POSTGRES_PASSWORD',
  'PLATFORM_REDIS_HOST',
  'PLATFORM_REDIS_PASSWORD',
]

function missingSecrets() {
  return REQUIRED.filter((name) => {
    const value = process.env[name]
    return value === undefined || value === ''
  })
}

const host = process.env.PLATFORM_LISTEN_HOST === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0'
const port = Number(process.env.PORT ?? '8080')
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new TypeError('PORT must be an integer from 1 to 65535')
}

const absent = missingSecrets()
if (absent.length > 0) {
  console.error(`platform: missing deployment secrets: ${absent.join(', ')}`)
  process.exit(1)
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://platform.invalid').pathname
  if (req.method === 'GET' && (path === '/healthz' || path === '/readyz')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error: 'not_found' }))
})

server.listen(port, host, () => {
  console.error(`platform: listening on ${host}:${String(port)}`)
})
