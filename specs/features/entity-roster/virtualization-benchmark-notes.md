# Entity roster — virtualization benchmark

Measured 2026-09-07 for POS `task_733deea7`, the follow-up the entity-roster
spec deferred when it recorded its no-virtualization decision as one "made in
the absence of measurement, not a performance claim"
(`specs/features/entity-roster.md`, "Out of scope (deferred)").

The spec named the measurement that would settle it: render
`EntityAliasTable`-shaped synthetic data at 100, 500, and 1,000 entities
through the roster's list markup and measure **initial render time** and
**scroll-interaction responsiveness**. Both halves were measured. The numbers
below are measurements; the reading of them is marked as such.

## Machine and build

| | |
| --- | --- |
| Machine | Apple M4 Pro, 24 GB, macOS 26.5.1 |
| Node | v24.15.0 |
| React / Next | 19.2.6 / 16.2.6 |
| jsdom harness | `frontend/tests/entityRosterRenderBenchmark.test.tsx`, vitest 4.1.6 |
| Browser harness | Chromium via Playwright, against `next dev` (Turbopack) |

**The browser numbers come from a development build**, not a production one:
React in development mode, unminified, Turbopack-served. A production build is
faster, so every browser figure below is an upper bound on what a user sees.

## Half 1 — initial render

### jsdom (React reconciliation + DOM construction only)

`pnpm --filter getwrite-frontend exec vitest run entityRosterRenderBenchmark --silent=false`,
median of three whole-suite runs, after a discarded warmup pass:

| entities | initial render (ms) | ms/entity | one full re-render (ms) |
| --- | --- | --- | --- |
| 100 | 22.1 | 0.221 | 6.1 |
| 500 | 74.7 | 0.149 | 9.6 |
| 1000 | 110.7 | 0.111 | 29.8 |

This excludes layout, paint and scroll — jsdom performs none of those. It is
the React half of the cost only.

### Real browser (click on the "Entities" tab → rows laid out)

Seven passes per size, switching away to the Data view and back each pass, with
a forced layout of the full list before the timing frame. Median (min–max):

| entities | click → laid out (ms) | DOM nodes in list | list height (px) |
| --- | --- | --- | --- |
| 100 | 50.1 (49.8–100.6) | 910 | 7,050 |
| 500 | 204.3 (200.5–247.9) | 4,550 | 35,250 |
| 1000 | 433.0 (376.2–462.1) | 9,100 | 70,500 |

Cost is linear in entity count at roughly 0.43 ms per entity, with no knee
across the measured range.

## Half 2 — scroll-interaction responsiveness

Same sessions: scroll the roster's scroll container from top to bottom in 60
steps, recording inter-frame intervals.

| entities | median frame (ms) | p95 (ms) | max (ms) | frames > 20 ms |
| --- | --- | --- | --- | --- |
| 100 | 8.3 | 8.5 | 8.6 | 0 |
| 500 | 8.3 | 8.7 | 9.2 | 0 |
| 1000 | 8.3 | 8.5 | 9.1 | 0 |

Scroll cost is flat across the range and independent of list length: not one
frame in 180 exceeded 20 ms at any size, including the 1,000-entity list whose
content box is 70,500 px tall.

## Reading of the numbers

The no-virtualization decision holds through 1,000 entities, and the two halves
say so for different reasons:

- **Scroll was the open risk and it is not a cost at all.** The browser's own
  culling handles a 70,500 px list; adding virtualization would buy nothing
  measurable here, at the price of a dependency and a scroll implementation to
  maintain.
- **The one-time mount is the only cost that grows**, at ~0.43 ms per entity in
  a dev build. At 1,000 entities that is ~0.43 s to switch into the tab, which
  is perceptible but is a one-time cost on a deliberate view switch, and the
  production build makes it smaller by an unmeasured margin.

Extrapolating the linear fit, a project would need roughly 2,300 entities
before the dev-build mount reached one second. No such project is known to
exist. **This is an extrapolation, not a measurement** — nothing above 1,000
entities was measured, and the fit's linearity is only established across
100–1,000.

## What is not settled here

- No production-build browser measurement was taken. If the mount time ever
  becomes the complaint, measuring `next build && next start` at 1,000 entities
  is the cheaper next step than virtualizing, since it may show the cost is
  already a third of the figure above.
- Nothing above 1,000 entities was measured.
- The measurement is desktop/web only. Android (ADR-021) was not measured; it
  has no dedicated roster code path, but it has a much slower CPU.
