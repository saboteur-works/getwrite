# Follow-up Work: Remove Locked Metadata

Deferred, non-blocking items discovered while implementing the feature. Each
notes why it was deferred and what a future implementer needs.

---

## 2026-06-13 — `normalizeProjectConfig` drops `config.features` / `config.organizerCardBody`

**✅ Resolved (2026-06-14):** `normalizeProjectConfig` now carries through
`features: config?.features` and `organizerCardBody: config?.organizerCardBody`.
Covered by a new `normalizeProjectConfig` describe in `tests/unit/project.test.ts`
(carries the keys through; leaves them `undefined` when no config is given).
`pnpm typecheck` clean; full suite green.

**Discovered during:** Task 4 (Config transport + slice wiring).

**What:** `frontend/src/lib/models/project.ts` → `normalizeProjectConfig()`
returns a new config object built from an explicit allow-list of keys. It does
**not** copy the two new Task 1 keys (`features`, `organizerCardBody`), so any
config passed through it loses them.

**Why it was deferred (not blocking):** Neither store-feeding load path runs
config through `normalizeProjectConfig`:
- `GET /api/projects` (mount/list) parses `project.json` raw and returns
  `config` verbatim → `setProjects` hydrates `features`/`organizerCardBody`.
- `POST /api/project` (single load) → `migrateProjectOnLoad` → raw read, also
  verbatim.

`normalizeProjectConfig` is only used by `loadProject` / `loadProjectConfig`
(`project-config.ts`) and `createProject`. Nothing currently reads the two new
keys through those paths, and new projects intentionally have no `features`
block (all toggles off by default, per FR1/FR2). So there is no live bug today.

**Risk if left:** A future caller that reads feature config via `loadProject()`
(rather than the store) would silently get `undefined` for both keys.

**Suggested fix:** Add `features: config?.features` and
`organizerCardBody: config?.organizerCardBody` to the object returned by
`normalizeProjectConfig`. Low risk (only adds keys when present); re-run
`tests/unit/project-config.test.ts` and any `normalizeProjectConfig` snapshot
tests afterward.

---

## 2026-06-13 — Stale e2e matcher `/story timeline/i` after the Task 2 group rename

**✅ Resolved (2026-06-14):** The matcher at
`frontend/e2e/metadata-sidebar.e2e.spec.ts` ~L144 is now `/timeline/i`, matching
the rendered "Timeline" header and the sibling assertion at ~L180. Not verified
by an e2e run (Playwright needs Storybook on :6006 and is outside `pnpm test:ci`),
but it is a direct correction to the renamed label; run `pnpm test:e2e` next time
Storybook is up to confirm the sidebar e2e is green end to end.

**Discovered during:** Task 7 (Sidebar conditional rendering).

**What:** `frontend/e2e/metadata-sidebar.e2e.spec.ts` (the
`collapse: clicking story timeline header…` test, ~L144) still targets
`page.getByRole("button", { name: /story timeline/i })`. Task 2 renamed the
`builtin-story-timeline` group **label** from "Story Timeline" to "Timeline", so
this regex no longer matches the rendered header and the click would miss.

**Why it was deferred (not blocking):** Playwright e2e is not part of
`pnpm test:ci` (it requires `pnpm storybook` on :6006 + `pnpm test:e2e`), so it
did not surface in any task's verification. The defect predates Task 7 — it is a
leftover from the Task 2 rename, not caused by the gating change. Task 7 only
touched the same file's *fixtures indirectly* by enabling `features` in the
`MetadataSidebar` stories so the controls keep rendering for the e2e.

**Risk if left:** That one e2e test fails (or times out on the click) the next
time the Playwright suite is run.

**Suggested fix:** Change the matcher at ~L144 to `/timeline/i` (matching the
sibling assertions at ~L180). While there, run the full `pnpm test:e2e` against
Storybook to confirm the rest of the sidebar e2e is green under the new
feature-gated stories.

