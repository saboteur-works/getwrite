# Task 1: Headless graph-layout library — selection and vetting notes

Scope: select and vet a headless layout library for the entity relationship
graph view (FR-8), satisfying the resolved buy-layout/hand-roll-rendering
split (Open Question OQ-1) and `docs/standards/package-selection.md`. This
task adds the dependency only; no consuming code is written here (that is
Task 4).

Note on source: `specs/features/entity-relationship-graph.md` (the feature
spec this task references) is not present on this branch
(`feat/entity-authored-relationships`) at the time of this task — it exists
on `feat/entity-relationship-graph` / `docs/entity-graph-specs`
(commit `3064e4f9`). Its FR-8 and OQ-1 text was read read-only via
`git show 3064e4f9:specs/features/entity-relationship-graph.md` to inform
this evaluation; nothing on this branch was merged or checked out to obtain
it. The orchestrator should confirm whether that spec is expected to land on
this branch before or alongside this task's commit.

## (a) No existing dependency covers this

`frontend/package.json` was read directly (dependencies and devDependencies,
lines 31-116 prior to this task's edit). Grepped for `d3`, `dagre`, `cola`,
`ngraph`, `graph`, `force`, `react-flow`, `reactflow`, `cytoscape`, `sigma`,
`vis-network` — none present. `@headless-tree/core` / `@headless-tree/react`
(`^1.6.3`) are present and drive the resource tree's drag/reorder, but they
operate on a tree data shape (parent/children, single-axis ordering), not a
general node/edge graph with two independent edge sources (co-occurrence +
authored relationships) and no hierarchical structure — they do not cover
this need, per the task's own framing. No existing dependency provides
2D force/graph layout or graph hit-testing.

## (b) Registry verification

Verified directly against the npm registry (`npm view` and
`registry.npmjs.org`), not from memory:

- **Package**: `d3-force`
- **Latest/stable version**: `3.0.0` (confirmed via `npm view d3-force
  version` and via `https://registry.npmjs.org/d3-force`'s
  `dist-tags.latest`, both returning `3.0.0`; no newer major exists as of
  this check)
- **Licence**: `ISC` (confirmed via `npm view d3-force license` and the
  registry JSON's `versions["3.0.0"].license`)
- **Type definitions**: `d3-force` itself does not bundle a `types` field
  (`npm view d3-force types` returns nothing; `main`/`module` both point at
  `src/index.js`). DefinitelyTyped's `@types/d3-force` is used instead
  (version `3.0.10`, licence MIT, confirmed via `npm view @types/d3-force
  version license`) — acceptable under package-selection.md §8.4, which
  prefers bundled types "if available" and does not forbid DefinitelyTyped
  otherwise.
- **Dependencies**: `d3-force@3.0.0`'s own `dependencies` are
  `d3-dispatch`, `d3-quadtree`, `d3-timer` (each `"1 - 3"`) — all
  lower-level D3 numeric/eventing utilities, not rendering libraries.

Pinned exactly in `frontend/package.json` (no `^`/`~` range):
`"d3-force": "3.0.0"` (dependencies), `"@types/d3-force": "3.0.10"`
(devDependencies).

## (c) React compatibility

`d3-force` declares no `peerDependencies` at all (confirmed via `npm view
d3-force peerDependencies`, empty, and the registry JSON's
`versions["3.0.0"].peerDependencies`, `undefined`). It has no React binding
of any kind — it is a plain, framework-agnostic force-simulation engine
operating on plain JS objects (`{x, y, vx, vy, ...}`). This is the
"pure-data layout library with no React binding, consumed via a small
custom hook" outcome the task explicitly calls acceptable — often
preferable — since it cannot go stale against a React major the way a
library with a declared (or missing) React peer range could. The project's
React version (`19.2.6`, `frontend/package.json`) is therefore never at
risk of a peer-range mismatch with this dependency, because there is no
peer range to mismatch.

## (d) Layout/hit-testing only, renders nothing

Confirmed directly from the package's own README (fetched from
`unpkg.com/d3-force@3.0.0/README.md`, the version installed):

> "This module implements a velocity Verlet numerical integrator for
> simulating physical forces on particles... listen for tick events to
> render the nodes as they update in your preferred graphics system, such
> as Canvas or SVG."

This is explicit, first-party confirmation that the module computes
positions/velocities only and delegates all rendering to the consumer's
"preferred graphics system" — it ships no `<svg>`/`<canvas>` output, no
CSS, no DOM, and no visual language of its own. Its full public API
(`forceSimulation`, `forceManyBody`, `forceLink`, `forceCenter`,
`forceCollide`, `forceX`/`forceY`, `simulation.on("tick", ...)`, etc.) is
either simulation setup or a tick-event subscription — nothing in it
touches the DOM. The `dependencies` list (`d3-dispatch`, `d3-quadtree`,
`d3-timer`) confirms this: an event dispatcher, a spatial index used
internally for many-body force approximation, and a timer loop — no
rendering package anywhere in the dependency graph. This clears the same
bar `@headless-tree/core` clears for the resource tree (layout/interaction
logic only, DOM and styling fully custom) and satisfies FR-8's requirement
that "rendering, theming... and the accessibility affordances... MUST be
hand-rolled SVG/DOM, not delegated to the layout library."

`d3-force` computes force-directed node positions (`forceManyBody` for
repulsion, `forceLink` for edge-based attraction, `forceCenter` for
centering) — a superset of what FR-8 needs for node layout — but performs
no hit-testing of its own; hit-testing (translating a pointer/keyboard
event to a node) is a small amount of hand-rolled geometry (point-in-circle
against each node's simulated `x`/`y` and a fixed radius) that Task 4-7's
rendering work will implement directly against the simulation's own output
positions, consistent with FR-8's "hand-roll all rendering" mandate — this
is not a gap in the library, it is the intended division of labour FR-8
describes ("layout and hit-testing" as the buy side does not require the
library itself to own the hit-test, only to provide positions accurate and
stable enough for a hand-rolled hit-test to use, which a settled force
simulation does).

## (e) Justification (package-selection.md §6)

- **Purpose**: Compute 2D node positions and edge routing for the entity
  relationship graph view's canvas (FR-8), given the project's declared
  entities (nodes) and the co-occurrence + authored-relationship edges
  already produced by `getEntityCooccurrence` and
  `listEntityRelationships`.
- **Why necessary**: FR-8 explicitly rejects hand-rolling 2D force layout
  (rejected in OQ-1 as materially harder than anything currently hand-rolled
  in this repo — `Timeline.tsx`'s hand-rolled pan/zoom is a 1D surface, not
  a 2D layout with free node positions and edge routing) and rejects any
  library that renders (would ship a foreign visual language and, per OQ-1,
  would not even reliably buy accessibility, since most such libraries
  render to a bare canvas with no accessibility tree). A pure layout engine
  is the resolved middle path.
- **No existing dependency suffices**: confirmed under (a) above —
  `@headless-tree/core`/`@headless-tree/react` are tree-shaped, not
  graph-shaped, and no other installed dependency performs force/graph
  layout.

## Result

Selected: **`d3-force@3.0.0`** (dependency, pinned exact) +
**`@types/d3-force@3.0.10`** (devDependency, pinned exact, types only).
Both added to `frontend/package.json`; `pnpm-lock.yaml` updated by
`pnpm install`. No consuming code is added in this task.
