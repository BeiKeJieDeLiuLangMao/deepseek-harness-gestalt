import { spawn } from 'node:child_process'

const dshHome = process.argv[2]
const role = process.argv[3]
if (role === 'host') {
  process.on('SIGTERM', () => {})
  process.stdout.write(`host http://127.0.0.1:43123 pid ${process.pid}\n`)
  setInterval(() => {}, 1_000)
} else {
  const host = spawn(process.execPath, [new URL(import.meta.url).pathname, dshHome, 'host', 'http://127.0.0.1:43123'], {
    env: { ...process.env, DSH_HOME: dshHome }, detached: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  host.stdout.once('data', chunk => {
    process.stdout.write(chunk)
    process.kill(process.pid, 'SIGKILL')
  })
}
