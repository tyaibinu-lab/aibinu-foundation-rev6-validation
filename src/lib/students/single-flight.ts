/**
 * Synchronous duplicate-submission guard. React's `isPending` only disables a
 * button after the next render, so a fast double-click can fire twice; this
 * gate rejects a second start until the first call has settled.
 */
export function createSingleFlight() {
  let busy = false;
  return {
    get busy() { return busy; },
    /** Returns false (and does nothing) when another action is already in flight. */
    run(start: (settle: () => void) => void): boolean {
      if (busy) return false;
      busy = true;
      start(() => { busy = false; });
      return true;
    },
  };
}
