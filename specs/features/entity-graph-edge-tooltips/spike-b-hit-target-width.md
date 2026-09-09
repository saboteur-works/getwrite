# Spike B — measuring the edge hit-target stroke width

Task 3 of `entity-graph-edge-tooltips`. This is a measurement record, not a
design rationale — the numbers below were produced by actually running
`computeGraphLayout` (from
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`)
on three fixture datasets and computing the minimum segment-to-segment
distance between every pair of rendered edges in each settled layout. The
measurement script was a throwaway Vitest file
(`frontend/tests/component/_scratch-spike-b-measure.test.ts`) that imported
`computeGraphLayout` directly; it has been deleted and does not appear in this
task's diff.

## Method

For each fixture:

1. Build a `nodes`/`edges` list matching `EntityGraphNode`/`EntityGraphEdge`.
2. Call `computeGraphLayout(nodes, edges)` (default 800x560 viewport, the same
   defaults `EntityGraphCanvas` uses) to get a settled `positionedEdges` list
   (`{ x1, y1, x2, y2 }` per edge, after the fixed 300-tick `d3-force` run).
3. For every distinct pair of edges, computed the standard segment-to-segment
   minimum distance (closest of the four point-to-segment distances between
   each segment's endpoints and the other segment, or 0 if the two segments
   properly cross).
4. Pairs were split into three buckets, since not all zero/near-zero
   distances mean the same thing:
   - **Shared-endpoint pairs** — two edges that meet at a common node
     (including two edges drawn between the *same* node pair, e.g. a
     co-occurrence edge and an authored edge both connecting A and B — since
     `EntityGraphCanvas` draws each edge as a literal straight line between
     its two node centers with no offset/curve, two edges on the same pair
     render as **exactly overlapping lines**, distance 0, by construction).
     These are excluded from the headline number — they don't represent "two
     lines running close together," they represent one line drawn twice.
   - **Crossing pairs** — two edges with no shared endpoint whose segments
     properly cross somewhere in the middle of the canvas. Distance is
     genuinely 0 there, but it is a structural fact of any node-link diagram
     with enough edges, not something a fixed-width hit-target buffer is
     meant to solve (a hover exactly at a crossing point is inherently
     ambiguous between the two crossing edges regardless of stroke width).
     Counted, not used in the headline number.
   - **Non-intersecting pairs** — two edges with no shared endpoint that do
     not cross. The minimum distance in this bucket (`minNonIntersectingGap`)
     is the number relevant to sizing a hit-target: how close can two
     genuinely distinct, non-touching lines get in a settled layout.

## Fixtures and measured results

### Fixture 1 — Sparse (5 nodes / 5 edges)

5 nodes in a small ring; 3 co-occurrence edges + 2 authored edges, each pair
of nodes connected by at most one edge.

```
nodes: 5, edges: 5
minNonIntersectingGap: 130.8995...  ≈ 130.90 px
crossingPairCount: 0
sharedEndpointPairCount: 5
```

### Fixture 2 — Medium (15 nodes / 20 edges)

15 nodes in a ring, each connected to its neighbor by a co-occurrence edge
(15 edges), plus 5 authored "chord" edges cutting across the ring.

```
nodes: 15, edges: 20
minNonIntersectingGap: 76.4605...  ≈ 76.46 px
crossingPairCount: 1
sharedEndpointPairCount: 35
```

### Fixture 3 — Adversarial (6 nodes / 20 edges)

6 nodes in a hexagon; every hexagon-adjacent pair gets both a co-occurrence
edge and one-or-two authored edges (so several node pairs carry 2–3
overlapping edges each), plus 6 authored diagonal edges cutting across the
hexagon to force additional near-parallel, close-running segments.

```
nodes: 6, edges: 20
minNonIntersectingGap: 51.2247...  ≈ 51.22 px
crossingPairCount: 6
sharedEndpointPairCount: 106
```

(The high `sharedEndpointPairCount` here is expected — it's the direct
result of deliberately stacking multiple edges on the same node pairs, which
is exactly what this fixture was built to do. Each of those overlapping-edge
pairs is drawn as one line on top of another, not two closely-spaced lines,
per the "Method" note above.)

## Deriving the hit-target width

The smallest `minNonIntersectingGap` measured across all three fixtures is
Fixture 3's **51.22 px**.

- A hit-target line is a symmetric buffer around the visible edge: at radius
  `r` either side of the line, two edges running `g` px apart (center to
  center) get their buffers touching once `2r = g`, i.e. `r = g / 2`.
- For the measured smallest gap `g = 51.22 px`, that ceiling is:
  `r_max = 51.22 / 2 = 25.61 px`.
- "Comfortably under half" means staying well clear of that ceiling, not
  approaching it — a hit-target radius sitting right at `r_max` would make
  two adjacent hit-targets just barely touch, with zero margin for a layout
  slightly denser than any of these three fixtures. Halving the ceiling
  again gives a working margin of 2x:
  `r_candidate = 25.61 / 2 ≈ 12.8 px`.
- Rounding down to a clean pixel value for the final constant:
  `12 px`.

`12` is comfortably under half of `51.22` (half is `25.61`; `12` leaves an
additional ~2.1x margin below that), and also comfortably under half of both
larger fixtures' gaps (`130.90` and `76.46`).

## Final value

**Hit-target stroke width: 12 px** (a transparent line rendered at this
width, layered under/alongside the existing visible edge line, per the
feature's approach — not applied to the visible edge's own `strokeWidth`,
which stays governed by `AUTHORED_EDGE_STROKE_WIDTH` /
`cooccurrenceStrokeWidth` as today).

## Status

Measurement genuinely ran (not fabricated): the throwaway Vitest file
imported `computeGraphLayout` from the real component module, executed three
times against `pnpm exec vitest run` (via `frontend/node_modules/.bin/vitest`
in this environment), and the numbers above are copied verbatim from that
run's console output. The script has since been deleted; this document is
the only surviving artifact of the spike.

## Known limitation surfaced by this measurement

Two edges connecting the *same* node pair (e.g. a co-occurrence edge and an
authored edge between the identical two entities) render as exactly
overlapping lines with `EntityGraphCanvas`'s current point-to-point line
drawing — there is no per-edge offset or curve. A 12px hit-target buffer does
nothing to disambiguate a hover over that shared line between the two
overlapping edges; whichever tooltip renders (e.g. topmost in SVG paint
order) is the only one reachable by hover. That is a pre-existing rendering
characteristic, not something this hit-target-width spike introduces or is
scoped to fix.
