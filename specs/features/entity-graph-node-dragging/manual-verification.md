# Manual verification: entity graph node dragging

Source task: `specs/features/entity-graph-node-dragging/tasks.md`, Task 7.

**Task 7 is complete.** Items 1, 3, 4, and 5 were verified mechanically on
2026-09-09 and are recorded below. Items 2 and 6 were covered by the
maintainer's hand check on 2026-09-10, recorded in the last results section.

## Method

The `entities` feature flag is not enabled on any project in the repo's
`projects/` directory, so the Graph view is not reachable in the real app as
checked out. Rather than modify a real project, the dev server ran against a
**disposable copy** of `projects/c02957ec-…` (The SF Sideshow — 6 declared
entities, populated mention index) via `GETWRITE_PROJECTS_DIR`, with
`features.entities`, `relationshipTypes`, and one authored relationship seeded
on the copy only. The copy was confirmed to be the read path, the real project
was confirmed unmodified afterwards, and the copy was deleted.

Driven with Playwright against Chromium. The drag was a real
`locator.dragTo()` (actual pointer down / move / up), not synthetic DOM events.
Shipped threshold at time of verification: `DRAG_CLICK_THRESHOLD_PX = 4`.

Rendered state: 6 nodes, 10 edges.

## Results

| # | Check | Result |
|---|---|---|
| 1 | A plain click still selects and navigates (FR-5) | **PASS** |
| 2 | A small hand wobble does not misfire as a drag | **PASS (judgment)** — hand-checked by the maintainer, 2026-09-10 |
| 3 | A deliberate drag repositions and does NOT navigate (FR-1, FR-6) | **PASS** |
| 4 | Attached edges follow; unattached edges do not (FR-3) | **PASS** |
| 5 | Position does not survive a view switch (FR-8) | **PASS** |
| 6 | Threshold tuning if 2 or 3 felt wrong | **No adjustment** — kept at 4 |

### Item 3 — drag repositions without navigating

Node `Sheryl Bowers` before: `translate(246.13989417792763, 280.37124364760376)`.
After a real drag: `translate(400.13989417792766, 280.37124364760376)` — moved
+154 in x, y unchanged.

At the same moment: the Graph tab remained `aria-selected="true"`, the canvas
remained rendered, and no selection ring was present. So the drag triggered
neither `onNodeActivated` (no navigation) nor the selection toggle — FR-6 in
both of its halves.

### Item 4 — edges follow the dragged node, neighbours do not

After the drag, four edges (three co-occurrence, one authored) terminated at
`(400, 280)`, the dragged node's new position. Edges between undragged nodes
were unchanged, e.g. `(302,357)-(393,233)`, `(393,329)-(302,357)`,
`(303,203)-(393,233)`, `(393,329)-(393,233)`, `(393,329)-(303,203)`.

### Item 1 — a plain click still navigates

A click (no pointer movement, therefore under the 4px threshold) on the same
node switched the work area to Edit: the Edit tab became
`aria-selected="true"`, Graph became `"false"`, the canvas unmounted, and the
editor rendered. Click-to-navigate is unchanged by this feature.

### Item 5 — the dragged position is ephemeral

Switching to Edit and back to Graph returned the node to
`translate(246.13989417792763, 280.37124364760376)` — byte-identical to its
original computed layout position, not the dragged `400.14`. FR-8 holds for a
view switch. A full page reload was not separately exercised; the view switch
remounts the canvas and recomputes layout, which is the same mechanism.

## Items 2 and 6 — the maintainer's hand check

The maintainer exercised the drag by hand in the running app on 2026-09-10
and reported the click/drag discrimination as "within tolerable bounds." No
adjustment was made: `DRAG_CLICK_THRESHOLD_PX` remains 4.

What this is: one person's judgment from direct use, which is what item 2
asked for. What it is not: a measurement. Not recorded: which input devices
(mouse, trackpad) were used, or how many gestures were tried. Reports of
accidental drags, or of short deliberate drags not registering, would be the
signal to revisit — the value is a one-line change.

