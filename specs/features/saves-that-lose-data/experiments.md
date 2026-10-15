# Feature 87 experiments

Measurements are recorded as observed values with the test that produced them. A cause is written only where an experiment separated it from the alternatives.

## Part B: D-26 / D-29 (Task 3)

### Environment record

Command run before any process start: `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside the sandbox).
Output: empty (no listener on 7340, 3000 or 6006; exit status 1). This experiment started no server and no other process; it is a vitest run.

### Method

Test: `frontend/tests/f87-status-wordcount-experiment.test.tsx`, test name "F87 Task 3 experiment: Status choice after a 10-word canonical save". Run with
`pnpm --filter getwrite-frontend exec vitest run tests/f87-status-wordcount-experiment.test.tsx --silent=false --reporter=verbose`.

- Storage: in-memory adapter (`createMemoryAdapter`), project root `/ws/<uuid>`; nothing on disk.
- A text resource sidecar with `wordCount: 0` and a zero-word initial canonical revision (`writeInitialCanonicalRevision`).
- The real `app/(app)/page.tsx` mounted with the real `AppShell` and `MetadataSidebar`; `openProject` returns the resource as loaded at that moment (`wordCount: 0`, `plaintext: ""`), standing in for `project-loader.ts`. `TipTapEditor` and `StartPage` are replaced.
- `updateSidecar` is not a no-op mock: it forwards to the real `updateSidecarCore` on the same adapter, so the stored sidecar is observed.
- The canonical save is the real `updateRevisionInPlace` with a 10-word document ("one two three four five six seven eight nine ten"), called after the page had loaded the resource.
- The Status is chosen with `fireEvent.change` on the `status` select, value "Published".

### Observed values

(a) Sidecar `wordCount` after the canonical save of 10 words: `10`
    (`F87 (a) sidecar wordCount after canonical save: 10`)
(b) `wordCount` in the payload `updateResource` sent for the Status choice: `0`
    (`F87 (b) payload wordCount for Status choice: 0`; payload keys observed: `folderId,id,name,orderIndex,plaintext,type,userMetadata,wordCount`; `userMetadata` observed `{"status":"Published"}`)
(c) Sidecar `wordCount` after the Status change: `0`
    (`F87 (c) sidecar wordCount after Status change: 0`)

The Redux/page copy of the resource was not re-read in this experiment; (b) is the page's payload.

### updatedAt: server-derived and client-sent (by reading, plus one observation)

- Server-derived: `frontend/src/lib/models/revision-core.ts:479` (`const updatedAt = new Date().toISOString()`), written into the sidecar at lines 481-491 by the canonical save.
- Client-sent path by reading: `frontend/src/lib/models/project-loader.ts` (return object, `...sidecar`) puts every sidecar key, `updatedAt` included, on the loaded resource; `frontend/app/(app)/page.tsx` `updateResource` sends `applyUpdate(resource)` whole to `updateSidecar`; `frontend/src/lib/models/resource-crud-core.ts:467-469` merges `...update` over the existing sidecar, so a sent `updatedAt` replaces the stored one. This is a reading.
- Observed in this run: the payload had no `updatedAt` key (the sidecar the page loaded had none, because the fixture sidecar was written without one and was read before the canonical save), and the stored `updatedAt` was identical before and after the Status change (`2026-10-15T22:30:16.255Z`). So client-sent `updatedAt` was NOT exercised by this experiment; whether a stale `updatedAt` is stored after a Status change when the loaded sidecar already carried one was not measured.

### Verdict

Hypothesis not disproved: payload carried a stale wordCount and the stored value followed it. Specifically: (a) shows the sidecar held 10 after the canonical save; (b) shows the Status payload carried 0; (c) shows the sidecar held 0 after the Status change. (a)-(c) together separate "the payload carried 0 and the stored value became 0" from "the payload carried 10 and the stored value was still 0"; they do not separate why the page's copy held 0.
