import { act } from "@testing-library/react";

/**
 * Flushes a mounted component's pending fetch-then-setState effect(s) —
 * the pattern several sidebar sections use (`TagsSection.tsx`,
 * `ProseDiagnosticsSection.tsx`, etc.: a `useEffect` that kicks off a fetch
 * on mount and calls `setState` in its `.then()`/`.catch()`) — inside
 * `act()`, so a test that doesn't otherwise await that update (via
 * `findBy*`/`waitFor`) doesn't trip React's "not wrapped in act(...)"
 * warning for it.
 *
 * A macrotask tick (`setTimeout`), not a single microtask
 * (`Promise.resolve()`), because the real chain is several microtask hops
 * deep (`fetch` → `response.json()` → the transport's own `.then()`), and
 * microtasks always finish draining before the next macrotask runs — so a
 * macrotask tick is guaranteed to observe the effect's completed update
 * regardless of how many hops it took, while a single microtask await is
 * not.
 *
 * Call once, right after `render()`, for a test that doesn't itself assert
 * on the section this settles (if it does, prefer `findBy*`/`waitFor`,
 * which already wrap in `act()` and additionally assert something real).
 */
export async function flushPendingEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
