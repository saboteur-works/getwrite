# Follow-up work: Folder metadata, folder subtypes and Sources core (Feature 102)

### FU-1: Repeat restore after a crash for resources and folders

**What:** The idempotent-restore rule added for attachment Trash records (pre-PR fix A) is not applied to `restoreResource` (which covers a Source's sidecar) or `restoreFolder`.
**Why deferred:** Both are multi-step restores with revisions, references, indexing and descendants; a safe "already restored" test is not a small guard. Not run: whether a repeat after a crash renames the item to "(restored)".
**Context:** `frontend/src/lib/models/trash.ts` `restoreResource`, `restoreFolder`, `resolveRestoreName`, `resolveRestoreFolderName`. Measure first by seeding the post-write, pre-remove state and calling restore.
**Relates to:** Tasks 24, 25, pre-PR fix A
**Raised:** 2026-11-07
**Resolved:** [ ]
**Resolved on:**

### FU-2: Attachment Trash record whose file name is not a UUID

**What:** A file `attachment-<id>.json` in `.trash/meta/` whose `<id>` is not a UUID is still not listed, so it is still invisible and cannot be purged through the routes (which accept UUID ids only).
**Why deferred:** The app only writes UUID ids; such a file means the directory was edited by hand. Listing it needs an id the purge route accepts.
**Context:** `listTrashedAttachments` in `frontend/src/lib/models/trash.ts`.
**Relates to:** pre-PR fix B
**Raised:** 2026-11-07
**Resolved:** [ ]
**Resolved on:**