---

## 2026-06-14 — Timeline tooltip never renders `metadata.notes`, and its source is the resource-level `notes`, not the gated `userMetadata.notes`

**Discovered during:** Task 9 (Timeline POV/Notes-optional hardening).

**What:** `TimelineView.tsx` computes `metadata.notes` for each item (now gated
on `selectNotesEnabled` by Task 9), but `TimelineTooltip.tsx` renders **no**
notes row — so `metadata.notes` is currently dead data (the field's JSDoc even
says "Structured metadata for tooltip display"). Separately, the notes value is
read from the **resource-level** `r.notes` field ("User-editable notes" on the
resource), *not* the `userMetadata.notes` metadata field that the Notes feature
toggle (`config.features.notes`) actually governs. Those are two different
fields.

**Why it was deferred (not blocking):** Task 9's "done when" only requires the
tooltip to omit the notes line without error, which holds trivially because no
notes line exists. Adding a notes row would be a Timeline **visual** change,
which the spec lists under Out of scope ("Redesigning the … Timeline … visuals").
Gating the existing (unused) `metadata.notes` on the Notes toggle was the
in-scope, low-risk completion.

**Risk if left:** If a future change surfaces notes in the tooltip, it will (a)
need a new `TooltipRow` and (b) silently show the wrong source — resource-level
`r.notes` rather than the gated `userMetadata.notes` — making the Notes toggle
look ineffective for the metadata field users actually edit in the sidebar.

**Suggested fix:** Decide the intended source. If the timeline should reflect
the Notes **metadata field**, switch `TimelineView` to read
`r.userMetadata?.notes` (still gated on `selectNotesEnabled`) and add a `NOTES`
`TooltipRow` to `TimelineTooltip.tsx` rendered only when `item.metadata?.notes`
is present. If resource-level `notes` is genuinely intended, document that and
decouple it from the Notes feature toggle. Either way, add a tooltip test.

---

## 2026-06-14 — Organizer `text-excerpt` card body has no live data pipeline

**Discovered during:** Task 10 (Organizer card-body consumption).

**What:** The Task 10 consumption layer is complete and tested: `OrganizerCard`
now takes a resolved `body` prop, `OrganizerView` computes it via
`resolveOrganizerCardBody(child, config, { notesEnabled })`, and the
`text-excerpt` branch reads `resource.plainText` (the same field `previews.ts`
slices) and truncates it to `excerptLength`. **However, store resources do not
carry `plainText`.** The load path `getLocalResources()`
(`resource-persistence.ts`, behind `GET /api/projects`) reads only the sidecar
metadata and computes `wordCount` — it never attaches text content. And
`previews.ts` (`generatePreview` / `loadPreview` / `previewPath`) has **zero
callers**: no API route, no save-path generation, no store hydration. So in the
live app, `text-excerpt` mode currently renders **nothing** (an empty body),
even though the resolver, the card, and all three modes are unit/component
tested with text present.

