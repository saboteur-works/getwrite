# Tasks: Transport response-body validation — remaining sites

Source spec: `specs/features/transport-validation-remaining-sites.md`
Granularity: story points (1/2/3/5/8)

## Context for implementers

This is the final increment of the transport response-body validation
initiative (Features 48, 50, 51 already shipped). All 4 remaining sites reuse
Feature 48's mechanism verbatim: a Zod schema in
`frontend/src/lib/api/schemas.ts`, validated at the point a response body is
parsed, reporting through `reportTransportValidationFailure`
(`frontend/src/lib/api/transport-validation.ts`) on failure while leaving each
site's existing reject-or-degrade contract untouched (FR-5). Follow the
precedent set by prior features' test files — e.g.
`frontend/tests/unit/compile-transport-validation.test.ts` and
`frontend/tests/unit/resources-patch-revision-content-validation.test.ts` — a
dedicated new test file per site (or one shared file per module for the two
`editor-config.ts` sites), not edits scattered into unrelated existing test
files. Mock `reportTransportValidationFailure`/`reportTransportReadFailure`
the same way those files do, and assert the reporter is called with no raw
response body.

Verified against source at spec-write time:
- `frontend/src/lib/api/encryption.ts`'s `request()` spans lines 37-50; the
  error-path body is parsed at line 44 and consumed (`body.error`) at line 47;
  the success-path body is parsed and cast at line 49.
- `frontend/src/lib/api/editor-config.ts`'s `httpEditorConfigTransport`:
  `saveHeadings`'s body parse is at lines 59-61, `saveBody`'s at lines 74-76.
