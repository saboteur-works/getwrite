# Manual verification: entity graph connections, position persistence, and focal point

Source task: `specs/features/entity-graph-connections-persistence-focal-point/tasks.md`, Task 18.

## What this covers

Task 18 asks for an end-to-end pass exercising all three sub-features
together (connection types, position persistence, focal point) on one
project, plus an explicit call-out of any gesture that could not be driven
automatically — following the precedent `entity-graph-node-dragging`'s own
`manual-verification.md` set.

## Automated coverage (this pass)

A new Vitest integration test,
`frontend/tests/integration/entity-graph-connections-persistence-focal-point.test.tsx`,
mounts the full `EntityRelationshipGraphView` (its real `EntityGraphCanvas`
and real `EntityGraphAccessibleList` children, not mocked out) against one
fixture project built on the in-memory storage adapter via real model-layer
persistence calls (declared entities, an authored relationship, a persisted
backlink record, mentions producing both a co-occurrence and a
proximity-mentions edge, and a shared tag), and exercises, in one continuous
scenario:

1. **Connection types.** The default list (`authored` + `cooccurrence`)
   draws only those two edge kinds; toggling on `backlinks`,
   `proximityMentions`, and `sharedMetadata` through the settings panel
   changes the drawn edges live, with no remount and no new fetch of
   unrelated data.
2. **Position persistence.** A drag past the click/drag threshold saves
   exactly one position record; a simulated reload (remount with the same
   persisted data) reproduces the dragged position; changing the active
   connection-type set and remounting again invalidates that position and
   falls back to a freshly computed layout position (FR-11).
3. **Focal point.** A shift-click sets the focal point and dims every
   node/edge outside the hop radius on the canvas; the accessible list
   discloses the identical hop status as literal text regardless of the
   canvas's own dimmed state, and a hop-dimmed node remains fully
   activatable through the accessible list (FR-20/OQ-10); a second
   shift-click on a different node reassigns the focal point without a
   separate clear step (FR-18); the accessible list's header "Clear focal
   point" button clears it and restores full-opacity rendering everywhere
   (FR-19).

This test is a genuine regression test, not just an additive assertion: with
the Task 18 follow-up fix reverted (see "Finding and fix" below), step 1's
live-toggle assertions fail exactly where expected — toggling a connection
type on persists to the (fake) transport but the newly-active edge kinds
never appear in `graphData` without a remount. Reverting and re-running was
used to confirm this before restoring the fix.

The existing, already-thorough per-component test suites — in particular
`frontend/tests/component/EntityGraphCanvas.test.tsx` (positions, focal
point, hop-radius dimming, five-kind visual encoding — ~680 lines, over 30
`it()` blocks across those four `describe` groups alone),
`frontend/tests/component/EntityGraphAccessibleList.test.tsx`,
`frontend/tests/component/EntityGraphSettingsPanel.test.tsx`, and
`frontend/tests/integration/entity-relationship-graph.test.tsx` — already
cover every sub-feature individually in much finer-grained detail than this
one combined pass attempts to re-litigate. This pass's job was specifically
to confirm the three work *together*, which is also how it surfaced the
finding below: no individual-feature test exercised toggling a connection
type through the real settings panel and then reading the result back out of
`EntityRelationshipGraphView`'s own `graphData`.

## Finding and fix (discovered during this pass)

**Measurement:** before this pass, `EntityGraphSettingsPanel` (rendered
inside `EntityGraphCanvas`) persisted a connection-type toggle or hop-radius
change through Task 6's transport and updated only its own local component
state. `EntityRelationshipGraphView.tsx`'s own `connectionTypes`/
`focalHopRadius` state — the state that actually drives `graphData`'s edge
filtering (Task 7) and the hop-radius BFS (Task 16) — had no callback or
other channel by which to learn a save had happened. Toggling a type in the
running app therefore took no visible effect on the graph until a full
remount or reload, contradicting Task 10's own "Done when" text: "toggling a
type or changing the hop radius persists via Task 6's transport and is
reflected in `graphData` (Task 7) without a page reload."

