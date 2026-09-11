# Follow-up work — scrivener-cli-importer

### FU-1: `sidecar.ts` logs a "sidecar not found" warning on every brand-new resource's first write

**What:** `sidecar.ts`'s `readSidecar` unconditionally logs
`console.warn("sidecar not found for", resourceId, "at", filePath)` on any
`ENOENT` (lines ~50-66), and `writeSidecar`'s own pre-write defensive check
(line ~145) calls `readSidecar` on every resource write, including a
brand-new resource's very first write — which by definition has no prior
sidecar. This fires deterministically for every resource any part of the app
creates (not specific to the Scrivener importer), and is unrelated to
whether background indexing is suspended.
**Why deferred:** FR-23 (Task 19) explicitly scopes `sidecar.ts` out of
bounds — no FR-23-compliant implementation may modify it. Measured while
fixing Task 16's pre-written `scrivener-import.test.ts` FR-23 assertions,
one of which (`expect(sidecarNotFoundCalls).toEqual([])`) was unsatisfiable
by any FR-23-compliant change and was removed as part of Task 19.
**Context:** `frontend/src/lib/models/sidecar.ts`'s `readSidecar` (the
`ENOENT` branch) and `writeSidecar`'s pre-write `readSidecar` call. A fix
would likely change `writeSidecar`'s own pre-write check to not treat "no
prior sidecar" as a warning-worthy condition (e.g. call a variant that
doesn't log, or check existence without going through the logging
`readSidecar` path) — deliberately not attempted here since it touches a
file this task cannot modify.
**Relates to:** Task 19 (FR-23)
**Raised:** 2026-09-11
**Resolved:** [ ]
**Resolved on:**
