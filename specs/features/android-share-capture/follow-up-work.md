### FU-1: Cancel while a share is being captured does nothing

**What:** In `ShareSheet`'s pending phase the Cancel button and Escape are enabled, but `ShareCaptureHost` ignores them: `runShare` has no abort, so a write in progress cannot be stopped.
**Why deferred:** Stopping a run needs an abort signal in `lib/share-runner.ts` (Task 8) and a disabled or relabelled Cancel in `ShareSheet.tsx` (Task 11); both are outside Task 12's files.
**Context:** The host only acts on cancel in the `choosing` and `needs-project` phases (`cancel` in `ShareCaptureHost.tsx`). Either disable Cancel while `phase === "pending"` or add an abort check between items in `runShare`.
**Relates to:** Task 8, Task 11, Task 12
**Raised:** 2026-11-09
**Resolved:** [ ]
**Resolved on:**