**Why it was deferred (not blocking):** Task 10's "Done when" is satisfied by
the consumption layer — body reflects the config (field / excerpt / none), no
card reads `notes` directly, `showBody` still works, and component tests cover
all three modes. The Task 10 note explicitly anticipated this gap ("text-excerpt
mode needs resource text content, which the card does not currently receive;
plumb a preview/excerpt (reuse `previews.ts`)"). Wiring the actual pipeline
spans three layers — generate previews on the resource save path, a new
read API + transport (or an excerpt field added to the project-list payload),
and store hydration — and the project-list endpoint is a hot path, so an
unconditional per-resource `content.txt` read there is exactly what the note
warns against. That is its own task, larger than card consumption.

**Risk if left:** A user who selects "Text excerpt" in project settings (Task 6
UI) sees blank card bodies — the setting looks broken. `field` and `none` modes
(and the Notes back-compat default) work fully.

**Suggested fix:** Wire `previews.ts`: (1) call `generatePreview` on the text
save path so `meta/previews/<id>.json` carries an `excerpt`; (2) surface that
excerpt to the store — either fold a short `excerpt` into the `GET /api/projects`
resource payload or add a small batch preview-fetch transport that
`OrganizerView` calls for visible text resources; (3) source the
`text-excerpt` branch from that excerpt instead of (or in addition to)
`resource.plainText`. Keep the per-resource read on the **batch load**, never
per card render. Then add an integration test that exercises `text-excerpt` end
to end from disk.

---

## 2026-06-14 — System-wide flat-vs-nested sidecar representation inconsistency in the schema-value-migration subsystem

**Discovered during:** Task 11 (regression coverage — FR6), and confirmed while
attempting the localized fix during the follow-up pass.

**What:** There are two competing on-disk sidecar representations for user
metadata values:

- **Nested (canonical writer):** `saveResource` in `resource-persistence.ts`
  writes `{ id, name, type, …, userMetadata: { <fieldKey>: <value> } }`. The
  load path (`getLocalResources`, `loadProjectFromDisk`) and the Task 3
  migration both read `sidecar.userMetadata[key]`.
- **Flat (schema-value-migration + field-values):** every value-migrating helper
  in `metadata-schema.ts` operates on the **top level** of the sidecar —
  `fieldKey in sidecar` / `sidecar[fieldKey]`. This includes
  `clearFieldFromSidecars` (clear-field), `migrateFieldKeyInSidecars`
  (rename-key), `changeFieldTypeWithMigration`, and
  `updateFieldOptionsWithMigration`. `field-values.ts` `enumerateFieldValues`
  likewise reads top-level keys (though it takes sidecars as a parameter, so the
  query route can hand it a flattened view).

If real on-disk sidecars are nested (as the canonical writer produces), then the
**entire flat subsystem operates on the wrong level** — clear-field never
clears, rename-key never migrates stored values, change-type never converts
them, etc. — and this is masked because the whole `metadata-schema-migration`
test suite writes **flat** fixtures (`writeSidecar(dir, id, { tone: "…" })`)
rather than the nested shape `saveResource` actually persists.

**Status of the attempted fix (reverted):** A localized patch to
`clearFieldFromSidecars` (delete from `sidecar.userMetadata` instead of the top
level) was implemented and then **reverted**, because (a) it broke the existing
flat-fixture tests in `metadata-schema-migration.test.ts`, and (b) it would
leave `clearField` inconsistent with its sibling migrators, which all still
operate flat. Fixing one function in isolation is wrong; this needs to be
reconciled across the whole subsystem at once.

**Why it was deferred (not blocking for this feature):** The spec lists
"Reinterpreting user data beyond preserving existing values" as a non-goal, and
the bug is *preservation-safe* (it over-preserves — values are never silently
deleted), so it does **not** violate FR6. FR6 is covered: `removeField` (the
non-destructive remove) leaves sidecars byte-for-byte untouched (test in
`metadata-schema.test.ts`).

**Risk if left:** Destructive/transform schema-editor actions (clear values,
rename key, change type, edit options) may silently no-op against
canonically-written (nested) sidecars — values the user expects cleared remain
on disk; renamed/retyped fields keep their old stored values under the old key.
A privacy/expectation gap for "clear values" specifically.

**Suggested fix (its own task, not a quick patch):** First establish the ground
truth — confirm what the live metadata-edit path actually writes to disk (nested
vs flat) by inspecting an on-disk sidecar from a real project, since the sidebar
edit path may differ from `saveResource`. Then reconcile **all** value-migrating
helpers (`clearFieldFromSidecars`, `migrateFieldKeyInSidecars`,
`changeFieldTypeWithMigration`, `updateFieldOptionsWithMigration`) and
`field-values` to a single representation, and rewrite the
`metadata-schema-migration` fixtures to the canonical shape. Treat as a focused
data-layer correctness task with full migration-suite re-verification.
