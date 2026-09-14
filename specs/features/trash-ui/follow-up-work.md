### FU-1: Rename notice can't show the item's true restored name past the first collision

**What:** `TrashView.tsx`'s Task 18 rename notice always renders `"<name> (restored)"` when a restore result's `renamed` flag is `true`. That's accurate for the first name collision at a destination, but `models/trash.ts`'s `resolveRestoreCollisionName`/`resolveFolderRestoreCollisionName` suffix a second, third, ... collision on the same name as `"<name> (restored 2)"`, `"<name> (restored 3)"`, etc. — a name this notice cannot know, because `RestoreItemResult` (the client-facing type returned by `POST .../trash/restore` and `restoreTrashItems`) only carries a `renamed: boolean` flag, not the actual resolved name.

**Why deferred:** Task 18's file scope was `TrashView.tsx` + its tests only; widening `RestoreItemResult`/the restore route/`RestoreResourceResult`'s call sites to surface the resolved name is a backend/transport change outside that scope.

**Context:** The resolved name lives on `RestoreResourceResult.restoredName` / `RestoreFolderResult.restoredName` (`frontend/src/lib/models/trash.ts`), computed inside `restoreResource`/`restoreFolder`. To fix, add a `restoredName: string` field to `RestoreItemResult` in both `frontend/app/api/project/[project-id]/trash/restore/route.ts` and `frontend/src/lib/api/trash.ts`, thread it through `restoreOne`, and have `TrashView.tsx`'s `buildRestoreNotices` use it instead of synthesizing `"${name} (restored)"`.

**Relates to:** Task 18
**Raised:** 2026-09-14
**Resolved:** [ ]
**Resolved on:**
