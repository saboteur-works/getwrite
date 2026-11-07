# Daily writing log (developer)

Feature 59. Spec: [specs/features/daily-writing-log.md](../../specs/features/daily-writing-log.md).

Purpose

Records when words were written, per project per day, so a writer can compare today's writing against an optional daily goal. Before this feature sidecars carried only `createdAt`/`updatedAt`, so a per-day count could not be derived from stored data.

Storage layout

- One file per UTC day: `meta/writing-log/YYYY-MM-DD.json`, shaped `{ "entries": [...] }`. Validated by `WritingLogDayFileSchema` in `frontend/src/lib/models/schemas.ts`.
- **Append-only** means entries are only ever appended, never edited or removed. The containing day file is still rewritten on each append: `appendWritingLogEntry` (`frontend/src/lib/models/writing-log.ts`) does a read-modify-write inside `withMetaLock(projectRoot, ...)`, then `atomicWriteFile`. Existing entries are preserved verbatim.
- The file key is the **UTC date of the entry's ISO timestamp**. The timestamp is assigned by the model, never the client, so no client-supplied date or path reaches the file system. Each entry keeps its full ISO timestamp, so the key encodes no day definition.
- The writer's **local day is derived at read time** from entry timestamps (see Reads).
- A locked or keyless project rethrows (`isLockedAccessError`) rather than degrading to empty. A day file that is unreadable JSON or fails validation throws `WritingLogCorruptError`; the HTTP route does not catch it (no dedicated error response, surfaces as a server error). The read route maps locked-project errors to 401 (`ProjectLockedError`) and 409 (`MissingProjectKeyError`) via `withStorageContext`.

Entries

- Word entry: `{ added, deleted, net, timestamp, source?, documentId? }`. `net` is stored and the schema requires `net === added - deleted`. `source` is `"docx"`, `"scrivener"`, or `"plaintext"` and marks an import.
- Marker entry: `{ skipped: true, timestamp, documentId? }`, with no word counts. It records a save whose words could not be counted (see Skipped saves).
- `documentId` (Feature 98) is an optional resource id on a word entry or a marker entry, naming the document the save belonged to. An import entry (one with `source`) carries none, and the schema refuses an entry that has both (`WritingLogWordEntrySchema`). Both entry schemas stay `.strict()`. An entry without `documentId` stays valid. The canonical-save path (`logCanonicalSave` in `revision-core.ts`) passes the saved resource's id, so every new word entry and every skipped-save marker from a save carries it, whether or not a filter is set. Entries written before this carry none, so a filtered daily figure leaves them out (see Goal filter).

What is logged

