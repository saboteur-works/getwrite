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
