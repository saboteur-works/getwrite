# Prose diagnostics (developer)

Feature 62. Spec: [specs/features/prose-diagnostics.md](../../specs/features/prose-diagnostics.md).

Purpose

Three cheap, per-resource scalar metrics — dialogue ratio, average sentence length, and top repeated words — computed with no AI or network dependency, so a writer can spot dialogue-heavy passages, run-on sentences, and overused words without leaving the app. Persisted alongside the existing indexer output, plus an on-demand, never-persisted "located detail" view (exact repeated-word occurrences and their character positions) for a writer who wants to act on a flag rather than just see it.

## The FR-1/Task 2 tension: a benchmark stand-in adopted as production code, on purpose

`frontend/src/lib/models/prose-diagnostics.ts` implements `dialogueRatio` and `averageSentenceLength` by porting, verbatim, the exact regex approach used by the throwaway benchmark stand-ins in `frontend/tests/proseDiagnosticsBenchmark.test.ts` (`dialogueRatioStandin` / `averageSentenceLengthStandin`, added by Feature 63's benchmark work). That benchmark file's own docblock warns "Do not reuse these functions as production code" — a warning that was correct when written, describing algorithms not yet product-approved.

That warning is knowingly superseded here, not silently ignored:

- Feature 63's benchmark measured this specific approach's combined wall-clock cost (all three metrics together, not summed individually) at 0.128 ms / 1.256 ms / 12.892 ms for 1k / 10k / 100k words (median of 7 runs) — see `specs/product/getwrite.features.md`, Feature 63, and the benchmark test file itself.
- Gate 3 for Feature 62 (resolved by the user, "take your recs," 2026-09-27 — see the spec's Open Questions OQ-3) explicitly directs adopting the same regex approach as-is, including its known "Mr." false-split limitation on `averageSentenceLength` — ported deliberately, not fixed, per that direction.
- FR-2 extends Feature 63's synchronous-safety finding, previously scoped only to throwaway stand-ins, to this feature's real algorithms, since they are now the same code.

A later reader should treat this file's reuse of the benchmark's regexes as an intentional, later, explicit product decision, not a violation of the benchmark file's own warning. A more sophisticated sentence/dialogue detector (handling abbreviations, em-dashes, nested quotes) is out of scope, deferred pending its own benchmark pass to establish whether the synchronous-safety finding still holds at that cost.

`topRepeatedWords` diverges from its own benchmark stand-in (`topRepeatedWordsStandin`) in one respect: it reuses `inverted-index.ts`'s exported `tokenize()` (and, through it, that module's internal `STOP_WORDS` set) instead of the stand-in's ad hoc `text.toLowerCase().match(/[a-z']+/g)` tokenization, so word filtering matches the rest of the app's search/indexing behavior.

## Model modules

- `frontend/src/lib/models/prose-diagnostics.ts` — the three pure metric functions:
  - `dialogueRatio(text)` — fraction of `text`'s characters that fall inside a quoted-speech span (`"…"` or `"…"`, straight or curly), including the quote marks themselves. 0 for empty text or text with no quotes.
  - `averageSentenceLength(text)` — average whitespace-delimited word count across sentences split on `/[.!?]+\s+/`. Known limitation, ported deliberately: an abbreviation like "Mr." is treated as a sentence boundary, falsely splitting the sentence it belongs to.
  - `topRepeatedWords(text, opts?)` — the top N most frequent words (default N 10, minimum 3 occurrences to qualify), excluding stop words, via `tokenize()`.
  - `locateRepeatedPhrases(text, opts?)` — for the same top-N/min-occurrence words `topRepeatedWords` computes, every character offset each occurs at within `text`. Never persisted; recomputed fresh on every call (FR-5).
  - `HEURISTIC_VERSION` — a version tag bumped whenever an algorithm here changes in a way that could alter a previously-computed diagnostic's meaning, so a stale persisted record can be detected and recomputed.
- `frontend/src/lib/models/diagnostics-index.ts` — the persisted index over `prose-diagnostics.ts`'s scalar metrics, mirroring `mention-index.ts`'s shape and lock-handling precedent:
  - `DiagnosticsIndex` — `Record<resourceId, DiagnosticsRecord>`, one project-wide file at `meta/index/diagnostics.json`, validated against `DiagnosticsIndexSchema` (`schemas.ts`) — new ground for this codebase's index modules, since `mention-index.ts`'s own load path is an unvalidated `JSON.parse` cast.
  - `loadDiagnosticsIndex(projectRoot)` — loads the persisted index, degrading to `{}` on a missing or schema-invalid file, but rethrowing a locked-access error (`isLockedAccessError`) rather than degrading to it, per FR-4.
  - `persistDiagnosticsIndex(projectRoot, index)` — writes the whole index under `withMetaLock`.
  - `removeResourceFromDiagnosticsIndex(projectRoot, resourceId)` — deletes one resource's own key, mirroring `mention-index.ts`'s `removeResourceFromMentionIndex`.
  - `rebuildDiagnosticsRecordIfStale(projectRoot, resourceId, plainText)` — the lazy-rebuild-on-read seam: returns the stored record unchanged when its `heuristicVersion` matches the current one, otherwise recomputes and re-persists before returning. Used by both the summary route (Task 4) and the indexer (Task 3).

## Indexer wiring

`frontend/src/lib/models/indexer-queue.ts`'s `runTask` computes the three scalar metrics unconditionally at every save, in the same task that rebuilds the mention index (FR-2/FR-3) — not deferred to an async/background queue, per Feature 63's measured cost above. `loadPersistedPlainText(projectRoot, resourceId)` (also in `indexer-queue.ts`) is the shared read both the indexer and the two HTTP routes below use to read a resource's persisted plain text; it returns `undefined` for a resource with no persisted text yet, treated as the empty string by every caller.

## Routes

- `GET /api/resource/[resource-id]/diagnostics` (`frontend/app/api/resource/[resource-id]/diagnostics/route.ts`) — the FR-7 persisted-summary read. Reads the resource's persisted plain text, rebuilds the stored record first if missing or stale via `rebuildDiagnosticsRecordIfStale`, and responds 200 with `{ dialogueRatio, averageSentenceLength, topRepeatedWords }` even for a resource with no diagnostics yet (zeroed shape, not a 404 — mirrors the mentions route's "no data yet is not an error" precedent). A locked/keyless project's error propagates through `withStorageContext` uncaught.
- `GET /api/resource/[resource-id]/diagnostics-detail` (`frontend/app/api/resource/[resource-id]/diagnostics-detail/route.ts`) — the FR-5/FR-8 on-demand located-detail read. Reads the same persisted plain text the summary route reads, calls `locateRepeatedPhrases` fresh on every call, and never writes to the diagnostics index or anywhere else. Responds `{ locatedRepeatedWords }`, empty list rather than 404 when there is no persisted text yet.

## Transport modules

Both new transports resolve through the same `createTransport` collapse the rest of the codebase uses (ADR-021 Phase 2 parity):

- `frontend/src/lib/api/prose-diagnostics.ts` — declares `ProseDiagnosticsTransport` (`getProseDiagnostics`, `getProseDiagnosticsOrThrow`, `getProseDiagnosticsDetail`), `httpProseDiagnosticsTransport` (fetches the two routes above, validates each response body against `ProseDiagnosticsResponseSchema`/`ProseDiagnosticsDetailResponseSchema` in `lib/api/schemas.ts`), and `resolveProseDiagnosticsTransport` (the `createTransport` thunk, dynamically importing the native backend only on the native runtime). `getProseDiagnostics` and `getProseDiagnosticsDetail` degrade gracefully to `EMPTY_PROSE_DIAGNOSTICS`/`EMPTY_PROSE_DIAGNOSTICS_DETAIL` on any failure (network error, non-2xx, malformed body) rather than throwing, since a diagnostics summary is advisory — the same posture `mentions.ts`/`entity-alias-table.ts` take, and deliberately not the reject-on-failure posture `trash.ts`/`writing-log.ts` take, since "no diagnostics" and "the read failed" are not safety-critical to distinguish here the way an empty trash listing or a zeroed writing log would be. **`getProseDiagnosticsOrThrow` (Task 14, FR-4/FR-7)** is the one exception, added later: identical to `getProseDiagnostics` except it REJECTS on any failure (network error, non-2xx including a locked project's 401/409, or a malformed body) instead of degrading, mirroring `entity-relationships.ts`'s `listOrThrow` — added because `ProseDiagnosticsSection.tsx`, the sole production caller of either function, needs to tell "this resource genuinely has zero metrics" apart from "the read failed" so it can render its `error` state (`role="alert"`, distinct copy) rather than a zeroed summary indistinguishable from a genuinely-empty resource. `ProseDiagnosticsSection.tsx` now calls `getProseDiagnosticsOrThrow`, not `getProseDiagnostics`; `getProseDiagnostics` itself is unchanged and has no other production caller. `getProseDiagnosticsDetail` (the located-detail read behind "Show detail") has the identical unaddressed gap and was deliberately left out of Task 14's scope.
- `frontend/src/store/transport/native-prose-diagnostics-backend.ts` (+ `.web-stub.ts`) — the native in-process implementation, calling `rebuildDiagnosticsRecordIfStale`/`loadPersistedPlainText`/`locateRepeatedPhrases` directly rather than over HTTP, resolving `projectId` → project root via `project-root-resolver.ts`'s `resolveProjectRoot()`, and running through the shared `createNativeRunner` helper (mirroring `native-mentions-backend.ts`). Unlike the HTTP transport's unconditional degrade, `getProseDiagnostics` on this backend rethrows a locked-access error (`isLockedAccessError`) rather than folding it into the empty default, mirroring `diagnostics-index.ts`'s and `indexer-queue.ts`'s own fail-closed handling — a locked or keyless project is not the same fact as "this resource genuinely has no diagnostics yet." `getProseDiagnosticsOrThrow` on this backend does not catch anything at all: an invalid `projectId` or any read failure (including a locked-access error) propagates uncaught, mirroring `native-entity-relationships-backend.ts`'s `listOrThrow`.

## UI

- `frontend/components/Sidebar/ProseDiagnosticsSection.tsx` — the FR-1 read-only sidebar section, rendered from `MetadataSidebar.tsx` for text resources only, styled like the existing read-only computed-data sections (`ImageMetadataSection.tsx`/`AudioMetadataSection.tsx`), not the goal-setting `WordCountGoalSection.tsx`. A discriminated `loading | ready | error` state (never silently renders nothing, per `docs/standards/failure-visibility.md`), plus a "Show detail" button opening the located-detail dialog.
- `frontend/components/Sidebar/ProseDiagnosticsDetailDialog.tsx` — the FR-5/FR-8 located-detail overlay, built on `UI/Dialog` and mirroring `WritingLogDetailsDialog.tsx`'s structure exactly: fetched fresh every time it opens, never cached across opens, with a `returnFocusRef` that restores focus to the opening button on close.
- Both use the red-reservation rule (`docs/standards/security.md`/STYLING.md): nothing here is rendered in red, per FR-6.

## Working-copy strings, not yet user-confirmed

Per FR-1's Non-goals, the exact copy in both components — the section heading "Prose diagnostics", metric labels, loading/error text, "Show detail", and the dialog's title/description/labels — is working copy that tests are written against but that has not been confirmed with the product owner, mirroring how Features 60 (`StatusRollup.tsx`) and 61 (`WordCountGoalField.tsx`) carried the same caveat in their own docs. The fixed top-N (10) and minimum-occurrence floor (3) used by `topRepeatedWords` are likewise working-copy values (FR-3/OQ-2), not yet confirmed.

## Locked/keyless projects

Every read in this feature fails closed on a locked or keyless encrypted project (`isLockedAccessError`) rather than degrading to zero/empty at the model and native-backend layers (`diagnostics-index.ts`, `indexer-queue.ts`'s `loadPersistedPlainText`, the native backend) — see Task 8. The HTTP transport's own degrade-to-empty behavior (above) is a separate, higher layer: a locked-access error thrown by the route still propagates through `withStorageContext` to an HTTP 401/409 before the client transport's `try`/`catch` ever sees a successful-but-empty response.

## Out of scope

Per the spec's Non-goals/Out of scope: no project-wide diagnostics roll-up or aggregation; no backfill for resources saved before this feature shipped (metrics compute lazily, on first read after a version mismatch or at next save); no change to the mention index, backlinks, entity layer, writing log (Feature 59), or status roll-up (Feature 60); no more sophisticated sentence/dialogue detector than the benchmark stand-in adopted above.