- Each debounced **canonical** autosave that changes at least one word (`added` > 0 or `deleted` > 0, even when net is 0), through `updateRevisionInPlace` (`frontend/src/lib/models/revision-core.ts`, `logCanonicalSave`) appends one entry; a save with `added` 0 and `deleted` 0 appends none. Non-canonical revision saves are not logged.
- A docx, Scrivener, or plain-text import appends one entry with `source` (even a zero-word import writes a 0/0/0 entry) after its index rebuild (`import-docx-project.ts`, `import-scrivener-project.ts`, `import-plaintext-project.ts`). Imports write through `writeResourceToFile`/`writeRevision`, not `updateRevisionInPlace`, so imported words are not also diff-logged.
- There is **no backfill**: history from before the log shipped is not reconstructed.
- The log is not rebuildable from resources, so `getwrite-cli reindex` does not clear or rebuild it ([cli.md](./cli.md#reindex)).

Word diff and blind spots

`diffWords` (`frontend/src/lib/models/word-diff.ts`) computes a word-bag (multiset) difference between the previous and new plain text (`tiptapToPlainText`). Tokenization mirrors `countWords`. `added` is the words in the new text not matched in the old text; `deleted` is the reverse. Known blind spots:

- Tokens are compared as exact whitespace-delimited strings, so matching is case-sensitive and punctuation-sensitive (`word,` and `word` are different tokens, as are `Word` and `word`); tokens with no word character (`\w`) are dropped.
- A moved paragraph logs 0 added and 0 deleted.
- A rewrite that reuses common words undercounts against a naive replacement count.
- A word added and then deleted between two saves is not captured, since only the saved before/after states are compared.

The cost of the diff has not been measured.

Skipped saves

When the previous content cannot be read, or the previous or new content is not TipTap JSON (legacy plain text), the word entry is skipped and a marker entry is appended instead. The save result carries a `writingLog` signal (`WritingLogSignal`: `skipped`, `markerAppendFailed`, `appendFailed`). The client handles it in `frontend/src/lib/writing-log-signal.ts`:

- `skipped` or `markerAppendFailed`: a generic toast with the fixed id `writing-log-skipped`, so consecutive failing saves collapse into one toast. Toast text never carries document content.
- `markerAppendFailed` only: an in-memory, session-only flag is also set, driving the same "may be incomplete" text. This is the fallback for when the log cannot show the gap.
- `appendFailed` (a word entry could not be appended; nothing recorded): its own toast with id `writing-log-append-failed`; no session flag.
- The persistent per-day "incomplete" indication is derived from marker entries by the aggregate read, not from the session flag.

A logging failure other than a locked project does not fail the content save.

Reads

`GET /api/project/writing-log` ([openapi](../api/openapi.yaml)) and its native counterpart take a required `from`/`to` window: the ISO start and end instants of the client's local day (`localDayWindow` in `frontend/src/lib/api/writing-log.ts`). `validateWritingLogWindow` (`frontend/src/lib/models/writing-log-core.ts`, shared by HTTP and native) requires both to be ISO instants, `to` after `from`, a window of at most 26 hours, and at most 3 overlapping UTC day files. A failing window is rejected (HTTP 400, or a thrown error on native, since the native backend calls the same core), never clamped, and there is no server-timezone fallback. The window only selects which UTC day files load; it is never a path component.

The aggregate (`WritingLogAggregate`) sums non-import entries into `totals`, sums entries with a `source` into `imported`, and reports `goal` and `incomplete` (a marker entry lies in the window). Imported words are shown separately and are excluded from the goal comparison. It also reports two booleans added by Feature 98, both always present in the response (`WritingLogAggregateResponseSchema` treats a body without them as malformed): `isFiltered` (a goal filter is applied to `totals`) and `hasNoMatch` (the filter matched no live text document, so `totals` is a real zero). With no filter set, both are `false` and every other field is as before.

Goal filter

Feature 98. Spec: [specs/features/writing-goal-filter.md](../../specs/features/writing-goal-filter.md). A project may store one filter, `config.goalFilter`, a query AST (never a reference to a saved query), that chooses which documents count toward both goals. It is set and cleared in the Writing Goals tab of Project Settings and through `PUT /api/project/goal-filter` ([word-count-goals.md](./word-count-goals.md#goal-filter) describes that route and the total's read route). With no filter set, the daily figure is the unfiltered figure described above. A filter that holds a relative date (an "in the last N days" condition) or a saved-query reference is refused when set.

With a filter set, `aggregateForRoot` (`writing-log-core.ts`) evaluates membership when the figure is read (`evaluateGoalMembership`, run on the server by the HTTP route and in-process on native). Nothing is cached.

- **Counted:** non-import word entries in the window that carry a `documentId` whose document is live (not in Trash), is of type `text` or `source`, and matches the filter at the moment of reading. Added, deleted and net are summed over those.
- **Left out:** word entries without a `documentId`, and entries whose document is trashed, purged or no longer matches. A trashed or purged document is not a failure, so the figure can shrink; restoring a document (same id) brings its entries back. A copy has its own id and is evaluated on its own fields. The original's entries are not attributed to it.
- **Imports:** unchanged. They carry no `documentId`, stay in `imported`, and never count toward the daily goal, filtered or not. `imported` is the unfiltered import total.
- **`incomplete` under a filter:** raised by a non-import word entry without a `documentId` (its document is unknown, so the figure may be low), and by a marker with no `documentId` or whose `documentId` is a matching document. A marker for a non-matching document does not raise it. With no filter set, a word entry without a `documentId` does not raise it and every marker keeps its current effect.
- **No filter and Sources (Feature 102, Owner decision 2026-11-07):** with no `config.goalFilter`, `aggregateForRoot` skips word and marker entries whose `documentId` is a Source (`findSourceDocumentIds` reads the sidecar of each such id), so a Source's words are outside the daily figure; a document with no sidecar counts as before and a failed read rejects. A filter that selects Sources counts them. See [sources.md](sources.md).
- **No match:** a filter that selects no live text document returns `totals` of 0, `isFiltered: true` and `hasNoMatch: true`.
- **Unavailable:** if membership cannot be computed (an invalid stored filter, a condition on a field the project no longer defines, or a read failure on the listing, a sidecar or the project config), `aggregateForRoot` throws `GoalFilteredFigureUnavailableError`. The HTTP route maps it to **HTTP 500** with an `{ error }` body and no totals; the native backend rejects with the same error. A client must show "Today's count is unavailable", never a number. A read does not rewrite or remove an invalid stored filter.

Data written by an older release (measured, FR-38, Task 19; record in `specs/features/writing-goal-filter/experiments.md`): the installed 2.2.0 build and a local unsigned 2.3.0 stand-in (the released 2.3.0 app itself was not run) were each given a day file in which the entries carried `documentId`. With that file in today's window, both builds showed "Today's count is unavailable" in the footer and details window, and added no new log entry (the day file stayed unchanged). The typed text still saved to `content.txt`, survived a restart, and the footer showed "Saved · just now" with "Today's word count may be incomplete: this save couldn't be recorded." A day file 4 days old had no effect on the stand-in: normal figures, and new entries were added to today's file. Not run, inferred: because a local day can span two UTC day files, the effect could last for the local day rather than one UTC day. In that run `documentId` was added to the file by a script, not written by the feature's code.

Footer and details dialog under a filter (Tasks 23 and 24 of the feature): when the aggregate has `isFiltered`, both `WritingLogFooterDisplay.tsx` and `WritingLogDetailsDialog.tsx` show "Counting selected documents" beside the figure, and "No documents match your goal filter" when `hasNoMatch` is set. The existing "Today's count is unavailable" (failed read) and "Today's count may be incomplete" (`incomplete`) are unchanged, and the imported line stays and shows the unfiltered import total.

The footer re-reads on the goal-change signal (`notifyWritingLogGoalChanged`). With a filter set, it is raised by saving or clearing the filter in Project Settings, and by `app/(app)/page.tsx` after a resolved metadata field save (the `updateSidecar` call there), only while `config.goalFilter` is set. The other sidecar saves (`SubtypeSection.tsx`, `EntitySection.tsx`, `RemoveEntityControl.tsx`, `WordCountGoalSection.tsx`) call `notifyAfterSidecarSave()` (`sidecar-save-signal.ts`) after a resolved `updateSidecar`. The page publishes whether the open project has a filter with `setGoalFilterActive`, and the helper does nothing while none is set. The signal is raised on success only.

Daily goal

`dailyWordGoal` is an optional non-negative integer in project config (`config.dailyWordGoal`), **distinct from `wordCountGoal`**, a separate config field that is not touched when the daily goal is set or cleared. `setDailyWordGoalCore` sets it (or clears it with `null`) under `withMetaLock`. The writer sets it in Project Settings (`DailyWordGoalField.tsx`, "Daily word goal"). It lives in the "Writing Goals" tab of Project Settings (`ProjectSettingsDialog.tsx`), appended last after Metadata. The dialog's initial value comes from the app shell's loaded project config, which is not refreshed after a save, so the field's prefill can be stale until the project is reloaded; the footer reads the goal from the aggregate response, not from the shell. See [project-configuration.md](./project-configuration.md).

Transport and UI

- Client: `frontend/src/lib/api/writing-log.ts` resolves through `createTransport`: HTTP on web/desktop, `frontend/src/store/transport/native-writing-log-backend.ts` (with a `.web-stub.ts`) on native. Methods reject on any failure and never degrade to an empty aggregate; HTTP bodies are validated by `WritingLogAggregateResponseSchema`/`SetDailyWordGoalResponseSchema` in `lib/api/schemas.ts`.
- Footer: `frontend/components/WorkArea/WritingLogFooterDisplay.tsx`. The footer always shows a "Today's writing" button, "Today: N / goal" (or "Today: N" with no goal) and the incomplete marker when it applies. The button (tooltip "Show today's writing details") opens a read-only modal overlay, `WritingLogDetailsDialog.tsx` (built on `UI/Dialog`), titled "Today's writing", whose description names the goal or "No daily goal set", and which lists Added, Deleted, Net, a separate "Imported (not counted toward goal)" figure and the incomplete marker. Its numbers are fetched when it opens and do not change while it is open; the goal is edited only in Project Settings. Esc or Close dismisses it and focus returns to the button. Nothing about the overlay is persisted. A failed read shows "Today's count is unavailable", not zero. The display is not red. The overlay is intended as the later home for Feature 60/62 diagnostics; those are not implemented.
