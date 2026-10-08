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
 * A prior version of this helper chained a fixed ten `Promise.resolve()`
 * awaits instead, measurably faster (~34–35s vs. ~36s across the full
 * suite) and passing every test that exists today. Reverted: unlike the
 * macrotask tick, a fixed hop count isn't structurally guaranteed to
 * cover a chain of arbitrary depth — a future sidebar section with one
 * more `.then()` hop than today's would silently under-flush, with
 * nothing failing until that new code shipped. That's the exact
 * "passes now, flakes later" failure class this helper exists to
 * eliminate, so the measured speedup wasn't worth trading it away for
 * (code review caught this).
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
