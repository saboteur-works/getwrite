# Spike A: tooltip positioning and touch dismiss against a hit-target line

Source spec: `specs/features/entity-graph-edge-tooltips.md` (OQ-1, OQ-3).
Source task: `specs/features/entity-graph-edge-tooltips/tasks.md`, Task 2.

## Method

A throwaway Storybook story rendered a standalone SVG canvas (800x560
viewBox, matching `EntityGraphCanvas.tsx`'s default `width`/`height`) with
two nodes at opposite corners — `(40,40)` and `(760,520)` — connected by one
edge. That edge's length is `sqrt(720² + 480²) ≈ 865.2px`, ≈88.6% of the
canvas's own diagonal (`sqrt(800² + 560²) ≈ 976.9px`), satisfying the task's
"spans a large fraction of the canvas diagonal" requirement. A second,
transparent, 24px-wide `<line>` sharing the same endpoints was added as the
hit-target, carrying `data-tooltip-id`/`data-tooltip-content` per
`HoverTip.tsx`'s existing attribute contract.

The story was served from a real Storybook dev server (port 6100) and
driven with Playwright (`chromium`, real browser, not jsdom) in two separate
browser contexts:

1. **Float mode** — a `<Tooltip float style={TOOLTIP_STYLE} />` bound only
   to the hit-target's `data-tooltip-id`, no `openOnClick`. Driven with
   `page.mouse.move` (desktop mouse emulation, default `hasTouch: false`
   context).
2. **openOnClick** — a separate `<Tooltip openOnClick style={TOOLTIP_STYLE} />`
   on an identical hit-target line, no `float`. Driven with
   `page.touchscreen.tap()` in a context created with
   `hasTouch: true, isMobile: true` — genuine Playwright touch-event
   emulation (`touchstart`/`touchend` dispatch), not a mouse-click
   substitution.

They were tested as two separate `<Tooltip>` instances/anchors, not one
combined instance, for a reason that is itself a finding — see "Finding:
combining `float` and `openOnClick` on one anchor" below.

The prototype code (the story file and three scratch Playwright driver
scripts) was discarded after this spike; it is not part of this task's
diff. Reproducing it: add a transparent wide `<line>` with
`data-tooltip-id`/`data-tooltip-content` next to a `<Tooltip>` using the
props above, in any story, and drive it with Playwright as described.

## Finding 1 (OQ-1/FR-4): `float` mode hover positioning — PASS

Five points along the diagonal hit-target were hovered (mouse, desktop
context): the exact node-A center, a point ~43px along the line from node A
(just outside its 22px `NODE_RADIUS`, i.e. "near the endpoint but on the
edge, not on the node"), the line's midpoint, the mirrored near-node-B
point, and the exact node-B center.

Measured tooltip bounding boxes vs. the hovered cursor position and vs. the
two nodes' own rendered bounding boxes (all in CSS px, one browser
viewport):

| Point | Cursor (x,y) | Tooltip box (x,y,w,h) | Overlaps inspected node's box? |
|---|---|---|---|
| Node-A center (unrealistic — see caveat) | (72, 108) | (82, 89.25, 255.9, 37.5) | Yes — 12.5px of the tooltip's left edge falls inside node A's box (49.5–94.5, 85.5–130.5) |
| Near A (realistic, off-node) | (108, 132) | (118, 113.25, 255.9, 37.5) | No — tooltip's x-range (118–374) starts past node A's box (49.5–94.5) |
| Midpoint | (432, 348) | (304.0, 300.5, 255.9, 37.5) | No node at this point |
| Near B (realistic, off-node) | (756, 564) | (628.0, 516.5, 255.9, 37.5) | No — tooltip's y-range (516.5–554) ends before node B's box begins (565.5–610.5) |
| Node-B center (unrealistic — see caveat) | (792, 588) | (526.0, 569.25, 255.9, 37.5) | Yes — tooltip's x-range (526–782) covers node B's box (769.5–814.5) |

Caveat on the two "node center" rows: in the real `EntityGraphCanvas.tsx`,
nodes render in a `<g>` **after** the edges `<g>` (see the component's own
markup order), so a node visually and pointer-wise sits on top of an edge's
hit-target for any point within the node's own 22px radius — a cursor
exactly at a node's center would hit the node, not the edge, in production.
This spike's throwaway story stacked its hit-target line last (on top of
everything, including the nodes), so those two rows measure a
non-representative case. The other three rows — near-A (just outside the
node radius), midpoint, and near-B — are the representative cases for "near
an endpoint" as a user would actually encounter it, and all three show the
tooltip legible, near the cursor (within ~10–20px), and never overlapping
the node whose edge is being inspected.

**Verdict for this finding alone: PASS.** In the realistic near-endpoint and
midpoint cases, `float` mode places the tooltip legibly near the cursor
without covering the inspected node.

## Finding 2 (OQ-3/FR-5): `openOnClick` touch tap show/dismiss — FAIL

Touch emulation (Playwright context with `hasTouch: true, isMobile: true`,
driven via `page.touchscreen.tap()`, genuine touch-event dispatch):

