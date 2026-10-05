### FU-1: Physical-device verification of the focal-point long-press gesture

**What:** Exercise FR-15's touch alternative to shift-click — a long-press on
a node setting the focal point — on a real touchscreen device, mirroring
`entity-graph-node-dragging`'s own completed Pixel 7 Pro session (`adb
install -r` against a disposable copy of a real project with
`features.entities` seeded on, touch events recorded via the page's own
event listeners).

**Why deferred:** This sandboxed implementation environment has no attached
Android device and no way to install a debug APK, so Task 18's automated
pass could not perform this check itself. The underlying
`pointerdown`/`pointermove`/`pointerup` plumbing and the non-passive
`touchmove` listener this gesture shares with `entity-graph-node-dragging`'s
own drag gesture have already been proven on-device for that drag — but the
long-press *timer* path specifically (as opposed to the drag-distance path)
has not itself been exercised on a physical touchscreen. jsdom + fake timers
(`EntityGraphCanvas.test.tsx`'s three long-press `it()` blocks) simulate the
component's own event-handler logic correctly but cannot reproduce real
browser gesture arbitration (e.g. the exact "WebView claims the gesture for
scrolling" failure mode `entity-graph-node-dragging`'s manual verification
found and fixed for the drag gesture).

**Context:** See
`specs/features/entity-graph-connections-persistence-focal-point/manual-verification.md`'s
"What could not be driven automatically" section for the full account, and
`specs/features/entity-graph-node-dragging/manual-verification.md`'s "Touch
input — Pixel 7 Pro" section for the exact method to mirror. The relevant
code is `EntityGraphCanvas.tsx`'s long-press timer (`longPressTimerRef`) and
its existing non-passive `touchmove` listener (shared with the drag
gesture).

**Relates to:** Task 18

**Raised:** 2026-10-01

**Resolved:** [ ]

**Resolved on:**