Confirmed by reading `EntityGraphCanvas.tsx`'s settings-panel render site and
`EntityGraphSettingsPanel.tsx`'s own props before this pass added anything —
there was no prop, context, or event by which the panel could signal the
view — and then by reverting the fix below and re-running the new
integration test, which failed exactly at the live-toggle assertions.

**Fix:** added an optional `onSettingsSaved` callback, threaded from
`EntityGraphSettingsPanel` (called with the server's own saved settings on
every successful persist) through `EntityGraphCanvas`'s identically-named
prop, to `EntityRelationshipGraphView`, which now updates its own
`connectionTypes`/`focalHopRadius` state directly from that callback — no
new fetch, since the settings response already carries the effective,
server-filtered values. The prop is optional everywhere, so every existing
caller/test that doesn't pass it keeps the settings panel's own
persist-and-reflect-locally behavior unchanged; this is why no existing
component test needed updating. Files touched:
`EntityGraphSettingsPanel.tsx`, `EntityGraphCanvas.tsx`,
`EntityRelationshipGraphView.tsx`.

## Unrelated finding and fix (discovered during this pass)

**Measurement:** `EntityRelationshipGraphView.tsx`, as committed at the
start of this task (commit `491de176`, Task 17), contained a single stray
NUL byte (`0x00`) inside `buildCooccurrenceEdges`'s `pairKey` template
literal, in place of what is a plain space everywhere else the identical
pattern is used three lines below in `buildProximityMentionGraphEdges`
(`` `${entityIdA} ${entityIdB}` `` vs. the corrupted
`` `${entityIdA}\0${entityIdB}` ``). Confirmed by reading the raw git blob at
`HEAD` with `git show`, byte-for-byte, before this task made any edit to
that file — the byte was already in the committed history, not introduced by
this task's own editing. It did not break anything functionally (a NUL byte
inside a template-literal string is syntactically valid JS/TS and still
produces a usable, internally-consistent dedup key), which is presumably why
no test caught it — but `file`(1) reported the committed file as "data"
rather than text, and it would have broken any future find/patch tooling,
including the Edit tool itself, that relies on exact-text matching against
that line. Fixed by replacing the byte with a space, restoring the file to
plain UTF-8 text. No behavior change results from this fix (dedup keys built
from distinct entity-id pairs remain distinct either way).

## What could not be driven automatically

**True touch long-press**, the FR-15 alternative gesture to shift-click for
setting a focal point on a touch device. `EntityGraphCanvas.test.tsx`
exercises the long-press *logic* with `vi.useFakeTimers()` and synthetic
`pointerdown`/`pointermove`/`pointerup` events (three passing `it()` blocks:
stationary past the duration threshold, cancelled by movement past the drag
threshold, cancelled by an early release) — but this is jsdom simulating the
component's own event handlers firing in the order the code expects, not a
real finger on a real touchscreen subject to the browser's own gesture
arbitration.

This exact gap is why `entity-graph-node-dragging`'s own
`manual-verification.md` exists: that feature's first shipped drag
implementation passed every jsdom test yet failed completely on a real
Pixel 7 Pro, because a finger drag delivers no synthesized mouse events at
all, and even after switching to Pointer Events, the WebView did not honour
`touch-action: none` on the node's `<g>` and the browser claimed the gesture
for scrolling until a non-passive `touchmove` listener was added. The
touch-exercised code path for this feature's long-press gesture shares that
same `pointerdown`/`pointermove`/`pointerup` plumbing and the same
non-passive `touchmove` listener `entity-graph-node-dragging` added — so the
underlying mechanism has already been proven on-device for the drag
gesture — but the long-press *timer* path (as opposed to the drag-distance
path) specifically has not itself been exercised on a physical touchscreen.

