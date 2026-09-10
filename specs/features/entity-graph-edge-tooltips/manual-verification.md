# Manual verification: entity graph edge tooltips

Source task: `specs/features/entity-graph-edge-tooltips/tasks.md`, Task 8.

Task 8 was marked `[x]` by the implementation run in commit `f2cb11f9`, which
changed only the checkbox. Its own "Done when" requires each item to be
"confirmed by hand and recorded in the task's completion note"; no such note
was written. This file is that record, produced by re-running the
verification rather than inheriting the earlier unbacked claim.

## Method

The `entities` feature flag is not enabled on any project in the repo's
`projects/` directory, so the Graph view is not reachable in the real app as
checked out. Rather than modify a real project, the verification ran the Next
dev server against a **disposable copy**:

- `projects/c02957ec-…` (The SF Sideshow — 6 declared entities, populated
  mention index) copied to a temp workspace.
- On the copy only: `features: {entities: true, entityHighlighting: true}`,
  `relationshipTypes: ["ally of", "rival of", "mentor of"]`, and two authored
  relationships seeded into `meta/relationships.json` so both edge kinds
  would render.
- `GETWRITE_PROJECTS_DIR=<temp> pnpm dev -p 3210`.

The copy was confirmed to be the read path (the API returned the copy's
`features` and `relationshipTypes`, which do not exist in the real project),
and the real project was confirmed unmodified afterwards (`features: null`,
no `relationships.json`, `git status projects/` clean). The temp workspace
was deleted.

Driven with Playwright against Chromium. Hovers were real pointer hovers on
the hit-target line, not synthetic DOM events.

## Rendered state

6 nodes, 11 edges, 11 hit-target lines — 9 co-occurrence, 2 authored. Every
hit-target measured `stroke-width="12"`, `stroke="transparent"`, matching
`spike-b-hit-target-width.md`'s derived width.

## Results

| # | Check | Result |
|---|---|---|
| 1 | Hover near an edge's midpoint (not its exact rendered pixel) shows the tooltip — FR-3 | PASS — hover at the hit-target's bbox centre, i.e. the segment midpoint, showed the tooltip for both edge kinds |
| 2 | Tooltip text matches the accessible list for the same edge — FR-2 | PASS — authored: `Sheryl Bowers → Cecilia Gonzalez (ally of)`; co-occurrence: `Keller and Casey Thorne share 11 resources`. Both matched an accessible-list entry by exact string equality |
| 3 | Touch tap shows, second tap or outside tap dismisses — FR-5 | **NOT VERIFIED** — see below |
| 4 | A node never shows a hover tooltip — FR-8 | PASS — hovering a node produced no tooltip |
| 5 | Keyboard focus never lands on an edge, no tooltip on edge focus — FR-9 | PASS — 0 edge elements carry `tabindex` or `role="button"`; the 6 nodes remain focusable, unchanged |
| 6 | Exercised on native Android | NOT VERIFIED — no device available |

Dismiss-on-unhover was observed incidentally: the tooltip was absent after
the pointer moved from an edge to a node.

## Item 3 was not verified, and the earlier run's claim of it is unsupported

The implementation run reported touch tap show/dismiss as passing. No
artifact records that check, and this pass did not reproduce it: the
verification above used desktop pointer hover only. Task 8's own notes call
the touch-emulation check "not optional, since FR-5 is this feature's own new
requirement", so FR-5 currently has **no recorded end-to-end verification on
a touch input path** — only the jsdom component tests added in Task 5.

## Finding: the tooltip covers a node of the edge being inspected

Measured, on both edges tested:

- Authored edge `Sheryl Bowers → Cecilia Gonzalez`: tooltip box (570, 377,
  297x30) overlapped the rendered boxes of nodes `Cecilia Gonzalez` and
  `Devin Striker`.
- Co-occurrence edge `Keller and Casey Thorne`: tooltip overlapped node
  `Keller`.

