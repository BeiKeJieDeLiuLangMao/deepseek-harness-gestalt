const fs = require('node:fs')
const { spawn, spawnSync } = require('node:child_process')
const args = process.argv.slice(2)
const path = process.env.MEMBERSHIP_DOCKER_STATE
const state = JSON.parse(fs.readFileSync(path, 'utf8'))
fs.appendFileSync(process.env.MEMBERSHIP_DOCKER_LOG, `${args.join(' ')}\n`)
const find = value => state.containers.find(container => container.Id === value || container.Name === `/${value}`)
const save = () => fs.writeFileSync(path, JSON.stringify(state))
function execute(command, container) {
  const entry = command.findIndex(arg => arg === 'dist/membership-cutover-cli.mjs')
  if (entry !== -1 && command[entry + 1] === 'capture') {
    const bindings = new Map()
    for (let index = 0; index < command.length; index++) {
      if (command[index] !== '--mount') continue
      const fields = Object.fromEntries(command[++index].split(',').filter(field => field.includes('=')).map(field => field.split('=')))
      bindings.set(fields.target, fields.type === 'volume' ? state.volume : fields.source)
    }
    const childArgs = command.slice(entry + 1).map(arg => {
      for (const [mount, directory] of bindings) if (arg.startsWith(`${mount}/`)) return directory + arg.slice(mount.length)
      return arg
    })
    const child = spawnSync(process.execPath, ['--import', 'tsx/esm', process.env.MEMBERSHIP_CAPTURE_CLI, ...childArgs], {
      encoding: 'utf8', cwd: process.env.MEMBERSHIP_REPO, env: { PATH: process.env.PATH }, timeout: 10000,
    })
    return child.status ?? 1
  }
  if (entry !== -1 && command[entry + 1] === 'import' && process.env.MEMBERSHIP_FAILURE === 'daemon-wait') {
    const marker = process.env.MEMBERSHIP_DAEMON_MARKER
    const child = spawn(process.execPath, ['-e', `const fs=require('node:fs');let n=0;setInterval(()=>fs.writeFileSync(${JSON.stringify(marker)},String(++n)),20)`], {
      detached: true, stdio: 'ignore',
    })
    fs.writeFileSync(process.env.MEMBERSHIP_DAEMON_PID, String(child.pid))
    child.unref()
    if (container) {
      Object.assign(container.State, { Running: true, Pid: child.pid })
      save()
    } else setInterval(() => {}, 1000)
    return null
  }
  return process.env.MEMBERSHIP_FAILURE === 'metadata' ? 1 : 0
}
if (args[0] === 'ps') {
  let containers = state.containers
  if (args.includes('--filter')) {
    const filter = args[args.indexOf('--filter') + 1]
    if (filter.startsWith('name=')) containers = containers.filter(container => new RegExp(filter.slice(5)).test(container.Name))
    if (filter.startsWith('id=')) containers = containers.filter(container => container.Id === filter.slice(3))
  }
  process.stdout.write(containers.map(container => container.Id).join('\n'))
} else if (args[0] === 'inspect') process.stdout.write(JSON.stringify(args.slice(1).map(find).filter(Boolean)))
else if (args[0] === 'image' && args[1] === 'inspect') {
  const revision = args[2] === state.predecessorImage ? state.predecessorRevision : state.candidateRevision
  process.stdout.write(JSON.stringify([{ Config: { Labels: { 'org.opencontainers.image.revision': revision } } }]))
} else if (args[0] === 'create') {
  const labels = {}
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== '--label') continue
    const value = args[++index]
    labels[value.slice(0, value.indexOf('='))] = value.slice(value.indexOf('=') + 1)
  }
  state.nextId = (state.nextId ?? 10) + 1
  const id = state.nextId.toString(16).padStart(64, '0')
  state.containers.push({ Id: id, Name: `/${args[args.indexOf('--name') + 1]}`, Command: args,
    Config: { Image: args.find(value => value.startsWith('ghcr.io/')), Labels: labels, Env: [] }, Mounts: [],
    HostConfig: { RestartPolicy: { Name: 'no', MaximumRetryCount: 0 } },
    State: { Status: 'created', Running: false, Pid: 0, ExitCode: 0 },
  })
  save()
  process.stdout.write(id)
} else if (args[0] === 'start') {
  const container = find(args[1])
  const result = execute(container.Command, container)
  if (result !== null) Object.assign(container.State, { Status: 'exited', Running: false, Pid: 0, ExitCode: result })
  save()
  process.stdout.write(container.Id)
} else if (args[0] === 'wait') {
  const container = find(args[1])
  if (container.State.Running) setInterval(() => {}, 1000)
  else process.stdout.write(String(container.State.ExitCode))
} else if (args[0] === 'kill') {
  const container = find(args[1])
  try { process.kill(container.State.Pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  Object.assign(container.State, { Status: 'exited', Running: false, Pid: 0, ExitCode: 137 })
  save()
} else if (args[0] === 'rm') {
  const id = args.at(-1)
  state.containers = state.containers.filter(container => container.Id !== id)
  save()
} else if (args[0] === 'update') {
  find(args[2]).HostConfig.RestartPolicy = { Name: args[1].slice('--restart='.length), MaximumRetryCount: 0 }
  save()
} else if (args[0] === 'stop') {
  if (process.env.MEMBERSHIP_FAILURE === 'stop') process.exit(1)
  Object.assign(find(args.at(-1)).State, { Status: 'exited', Running: false, Pid: 0, ExitCode: process.env.MEMBERSHIP_FAILURE === 'abnormal-stop' ? 137 : 0 })
  save()
} else if (args[0] === 'run') {
  const code = execute(args, null)
  if (code !== null) process.exit(code)
} else process.exit(1)