**This has not yet been done.** Unlike `entity-graph-node-dragging`'s own
manual-verification note, which records a completed Pixel 7 Pro session,
this task found no record anywhere in this branch's history of a physical
device exercising the long-press gesture specifically. This sandboxed
environment has no attached Android device and no way to install a debug
APK, so this task could not perform that check itself (see `adb`/device
constraints noted in this environment's own tooling notes). A follow-up
device session, mirroring `entity-graph-node-dragging`'s exact method
(Pixel 7 Pro, `adb install -r` against a disposable copy of a real project
with `features.entities` seeded on, touch events recorded via the page's own
event listeners) is recorded as `FU-1` in this feature's
`follow-up-work.md`.

## Touch input — Pixel 7 Pro, 2026-10-05 (FU-1)

**Method.** Debug build compiled fresh from `main` at `ece0ef92` (the merge
commit bringing both this feature and `entity-graph-kind-encoding-visual-
consistency` together) — not a reuse of the stale 2026-09-22 APK left over
from `entity-graph-node-dragging`'s own session, which predates both
features and would not have exercised current code. `frontend`'s
`pnpm build:native` required a one-off local workaround unrelated to this
feature: the shadow build root's own copied `tsconfig.json` had to exclude
`stories/`, `e2e/`, and `tests/`, because a prior, separate commit
(`chore(stories): typecheck and lint the stories directory`) added
relative imports in `frontend/stories/**` that resolve correctly against the
real `frontend/` tree but not against the one-level-different shadow root
`next build` assembles for the native export — a latent break in
`pnpm build:native` itself, not something this task's code touches. Built
and installed with `android`'s `pnpm sync` + `./gradlew assembleDebug` +
`adb install -r`.

The `entities` feature flag is not enabled on any project in the repo's
`projects/` directory, so, mirroring the dragging precedent exactly, the
dev-server-connected project list was not used — instead a disposable copy
of `projects/c02957ec-…` (The SF Sideshow — 8 declared entities, one
authored relationship, a populated mention index, and
`entityGraphConnectionTypes: ["sharedMetadata","authored","cooccurrence",
"backlinks"]` already configured) was pushed directly into the app's
private storage (`adb push` + `run-as` + `tar`), confirmed to be the project
the app actually opened, and deleted from the device afterward.

Touch was real: `adb shell input touchscreen swipe <x> <y> <x> <y> <duration>`
with identical start/end coordinates (zero movement) goes through the Android
input system as a held touchscreen press for `<duration>` ms, exactly the
gesture shape FR-15's long-press needs. Rather than rely on screenshot
pixel-comparison alone (which proved visually ambiguous — see below), the
running page's real DOM was read directly over the WebView's Chrome DevTools
Protocol socket (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`,
then `Runtime.evaluate` over the `ws://` debugger URL from `/json`), querying
each node's own `data-focal-point`/`data-focal-dimmed`/`data-selected`
attributes and `getBoundingClientRect()` — ground truth from the component's
actual rendered state, not an inference from a screenshot.

Rendered state: 8 nodes (Devin Striker, Striker's Apartment (Potrero), Keller,
Casey Thorne, Cecilia Gonzalez, Sheryl Bowers, Tiny, Zoey's Journal), 4 active
connection types, default hop radius 1.

## Results (FU-1)

| # | Check | Result |
|---|---|---|
| 1 | A 700ms held touch on a node sets it as the focal point (FR-15) | **PASS** |
| 2 | Hop-radius dimming applies correctly from a touch-set focal point (FR-17/FR-20) | **PASS** |
| 3 | The gesture is robust to the touch sequence ending in `pointercancel` rather than `pointerup` | **PASS** |
| 4 | A plain tap (no hold) still selects and navigates, distinct from the long-press path (FR-5 precedent, carried over) | **PASS** |
| 5 | Tapping empty canvas clears the focal point | **Does not** — matches spec (clearing is the accessible list's dedicated "Clear focal point" control, not a canvas gesture) |

### Items 1 and 2 — long-press sets focal point with correct hop-radius dimming

A 700ms zero-movement touch on Devin Striker's node (`be63a65b-387c-…`)
produced, read directly from the DOM immediately after:

```json
{"id":"be63a65b-387c-…","focal":"true","dimmed":"false"}
{"id":"7e0510c8-a494-…" (Zoey's Journal),"focal":"false","dimmed":"true"}
```

— focal point correctly set on the pressed node, and hop-radius dimming
correctly applied to exactly the one declared entity (Zoey's Journal) not
within 1 hop of Devin Striker in the active connection-type graph; the other
six nodes, all directly connected to Devin Striker, remained at full opacity.
Repeated three times (fresh load, then twice more after re-pressing), with
identical results each time.

Screenshot pixel-comparison across these repeats was initially inconclusive
— a device-level "show taps" touch-indicator circle (an OS developer-options
overlay, not an app element, left enabled from a prior device-verification
session) sat near the node and was mistaken at first for part of the app's
own focal-point styling, and the first repeat's screenshot happened to also
show a separate, unrelated per-node hover tooltip ("Kind: character — color 5
hexagon," Feature 69) that does not reappear identically on every press. The
DOM read above resolved the ambiguity with ground truth; this note is
recorded so a future visual-only check does not repeat the same confusion.

### Item 3 — robust to `pointercancel`

Event listeners installed via the DevTools socket captured the long-press
gesture's real sequence: `pointerdown`, `touchstart`, `pointercancel`,
`touchcancel` — this WebView's synthesized zero-movement held touch ends in
`pointercancel`, not `pointerup`, unlike a normal tap. The focal point was
still set correctly (confirmed via the same DOM read as above), because
`handleNodePointerDown`'s long-press timer fires independently at the
500ms `LONG_PRESS_DURATION_MS` mark — well before the 700ms release — and is
not gated on how the gesture ends. Worth recording as a platform
characteristic of this WebView, not a defect: a future touch gesture on this
surface should not assume a held press always ends in `pointerup`.

### Item 4 — a plain tap still selects and navigates

A plain tap (`input tap`, not a held swipe) on Devin Striker's node, at
coordinates derived from the node's own `getBoundingClientRect()` and the
page's `devicePixelRatio` (2.625, matching the dragging precedent's own
calibration), switched the work area to Edit (`aria-selected="true"` moved
from Graph to Edit), confirming the long-press path and the ordinary
click-to-navigate path remain distinct and neither interferes with the
other.

### Item 5 — canvas tap does not clear the focal point

Tapping empty canvas after setting a focal point left
`data-focal-point="true"` unchanged on the previously-focal node. This
matches FR-19's actual design (clearing is the accessible list's dedicated
"Clear focal point" header control, not a canvas-level gesture) rather than
indicating a bug — recorded because the opposite was initially assumed
mid-session and cost real time to resolve; a future touch check for this
feature should not assume a canvas tap clears the focal point.

### Unrelated observation — three Task 7 edge-read transports are HTTP-only on native

A "Some data couldn't be loaded correctly" toast appeared on first opening
the Graph view. Device log inspection
(`adb logcat`) traced it to `entity-backlink-edges.ts`,
`entity-proximity-mention-edges.ts`, and `entity-shared-metadata-edges.ts`
each failing their native-side read — not a regression: each module's own
doc comment already states "HTTP-only for now (no native backend/
`createTransport` collapse)... native parity for the three new Task 7 edge
reads is deferred, consistent with Task 7's own task-list scope." On native,
with no HTTP server to answer these three, they degrade to `[]` exactly as
designed, at the cost of a user-visible toast and silently empty
`backlinks`/`sharedMetadata` edges (both active in this test project's
connection-type list) on the native build specifically. Recorded here as a
live confirmation of an already-known, already-documented scope gap, not a
new finding — worth a native-parity follow-up of its own if the Android
build is to ship with these three connection types usable.

## Items not otherwise covered by the automated pass

- **Real-browser rendering fidelity** (actual pixel dimming, actual SVG
  arrowhead/dash rendering as a sighted user would see it) is not checked
  here — `EntityGraphCanvas.test.tsx`'s "five-kind visual encoding" describe
  block already checks the underlying SVG attributes (`stroke-dasharray`,
  `opacity`, `marker-end`) directly, which this pass did not re-verify
  visually (no screenshot or Storybook/Playwright run was performed).
- **The settings panel's own keyboard operability and a11y** are already
  covered by `frontend/tests/a11y/entityGraphSettingsPanel.a11y.test.tsx`
  (Task 10) and were not re-exercised here.
