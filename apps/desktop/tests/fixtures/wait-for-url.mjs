import { writeFileSync } from 'node:fs'

const pidFile = process.env.DSH_TEST_PID_FILE
if (pidFile === undefined) throw new Error('DSH_TEST_PID_FILE is required')
writeFileSync(pidFile, String(process.pid))
setInterval(() => {}, 1 << 30)
