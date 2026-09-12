if (process.argv[2] === 'ignore-term') {
  process.on('SIGTERM', () => {})
  process.stdout.write('ready\n')
  setInterval(() => {}, 1_000)
} else {
  process.stdout.write('done\n')
}
