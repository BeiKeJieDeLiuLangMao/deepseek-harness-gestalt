/** CSS Modules class-map declaration (tsdown compiles .module.css at build). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** xterm stylesheet imported by the Host-reachable terminal view. */
declare module '@xterm/xterm/css/xterm.css'
