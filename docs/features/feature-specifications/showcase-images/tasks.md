# Showcase Images — Implementation Tasks

Derived from `showcase-images-spec.md`. Granularity: story points (1/2/3/5/8).

Grounding notes (from codebase survey):
- The app is a client-state SPA — only `/`, `/preferences`, `/project-types` are
  real routes. Project/resource selection is driven by UI interaction, so scene
  navigation lives mostly in Playwright setup steps, not URLs.
- `frontend/src/lib/models/projects-dir.ts` honors `GETWRITE_PROJECTS_DIR`; the
  runner points this at `scripts/showcase/fixture/` so the booted app serves the
  committed fixture project.
- Dark mode is the `gw-theme-dark` class on the document root, applied by
  `AppearanceRuntime.tsx` from user preferences — theme forcing happens at
  runtime via `page.evaluate`/preference seeding.
- Existing Playwright usage pattern lives in
  `frontend/src/cli/commands/screenshots.ts` (chromium, full-page PNG).

---

### Task 1: Define the scene manifest type and schema

**What:** A typed, declarative scene manifest where each entry specifies id, route, optional setup steps, theme, and viewport.
**Files:** `scripts/showcase/scenes.ts` (manifest + types), or `scripts/showcase/manifest.ts`
**Done when:** A TypeScript `Scene` type exists with `id`, `route`, `steps?`, `theme`, `viewport` fields, and an exported (possibly empty) typed `scenes` array compiles with no `any`.
**Depends on:** none
**Estimate:** 2
**Notes:** `theme` and `viewport` should be enums/unions (e.g. `"light" | "dark"`, `"desktop"`). Keep `route` relative to the app base URL.
**Done:** [x]

### Task 2: App boot/teardown against the fixture

**What:** Orchestration that starts the app with `GETWRITE_PROJECTS_DIR` pointed at the committed fixture, waits until it serves, and tears it down afterward.
**Files:** `scripts/showcase/boot.ts` (server lifecycle helpers)
**Done when:** A function boots the app on a known port serving `scripts/showcase/fixture/`, resolves once the server responds, and reliably kills the process on completion or error.
**Depends on:** none
**Estimate:** 5
**Notes:** Decide dev vs. standalone server; dev (`next dev`) is simplest for a tool. Handle port-in-use and ensure teardown runs in a `finally`.
**Done:** [x]

### Task 3: Core scene runner

**What:** A Playwright runner that launches Chromium, iterates the manifest, navigates to each scene's route, and captures a full-page PNG.
**Files:** `scripts/showcase/run.ts`
**Done when:** Running against a booted app produces one PNG per manifest scene (themes/naming handled in later tasks).
**Depends on:** 1
**Estimate:** 3
**Notes:** Reuse the chromium/full-page approach from `screenshots.ts`. Add a settle wait for fonts/animations.
**Done:** [x]

### Task 4: Theme and desktop viewport application

**What:** Per-scene capture in both light and dark themes at a desktop viewport.
**Files:** `scripts/showcase/run.ts`, possibly a `scripts/showcase/theme.ts` helper
**Done when:** Each scene yields two images (light and dark) at a fixed desktop viewport; the dark image shows `gw-theme-dark` applied.
**Depends on:** 3
**Estimate:** 3
**Notes:** Force theme by toggling `gw-theme-dark` on the root via `page.evaluate`, or by seeding the appearance preference before load. Verify the chosen path survives client hydration.
**Done:** [x]

### Task 5: Reusable setup-step primitives

**What:** A small library of named, reusable interaction steps (e.g. open resource, select project, hide cursor) referenced by manifest scenes.
**Files:** `scripts/showcase/steps.ts`
**Done when:** A scene declaring steps (e.g. `["selectProject", "openResource"]`) drives the SPA into the intended state before capture, with each step implemented as a typed function.
**Depends on:** 3
**Estimate:** 3
**Notes:** Since navigation is UI-driven, these primitives do most scene setup. Prefer role/text selectors over brittle CSS.
**Done:** [x]

### Task 6: Deterministic output naming and configurable directory

**What:** Write images to a configurable output directory with deterministic names derived from scene id and theme.
**Files:** `scripts/showcase/run.ts`
**Done when:** Output dir is configurable (flag/env, default e.g. `./showcase-out`), is created if missing, and files are named like `<scene-id>--<theme>.png`; reruns overwrite identically.
**Depends on:** 3
**Estimate:** 2
**Done:** [x]

### Task 7: Author the initial scene manifest entries

**What:** Populate the manifest with the first real showcase scenes against the fixture (e.g. organizer, editor, metadata/query views).
**Files:** `scripts/showcase/scenes.ts`
**Done when:** The manifest contains at least 3 scenes that capture cleanly (correct state, no loading spinners) in both themes.
**Depends on:** 1, 5
**Estimate:** 2
**Notes:** Uses the committed Zoey serial fixture; pick scenes that show off distinct app surfaces.
**Done:** [x]

### Task 8: Wire `pnpm showcase`, scene filtering, and fail-fast exit

**What:** A single repo-root command that boots, captures, and tears down end to end, with optional scene-id filtering and non-zero exit on failure.
**Files:** root `package.json` (script), `scripts/showcase/run.ts`
**Done when:** `pnpm showcase` runs the full pipeline from a clean checkout; `--scene <id>` (or equivalent) limits to a subset; boot failure or any scene failure exits non-zero and logs the failing scene.
**Depends on:** 2, 3, 4, 5, 6
**Estimate:** 3
**Notes:** Compose boot (Task 2) with the runner inside a `finally`-guarded teardown.
**Done:** [x]

---

## Summary

- Total tasks: 8
- Total estimated effort: 23 story points
- Critical path: Tasks 1 → 3 → 4 → 8 (with Task 2 joining at Task 8)
- Risks:
  - Task 2 (app boot/teardown) — server lifecycle, port handling, and reliable
    teardown are the highest-uncertainty piece.
  - Task 4 (theme forcing) — making `gw-theme-dark` reliably apply and survive
    hydration may need iteration.
  - Task 5 (setup primitives) — UI-driven navigation means selectors can be
    brittle; depends on stable, identifiable elements.
