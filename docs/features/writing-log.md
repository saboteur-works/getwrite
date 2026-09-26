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

- Word entry: `{ added, deleted, net, timestamp, source? }`. `net` is stored and the schema requires `net === added - deleted`. `source` is `"docx"` or `"scrivener"` and marks an import.
- Marker entry: `{ skipped: true, timestamp }`, with no word counts. It records a save whose words could not be counted (see Skipped saves).

What is logged

- Each debounced **canonical** autosave, including one that changes no words (it appends a 0/0/0 entry), through `updateRevisionInPlace` (`frontend/src/lib/models/revision-core.ts`, `logCanonicalSave`) appends one entry. Non-canonical revision saves are not logged.
- A docx or Scrivener import appends one entry with `source` (even a zero-word import writes a 0/0/0 entry) after its index rebuild (`import-docx-project.ts`, `import-scrivener-project.ts`). Imports write through `writeResourceToFile`/`writeRevision`, not `updateRevisionInPlace`, so imported words are not also diff-logged. Plain-text file import is not logged.
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

The aggregate (`WritingLogAggregate`) sums non-import entries into `totals`, sums entries with a `source` into `imported`, and reports `goal` and `incomplete` (a marker entry lies in the window). Imported words are shown separately and are excluded from the goal comparison.

Daily goal

`dailyWordGoal` is an optional non-negative integer in project config (`config.dailyWordGoal`), **distinct from `wordCountGoal`**, a separate config field that is not touched when the daily goal is set or cleared. `setDailyWordGoalCore` sets it (or clears it with `null`) under `withMetaLock`. The writer sets it in Project Settings (`DailyWordGoalField.tsx`, "Daily word goal"). It lives in the "Writing Goals" tab of Project Settings (`ProjectSettingsDialog.tsx`), appended last after Metadata. The dialog's initial value comes from the app shell's loaded project config, which is not refreshed after a save, so the field's prefill can be stale until the project is reloaded; the footer reads the goal from the aggregate response, not from the shell. See [project-configuration.md](./project-configuration.md).

Transport and UI

- Client: `frontend/src/lib/api/writing-log.ts` resolves through `createTransport`: HTTP on web/desktop, `frontend/src/store/transport/native-writing-log-backend.ts` (with a `.web-stub.ts`) on native. Methods reject on any failure and never degrade to an empty aggregate; HTTP bodies are validated by `WritingLogAggregateResponseSchema`/`SetDailyWordGoalResponseSchema` in `lib/api/schemas.ts`.
- Footer: `frontend/components/WorkArea/WritingLogFooterDisplay.tsx`. The footer always shows a "Today's writing" button, "Today: N / goal" (or "Today: N" with no goal) and the incomplete marker when it applies. The button (tooltip "Show today's writing details") opens a read-only modal overlay, `WritingLogDetailsDialog.tsx` (built on `UI/Dialog`), titled "Today's writing", whose description names the goal or "No daily goal set", and which lists Added, Deleted, Net, a separate "Imported (not counted toward goal)" figure and the incomplete marker. Its numbers are fetched when it opens and do not change while it is open; the goal is edited only in Project Settings. Esc or Close dismisses it and focus returns to the button. Nothing about the overlay is persisted. A failed read shows "Today's count is unavailable", not zero. The display is not red. The overlay is intended as the later home for Feature 60/62 diagnostics; those are not implemented.
