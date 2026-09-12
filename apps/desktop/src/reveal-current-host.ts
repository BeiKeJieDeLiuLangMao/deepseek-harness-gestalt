/**
 * Reveal a captured Host/window and observe overlay installation failure.
 * @param target Exact reopen window.
 * @param running Host captured before creating the window.
 * @param ports Ownership, presentation and valid-window error handling operations.
 * @returns Resolves after presentation or current-owner error handling; the awaited error-handler rejection propagates to the caller.
 */
export async function revealCurrentHost<Window, Host extends {
  readonly url: string
  readonly launchUrl: string
}>(
  target: Window,
  running: Host,
  ports: {
    current(): Host | undefined
    shuttingDown(): boolean
    closed(): boolean
    validWindow(target: Window): boolean
    reveal(target: Window, url: string): Promise<void>
    installOverlay(target: Window, url: string): Promise<unknown>
    showError(target: Window, error: unknown): Promise<void>
  },
): Promise<void> {
  try {
    await ports.reveal(target, running.launchUrl)
    if (!ports.validWindow(target) || ports.shuttingDown() || ports.closed() || ports.current() !== running) return
    await ports.installOverlay(target, running.url)
  } catch (error) {
    if (ports.validWindow(target) && ports.current() === running && !ports.shuttingDown() && !ports.closed()) {
      await ports.showError(target, error)
    }
  }
}

/**
 * Bind an overlay and publish only while its captured owners remain valid.
 * @param view Exact candidate overlay.
 * @param ports Binding, current ownership, publication and stale-view disposal operations.
 * @returns The published view, or undefined after stale disposal; binding failures propagate after disposal.
 */
export async function bindCurrentOverlay<View>(view: View, ports: {
  bind(view: View): Promise<void>
  current(): boolean
  publish(view: View): void
  dispose(view: View): void
}): Promise<View | undefined> {
  try {
    if (!ports.current()) { ports.dispose(view); return }
    await ports.bind(view)
    if (!ports.current()) { ports.dispose(view); return }
    ports.publish(view)
    return view
  } catch (error) {
    ports.dispose(view)
    throw error
  }
}
