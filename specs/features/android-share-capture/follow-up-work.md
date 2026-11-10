### FU-1: Cancel while a share is being captured does nothing

**What:** In `ShareSheet`'s pending phase the Cancel button and Escape are enabled, but `ShareCaptureHost` ignores them: `runShare` has no abort, so a write in progress cannot be stopped.
**Why deferred:** Stopping a run needs an abort signal in `lib/share-runner.ts` (Task 8) and a disabled or relabelled Cancel in `ShareSheet.tsx` (Task 11); both are outside Task 12's files.
**Context:** The host only acts on cancel in the `choosing` and `needs-project` phases (`cancel` in `ShareCaptureHost.tsx`). Either disable Cancel while `phase === "pending"` or add an abort check between items in `runShare`.
**Relates to:** Task 8, Task 11, Task 12
**Raised:** 2026-11-09
**Resolved:** [x]
**Resolved on:** 2026-11-09

Resolved: `ShareSheet` now disables Cancel while capturing and ignores Escape and outside-close in that phase; no abort was added to `runShare`.

---
### FU-2: A capture that never settles cannot be cancelled

**What:** While capturing, Cancel is disabled (FU-1 resolution), so if a capture never settles (as the image read did before c8e20205) the only way out is closing the app.
**Why deferred:** Owner decision 2026-11-10: recorded as a known limit, not fixed.
**Context:** Option for later: a time limit that ends the wait and reports what was saved.
**Relates to:** Task 8, Task 11, Task 12
**Raised:** 2026-11-10
**Resolved:** [ ]