In both cases the covered node is an endpoint of the hovered edge.

`spike-a-tooltip-mechanism.md` used "places the tooltip legibly near the
cursor without covering the node being inspected" as its pass criterion, and
applied it to `react-tooltip`'s `float` mode. That criterion was never
re-applied to the bespoke overlay that actually shipped on the FAIL path.

This is a measurement, not a diagnosis. Whether it is a positioning defect,
an acceptable trade-off (the tooltip text names both entities, so the covered
node is still identifiable), or specific to this fixture's layout is not
established here. Hovering a larger sample of edges across several graph
densities and recording the overlap rate would settle it.

## Tooltip placement (FR-10), 2026-09-10

**Method.** A browser (Playwright, Chromium) against the dev server with a
disposable copy of a six-entity project. Every edge was hovered with a real
mouse at five points along its length — 20%, 35%, 50%, 65%, 80% — skipping
points that landed on a node rather than the edge: 37 hovers across 10 of the
11 edges. For each, the tooltip's rectangle was compared with the rendered
boxes of every node and with the viewport. Run at 1280×800 and at 411×850.

The "after" run is against a freshly started server confirmed to be serving the
new code: the tooltip's computed `max-width` reads `260px`. An earlier attempt
measured a stale server that had never picked up the edits — file-watching is
blocked in the environment the server was started from — and its numbers are
discarded.

| Same 37 hovers | Desktop before | Desktop after | Phone before | Phone after |
|---|---|---|---|---|
| Covers an endpoint of the hovered edge | 54% (20) | **14% (5)** | 54% (20) | **38% (14)** |
| Extends past the viewport | 0% | 0% | 100% | **0%** |
| Covers any node | 84% | 84% | 84% | **100%** |
| Tooltip size (px) | 291–357 × 30 | 260 × 46 | 291–357 × 30 | 260 × 46 |

**Not improvements, recorded as measured:**

- On a phone the tooltip still covers one of the hovered edge's endpoints in 14
  of 37 hovers. A 260px tooltip on a 411px screen often has no position clear
  of both nodes, so the least-overlap rule applies (FR-10, OQ-4).
- On a phone it now covers *some* node in every hover, up from 84%. Clamping
  pulls it inward, where the graph is, and nodes other than the hovered edge's
  endpoints are deliberately not avoided (OQ-4).
- At every screen size, tooltips now wrap at 260px, so a relationship that
  previously read on one line now takes two.

The flat 260 × 46 size in both "after" runs reflects this fixture — every edge
description here is long enough to hit the cap. Shorter descriptions render
narrower.

### On a Pixel 7 Pro — real WebView, taps (2026-09-10)

The same method adapted for touch, on a debug build of this branch: 37 real
taps (`adb shell input tap`) at the same five points along each of 10 edges,
after scrolling the pane so the six-node cluster (367px wide) sat centred on
the 411px screen. Each tap point was checked over DevTools before it was sent,
so none landed on a node, and the tooltip was dismissed with a tap on empty
canvas between samples.

| Measured on device | Result |
|---|---|
| Tooltip shown | 37 of 37; none left hidden; no tap navigated away |
| Extends past the viewport | 0% |
| Tooltip size (px) | 260 × 46 |
| Covers an endpoint of the tapped edge | **49% (18)** |
| Covers any node | 100% |

The old placement was pointer-relative, so its 54% rate applies at these same
points: on the device the endpoint figure moved 54% → 49%, much less than the
54% → 38% that desktop Chromium measured at 411×850. The two phone-width runs
differ in where the graph sat (centred here; not recorded in the browser run),
viewport height (826 vs 850px), and input (tap vs hover). Which of these
accounts for the gap was not established.

What the device run does establish: on a phone-sized screen with the graph
nearly filling the width, a 260 × 46 tooltip usually has no position clear of
the tapped edge's nodes, and least-overlap placement (FR-10) only partly
helps. Clipping, by contrast, is fully fixed on the device.