| Action | Tooltip visible after |
|---|---|
| (baseline, before any tap) | false |
| Tap 1 on hit-target | **true** — shows correctly |
| Tap 2 on the *same* hit-target | **true** — does NOT dismiss |
| Tap 3 on the same hit-target (re-confirm show) | true |
| Tap 4 elsewhere on the canvas | **false** — dismisses correctly |

**Specific observed failure:** a second tap on the same hit-target does not
dismiss the tooltip; it stays open. Only a tap outside the anchor dismisses
it. This traces to `react-tooltip`'s own `openOnClick` implementation
(`frontend/node_modules/react-tooltip/dist/react-tooltip.mjs`, the `Tooltip`
component, ~line 442–458): when `openOnClick` is true and no explicit
`closeEvents` is supplied, `click` is left `false` in `actualCloseEvents`
for the anchor itself — the anchor's own click is wired only to *show*, not
toggle. The only close event enabled by default in this configuration is
`clickOutsideAnchor` (part of `actualGlobalCloseEvents`), which is exactly
why "tap elsewhere" works but "tap the same target again" does not.

FR-5's text ("a second tap on the same hit-target or a tap elsewhere MUST
dismiss it") is satisfiable through the "tap elsewhere" path alone if read
as "at least one of these gestures dismisses it." Read the more natural
way — each named gesture independently dismisses it, matching a mobile
user's expectation that tapping the thing they just tapped toggles it back
off — the plain `openOnClick` prop by itself does not satisfy FR-5: a
user who taps an edge, then taps the same edge again expecting it to close,
sees nothing happen.

## Finding 3 (unprompted, but load-bearing for the combined verdict): `float` + `openOnClick` cannot simply be combined on one anchor

The spec's own Task 2 wording calls this "the same wiring" and Task 5's
PASS path plans to extend `hoverTipProps`/`HoverTipSurface` to pass through
*both* `float` and `openOnClick` for one edge's hit-target (hover on
desktop, tap on touch, on the identical anchor). Before splitting the two
mechanisms into separate anchors for the two findings above, this was tried
directly: a single `<Tooltip float openOnClick ... />` bound to one
hit-target line. Result: hovering near either endpoint or the midpoint
**never showed the tooltip at all** (all three `tooltipVisible: false`).

Root cause, confirmed by reading the same `Tooltip` component's event-wiring
logic (`frontend/node_modules/react-tooltip/dist/react-tooltip.mjs`, ~line
424–441): when `openOnClick` is true and no explicit `openEvents` override
is supplied, `mouseover`/`mouseenter`/`focus` are all force-set to `false`
in `actualOpenEvents` — `openOnClick`'s default wiring assumes it is the
*only* way to open the tooltip, silently disabling hover. Combining the two
props as bare booleans is not enough; a real implementation would need an
explicit `openEvents={{ mouseover: true, click: true }}` (and a
corresponding `closeEvents` override to also fix Finding 2) to make both
work on the same anchor — extra wiring beyond what FR-4/FR-5 describe as
"the `float` mode" and "the `openOnClick` option" respectively.

## Verdict

**FAIL** — for the combined mechanism, as required by Task 2's own
tie-breaker rule that a mixed result counts as FAIL.

- Finding 1 (`float` hover positioning): PASS in isolation.
- Finding 2 (`openOnClick` touch dismiss): FAIL — a second tap on the same
  hit-target does not dismiss the tooltip under the plain `openOnClick`
  option; only a tap elsewhere does.
- Finding 3: the two mechanisms cannot be combined on one anchor via bare
  `float`/`openOnClick` booleans alone — `openOnClick`'s default event
  wiring silently disables hover entirely, which is exactly the
  configuration Task 5's PASS path would need for one edge's hit-target to
  serve both desktop hover and touch tap.

Per Task 2's own rule ("a mixed result — one working, one not — counts as
FAIL, since FR-4 and FR-5 both need to hold for this branch to be viable"),
this spike's overall verdict is **FAIL**. Task 5 should proceed on its FAIL
path: a bespoke tooltip overlay following the `RefHoverPreview.tsx` pattern,
not an extension of `HoverTip.tsx`'s `float`/`openOnClick` passthrough.

Note for whoever builds the FAIL-path fallback: Finding 2 and Finding 3 are
both specifically about `react-tooltip`'s *default* event wiring when
`openOnClick`/`float` are passed as bare booleans — this spike did not
attempt a hand-tuned `openEvents`/`closeEvents` override (e.g.
`openEvents={{ mouseover: true, click: true }}`,
`closeEvents={{ mouseout: true, click: true }}`) that might resolve both
findings while staying inside `react-tooltip`. That configuration was out of
scope for this time-boxed spike, which was asked to prototype "`float`
mode" and "the `openOnClick` option" as named — not a hand-tuned combination
of lower-level event props. If a future spike wants to re-open this
question with that override, it would need its own pass/fail check against
the same long-diagonal-edge and touch-emulation criteria used here, since
this spike's FAIL verdict rests on the plain-boolean configuration only.
