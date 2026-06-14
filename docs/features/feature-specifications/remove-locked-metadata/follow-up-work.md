# Follow-up Work: Remove Locked Metadata

Deferred, non-blocking items discovered while implementing the feature. Each
notes why it was deferred and what a future implementer needs.

---

## 2026-06-13 — `normalizeProjectConfig` drops `config.features` / `config.organizerCardBody`

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