- `frontend/src/lib/api/preferences.ts`'s `httpPreferencesTransport
  .saveRevisionSettings` body parse is at lines 63-66.
- `ApiEditorConfigSchema` already exists in `frontend/src/lib/api/schemas.ts`
  (module-local `const`, line 84) — reuse it directly; it does not need to be
  exported since the new schema is declared in the same file.
- `schemas.ts`'s organizing convention is "one schema per response shape,
  grouped by owning module."

### Task 1: Author encryption.ts response schemas

**What:** Add two new Zod schemas to `frontend/src/lib/api/schemas.ts` for
`encryption.ts`'s two response-body shapes — a success-path
`EncryptionStatusSchema` (`isAvailable: boolean`, `hasKeyring: boolean`,
`isUnlocked: boolean`, `encryptedProjectIds: z.array(z.string())`) matching
the `EncryptionStatus` interface exactly, and an error-path schema for the
shape read at `encryption.ts:44` (`{ error?: string }`), grouped alongside
the existing Feature 48/50/51 schemas per the file's own "one schema per
response shape, grouped by owning module" convention.

**Files:** `frontend/src/lib/api/schemas.ts`

**Done when:** Both schemas exist, are exported, and `EncryptionStatusSchema`'s
shape matches `EncryptionStatus` (`encryption.ts:19-28`) field-for-field with
no extra or missing field; `pnpm --filter getwrite-frontend typecheck` passes.

**Depends on:** none

**Estimate:** 2

**Notes:** No existing runtime schema for `EncryptionStatus` exists anywhere
to reuse (confirmed by spec OQ-4) — author both from scratch. The error-path
schema is intentionally minimal/optional (`{ error: z.string().optional() }`)
since a malformed or empty error body must not itself be flagged as a second
validation failure on top of the original non-2xx response.

**Done:** [ ]

---

### Task 2: Validate encryption.ts's request() error and success paths

**What:** In `encryption.ts`'s `request()` helper, validate the error-path
body (parsed at line 44) against the new error-body schema before reading
`.error` at line 47, and validate the success-path body (parsed/cast at line
49) against `EncryptionStatusSchema` before returning it — reporting a
validation failure via `reportTransportValidationFailure` on either path
without changing the existing throw-with-fallback-message (error path) or
reject-on-malformed-body (success path) behavior.

**Files:** `frontend/src/lib/api/encryption.ts`

**Done when:** Both parses run through their respective schema's `.safeParse`
(or equivalent) before the value is consumed; a validation failure on either
path calls `reportTransportValidationFailure` with a call-site identifier and
the issue list, never the raw body; `fetchEncryptionStatus`,
`unlockWorkspaceRequest`, `lockWorkspaceRequest`,
`enableProjectEncryptionRequest`, and `resumeConversionsRequest` (all of which
call `request()`) are behaviorally unchanged on a well-formed response;
`pnpm --filter getwrite-frontend typecheck` and
`pnpm --filter getwrite-frontend lint` pass.

**Depends on:** Task 1

**Estimate:** 3

**Notes:** `exportPlaintextCopyRequest`'s own `as`-cast return type
(`EncryptionStatus & { exportedId: string }`) is explicitly out of scope
(FR-2) — do not touch it beyond it continuing to call the now-validated
`request()` underneath.

**Done:** [ ]

---

### Task 3: Test encryption.ts response validation

**What:** Add a new test file covering `request()`'s validation of both the
error-path and success-path bodies — well-formed passes through unchanged,
malformed on either path reports via `reportTransportValidationFailure`
without leaking the response body, and the existing throw/reject behavior is
preserved in both cases.

**Files:** `frontend/tests/unit/encryption-transport-validation.test.ts` (new)

**Done when:** New test file exists and covers: (1) well-formed success body
resolves normally with no report call; (2) malformed success body reports a
validation failure and still rejects/throws per the existing contract; (3)
malformed error-path body (on a non-2xx response) reports a validation
failure while still throwing with the existing fallback-message behavior;
`pnpm --filter getwrite-frontend test:ci -- encryption-transport-validation`
(or the project's equivalent targeted run) passes.

**Depends on:** Task 2

**Estimate:** 3

**Notes:** Mirror `frontend/tests/unit/compile-transport-validation.test.ts`'s
fetch-mocking style (`vi.stubGlobal("fetch", ...)`, mocked
`reportTransportValidationFailure`/`reportTransportReadFailure`). Check
`frontend/tests/integration/encryption-request-path.test.ts` first in case it
already exercises `request()`'s fetch-mocking in a way worth extending instead
of duplicating setup.

**Done:** [ ]

---

### Task 4: Author and apply editor-config.ts response schema

**What:** Add one new fully-optional Zod schema to
`frontend/src/lib/api/schemas.ts` mirroring `EditorConfigResponse`
(`editor-config.ts:5-8`) exactly — `z.object({ editorConfig:
ApiEditorConfigSchema.optional(), error: z.string().optional() })` — reusing
the existing `ApiEditorConfigSchema`, then validate `saveHeadings`'s body
parse (lines 59-61) and `saveBody`'s body parse (lines 74-76) against it in
`httpEditorConfigTransport`, reporting a validation failure via
`reportTransportValidationFailure` on either method while preserving each
method's existing throw-`body?.error`-or-fallback behavior on `!response.ok`.

**Files:** `frontend/src/lib/api/schemas.ts`,
`frontend/src/lib/api/editor-config.ts`

**Done when:** The new schema exists in `schemas.ts`; both `saveHeadings` and
`saveBody` validate their parsed body against it before use; a legitimate
error-only body (`{ error: "..." }`, no `editorConfig`) does NOT trigger a
reported validation failure; a genuinely malformed body (e.g. wrong type for
a known field) does; both methods' existing return/throw behavior on a
well-formed body is unchanged; `pnpm --filter getwrite-frontend typecheck` and
`pnpm --filter getwrite-frontend lint` pass.

**Depends on:** none (independent of encryption.ts work; may run in parallel
with Tasks 1-3)

**Estimate:** 3

**Notes:** This schema is deliberately permissive by design (FR-3) — a body
missing both fields (`{}`) must still pass. Do not tighten it beyond the
spec's stated shape; the requirement is "don't flag a legitimate error-only
body," not maximal strictness.

**Done:** [ ]

---

### Task 5: Test editor-config.ts response validation

**What:** Add test coverage for `httpEditorConfigTransport.saveHeadings` and
`.saveBody` validating their response body against the new permissive schema,
confirming a legitimate error-only body is never flagged and a genuinely
malformed body is reported without leaking its contents.

**Files:** `frontend/tests/unit/editor-config-transport-validation.test.ts`
(new)

**Done when:** New test file covers, for both `saveHeadings` and `saveBody`:
(1) well-formed success body resolves normally with no report call; (2) a
legitimate error-only body (`{ error: "..." }`) on a non-2xx response does
NOT call `reportTransportValidationFailure`, and still throws with that
error message; (3) a malformed body (wrong field type) does call
`reportTransportValidationFailure` without the raw body appearing in the
report or console; `pnpm --filter getwrite-frontend test:ci -- editor-config`
(or equivalent targeted run) passes, including any pre-existing tests in
`frontend/tests/unit/project-editor-config-route.test.ts` and
`frontend/tests/unit/native-editor-config-backend*.test.ts` that exercise the
same transport.

**Depends on:** Task 4

**Estimate:** 3

**Notes:** Mirror `frontend/tests/unit/resources-patch-revision-content-validation.test.ts`'s
pattern for the "permissive schema, don't flag a legitimate degrade body"
case, since that's the closest existing precedent for an optional-everything
schema rather than a reject-only strict one.

**Done:** [ ]

---

### Task 6: Author and apply preferences.ts response schema

**What:** Add one new fully-optional Zod schema to
`frontend/src/lib/api/schemas.ts` mirroring `saveRevisionSettings`'s inline
response type exactly — `z.object({ defaultRevisionName: z.string()
.optional(), error: z.string().optional() })` — then validate
`httpPreferencesTransport.saveRevisionSettings`'s body parse
(`preferences.ts:63-66`) against it, reporting a validation failure via
`reportTransportValidationFailure` while preserving the existing
throw-`body?.error`-or-fallback behavior on `!response.ok`.

**Files:** `frontend/src/lib/api/schemas.ts`,
`frontend/src/lib/api/preferences.ts`

**Done when:** The new schema exists in `schemas.ts`; `saveRevisionSettings`
validates its parsed body against it before use; a legitimate error-only body
does NOT trigger a reported validation failure; a genuinely malformed body
does; existing return/throw behavior on a well-formed body is unchanged;
`savePreferences`'s fire-and-forget behavior (no response body read at all)
is untouched, since it is out of scope; `pnpm --filter getwrite-frontend
typecheck` and `pnpm --filter getwrite-frontend lint` pass.

**Depends on:** none (independent of Tasks 1-5; may run in parallel)

**Estimate:** 2

**Notes:** Same permissive-by-design shape rule as Task 4 (FR-4) — a body
missing both fields must still pass.

**Done:** [ ]

---

### Task 7: Test preferences.ts response validation

**What:** Add test coverage for `httpPreferencesTransport
.saveRevisionSettings` validating its response body against the new
permissive schema, confirming a legitimate error-only body is never flagged
and a genuinely malformed body is reported without leaking its contents.

**Files:** `frontend/tests/unit/preferences-transport-validation.test.ts`
(new)

**Done when:** New test file covers: (1) well-formed success body resolves
normally with no report call; (2) a legitimate error-only body on a non-2xx
response does NOT call `reportTransportValidationFailure` and still throws
with that error message; (3) a malformed body calls
`reportTransportValidationFailure` without leaking the raw body;
`pnpm --filter getwrite-frontend test:ci -- preferences-transport-validation`
(or equivalent targeted run) passes, including any pre-existing tests in
`frontend/tests/unit/project-preferences-route.test.ts` and
`frontend/tests/unit/native-preferences-backend*.test.ts` that exercise the
same transport.

**Depends on:** Task 6

**Estimate:** 2

**Notes:** None.

**Done:** [ ]

---

### Task 8: Full-suite verification and contract audit

**What:** Run the full frontend verification suite and manually confirm
FR-5 — none of the 4 sites' reject-or-degrade contract changed — by
re-reading each modified call site's control flow against its pre-change
behavior.

**Files:** none (verification only)

**Done when:** `pnpm --filter getwrite-frontend typecheck`,
`pnpm --filter getwrite-frontend lint`, and
`pnpm --filter getwrite-frontend test:ci` (full run) all pass with zero new
failures; a short written confirmation (PR description or commit message) 
notes that `encryption.ts`'s `request()` still rejects on both a non-2xx
response and a malformed success body, and that `editor-config.ts`'s
`saveHeadings`/`saveBody` and `preferences.ts`'s `saveRevisionSettings` still
reject on `!response.ok`, exactly as before this change.

**Depends on:** Tasks 3, 5, 7

**Estimate:** 2

**Notes:** This task exists because the spec's FR-5 is a cross-cutting
constraint over all 4 sites together, not something any single task's "Done
when" fully covers in isolation.

**Done:** [ ]

## Summary

- Total tasks: 8
- Total estimated effort: 20 points
- Critical path: Task 1 → Task 2 → Task 3 → Task 8 (the encryption.ts branch
  is the longest chain; Tasks 4-5 and 6-7 can run in parallel alongside
  Tasks 1-3, but Task 8 waits on all three branches)
- Risks: Task 2 (encryption.ts) touches a security-sensitive read path
  (workspace lock state) — low functional risk since the change is
  additive-only (validation + report, no behavior change on a well-formed
  body), but worth a careful read against `docs/standards/security.md`'s
  no-raw-body-logging rule, which Task 1's dedicated error-body schema and
  `reportTransportValidationFailure`'s existing signature already structurally
  enforce. Tasks 4 and 6's permissive optional-schema shape carries a design
  risk noted explicitly in the spec (OQ-3): it will not catch a body that
  swaps `editorConfig`/`error` for genuinely wrong types beyond what the
  schema declares, which is accepted as intentional, not a defect to fix
  here.

## Open questions

None — the source spec has zero remaining open questions (all 4 resolved and
folded into the functional requirements before this task list was written).
