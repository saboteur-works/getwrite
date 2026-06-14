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
