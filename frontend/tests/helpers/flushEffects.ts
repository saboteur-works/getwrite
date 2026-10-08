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
 * A chain of ten already-resolved microtask awaits, not a single one and
 * not a real timer tick (`setTimeout`): the real chain is several
 * microtask hops deep (`fetch` → `response.json()` → the transport's own
 * `.then()`), so a single `await Promise.resolve()` isn't enough — but
 * entering the timer queue with a real `setTimeout` isn't necessary either
 * once the hop count is covered, and costs real wall-clock time across the
 * 100+ call sites this is used from. Ten hops was chosen as comfortably
 * more than the real chain needs, then confirmed, not assumed: the full
 * suite (562 files) passes identically — same act() warnings, same
 * assertions — with this and with a real timer tick, and measurably faster
 * with this (two full-suite runs, ~34–35s vs. ~36s with the timer).
 *
 * Call once, right after `render()`, for a test that doesn't itself assert
 * on the section this settles (if it does, prefer `findBy*`/`waitFor`,
 * which already wrap in `act()` and additionally assert something real).
 */
export async function flushPendingEffects(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  });
}
