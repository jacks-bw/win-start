// Own resources even when an async continuation registers them after disposal.
export function createDisposalScope() {
  let disposed = false
  const resources = new Set<() => void>()
  function add(cleanup: () => void) {
    let active = true
    const release = () => {
      if (!active) return
      active = false
      resources.delete(release)
      cleanup()
    }
    if (disposed) release()
    else resources.add(release)
    return release
  }
  function dispose() {
    if (disposed) return
    disposed = true
    // A faulty cleanup must not prevent the remaining resources being released.
    for (const release of [...resources]) {
      try { release() } catch (error) { console.error('[cleanup]', error) }
    }
  }
  function delay(callback: () => void, milliseconds: number) {
    if (disposed) return
    const timer = setTimeout(() => {
      release()
      if (!disposed) callback()
    }, milliseconds)
    const release = add(() => clearTimeout(timer))
    return release
  }
  return { add, dispose, delay, get disposed() { return disposed } }
}