Touch was not part of this hand check. It was verified separately on a
physical device — see "Touch input" below.

## Touch input — Pixel 7 Pro, 2026-09-10

**Method.** Debug build installed with `adb install -r` (app data kept), the
disposable test project streamed into app-private storage, and the Graph view
opened over the WebView's DevTools socket. Touch was real: `adb shell input
swipe` and `input tap` go through the Android input system as touchscreen
events. Page-side listeners recorded touch, pointer, and mouse events. The
screen-to-page offset was calibrated from a tap on empty canvas: 108 device px
at the top, 0 horizontally, device pixel ratio 2.625. Every drag below is the
same gesture: a 180 CSS px swipe left over 900 ms, starting on Cecilia
Gonzalez.

### As first shipped on this branch (mouse-only drag)

| Measured | Value |
|---|---|
| Node transform | unchanged |
| Events received | `touchstart` 1, `touchmove` 7, `touchend` 1 — **no mouse events** |
| Work-area pane `scrollLeft` | 0 → 183 — the swipe scrolled the pane instead |

A finger drag delivers no synthesized mouse events at all (a tap does), so the
mouse-only drag handler never ran.

### Intermediate: pointer events plus `touch-action: none` on the node

| Measured | Value |
|---|---|
| Computed `touch-action` on the node `<g>` | `none` |
| Pointer sequence | `pointerdown`, 4 × `pointermove`, **`pointercancel`** — no `pointerup` |
| Node moved | 8.9 units, then stopped |
| Pane `scrollLeft` | 0 → 182.9 |

The browser still claimed the gesture for scrolling and cancelled the drag. Why
this WebView did not honour the computed `touch-action` on an SVG `<g>` was not
established.

### Fixed: pointer events plus `preventDefault()` on `touchmove` during a node drag

The approach was first proven by injecting the listener into the live page, then
confirmed on a rebuilt APK containing the committed code:

| Measured | Value |
|---|---|
| Pointer sequence | `pointerdown` 1, `pointermove` 104, **`pointerup` 1** — no `pointercancel` |
| Node moved | 367.00 → 187.77 — 179.2 units for a 180 px swipe (the canvas renders 1:1) |
| Pane `scrollLeft` | 0 |
| Navigation or selection from the drag | none — Graph stayed selected, no selection ring |
| A tap on a *different* node immediately afterwards | navigated to Edit |

The last row matters: no click follows a touch drag, so before the fix the
"just dragged" flag stayed set and would have swallowed that tap. Each node
`pointerdown` now resets it.

Re-confirmed on the same build: tapping an edge shows its tooltip, tapping the
same edge again hides it, a third tap shows it, and a tap elsewhere hides it.

**Not verified:** any device other than this Pixel 7 Pro (no iOS/Safari, no
other WebView versions), pen input, and multi-touch beyond the component test
that ignores a second pointer.

## Unrelated observations from this session

Two console conditions were observed while exercising the app. Neither is
attributed to this feature — both are in the resource-tree folder-normalization
path, which this feature's diff does not touch — but they were seen and are
recorded rather than discarded:

- 172 warnings of the form `Parent <uuid> not found or is not a folder for
  resource <uuid>. Moving to root.` This is the orphaned-folder-association
  condition `getwrite-cli doctor` exists to detect.
- 5 React errors, `Encountered two children with the same key`, for a single
  resource id.

Whether the duplicate-key error is a consequence of the orphan normalization
(many resources being re-parented to root at once) is not established. Running
`getwrite-cli doctor` against the project would be the first check.

- The canvas renders 800 CSS px wide on a 411 px phone screen (a fixed width
  from the original graph feature), so half the graph starts off-screen;
  swiping empty canvas scrolls the pane to reach it.
- The edge tooltip overflows the right edge of a phone screen — measured at x
  259–588 on a 411 px screen, truncating its text. The overlay is
  `white-space: nowrap`, placed 10 px right of the touch point, with no max
  width and no clamp to the viewport.
