#!/usr/bin/env node
/**
 * Platform listen process. Secrets come from deployment injection.
 * Account and Relay composition is not mounted in this image yet.
 * GET / serves the packaged documentation site when `public/` is present.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const SITE_ROOT = resolve(fileURLToPath(new URL('./public', import.meta.url)))

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

function missingSecrets() {
  return REQUIRED.filter((name) => {
    const value = process.env[name]
    return value === undefined || value === ''
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function reserved(path) {
  return path === '/healthz' || path === '/readyz' || path === '/v1' || path.startsWith('/v1/')
}

function siteFile(urlPath) {
  const decoded = decodeURIComponent(urlPath)
  if (decoded.includes('\0')) return undefined
  const rel = decoded.replace(/^\/+/, '')
  const abs = resolve(SITE_ROOT, rel)
  const bound = relative(SITE_ROOT, abs)
  if (bound.startsWith(`..${sep}`) || bound === '..' || normalize(bound).startsWith(`..${sep}`)) {
    return undefined
  }
  return abs
}

async function existingFile(candidate) {
  try {
    const info = await stat(candidate)
    if (info.isFile()) return candidate
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html')
      const indexInfo = await stat(index)
      if (indexInfo.isFile()) return index
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  return undefined
}

async function resolveSite(urlPath) {
  const direct = siteFile(urlPath)
  if (direct === undefined) return undefined
  const found = await existingFile(direct)
  if (found !== undefined) return found
  if (!urlPath.endsWith('/')) {
    const html = await existingFile(`${direct}.html`)
    if (html !== undefined) return html
  }
  return existingFile(join(SITE_ROOT, '404.html'))
}

function sendFile(res, file, method) {
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=60' })
  if (method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
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
  void (async () => {
    const path = new URL(req.url ?? '/', 'http://platform.invalid').pathname
    const method = req.method ?? 'GET'
    if ((method === 'GET' || method === 'HEAD') && (path === '/healthz' || path === '/readyz')) {
      json(res, 200, { ok: true })
      return
    }
    if ((method === 'GET' || method === 'HEAD') && !reserved(path)) {
      const file = await resolveSite(path)
      if (file !== undefined) {
        sendFile(res, file, method)
        return
      }
    }
    json(res, 404, { error: 'not_found' })
  })().catch(() => {
    if (!res.headersSent) json(res, 500, { error: 'internal' })
    else res.destroy()
  })
})

server.listen(port, host, () => {
  console.error(`platform: listening on ${host}:${String(port)}`)
})
