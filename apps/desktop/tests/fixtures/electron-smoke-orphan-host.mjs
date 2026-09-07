import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const role = process.argv[2]
const origin = 'http://127.0.0.1:43123'
if (role === 'host') {
  process.on('SIGTERM', () => {})
  process.stdout.write(`host ${origin} pid ${process.pid}\n`)
  setInterval(() => {}, 1_000)
} else {
  const host = spawn(process.execPath, [fileURLToPath(import.meta.url), 'host', 'web', '--host', '127.0.0.1', '--port', '0'], {
    env: process.env,
    detached: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  host.stdout.once('data', chunk => {
    process.stdout.write(chunk)
    process.kill(process.pid, 'SIGKILL')
  })
}
