# Implementation Tasks: Update Notice

Derived from `spec.md`. Granularity: story points (1/2/3/5/8).

Architecture notes that shape these tasks:

- The same Next.js app serves both web and desktop, so "desktop only" (FR1) is discriminated by a **server-side env var injected by Electron's `startServer`** (alongside the existing `GETWRITE_PROJECTS_DIR`). The client learns the result through an API route, never directly.
- The current running version comes from `frontend/package.json` (read server-side). The latest version comes from the public GitHub Releases API for `saboteur-works/getwrite` (verified reachable unauthenticated). Comparison and the network call happen **server-side in an API route** to centralize gating, caching, and graceful failure (FR2, FR8, FR9).
- Dismiss and Skip (FR6/FR7) both reduce to "store the highest suppressed version; show only if `latest > suppressed`," persisted client-side in `localStorage`.

---

### Task 1: Inject desktop flag from the Electron shell — ✅ Done

**What:** Electron's spawned server is marked as the desktop build so the frontend can gate the notice.
**Files:** `electron/src/main.ts`
**Done when:** `startServer`'s `env` includes `GETWRITE_DESKTOP=1` (and, optionally, `GETWRITE_REPO=saboteur-works/getwrite`), and a packaged/dev launch shows the var present in the spawned process env.
**Depends on:** none
**Estimate:** 1
**Notes:** Mirror the existing `GETWRITE_PROJECTS_DIR` pattern in the `env` object. Keep the repo slug overridable via env to avoid hardcoding it in the route.

### Task 2: Pure semver comparison utility — ✅ Done

**What:** A pure function that reports whether one semver string is strictly greater than another.
**Files:** `frontend/src/lib/models/semver-compare.ts`, `frontend/tests/semver-compare.test.ts`
**Done when:** `isNewer(a, b)` returns correct boolean for major/minor/patch differences, equal versions, and a leading-`v` prefix (e.g. `v0.2.50` vs `0.2.49`); unit tests pass via `pnpm test:ci`.
**Depends on:** none
**Estimate:** 1
**Notes:** No `semver` dependency exists; per `package-selection.md` a ~20-line pure comparator for `MAJOR.MINOR.PATCH` is cheaper than a dep. Ignore pre-release/build metadata (non-goal).

### Task 3: Update-check model (fetch + assemble result) — ✅ Done

**What:** A model function that fetches the latest GitHub Release, compares it to the current version, and returns a typed result.
**Files:** `frontend/src/lib/models/update-check.ts`, `frontend/tests/update-check.test.ts`
**Done when:** Given a mocked GitHub `releases/latest` payload and a current version, the function returns `{ updateAvailable, currentVersion, latestVersion, releaseUrl, downloadUrl }`; on fetch error / non-200 / unparseable body it resolves to `{ updateAvailable: false }` without throwing (FR8). Tests pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** `releaseUrl` = release `html_url`; `downloadUrl` = a platform-matched asset `browser_download_url` (fall back to `html_url` if no asset matches). Use a short fetch timeout. Read current version from `package.json`.

### Task 4: `/api/version-check` route (gate + cache) — ✅ Done

**What:** An API route that returns the update-check result only for the desktop build, cached to respect the 24h throttle.
**Files:** `frontend/app/api/version-check/route.ts`, `frontend/tests/api-version-check.test.ts`
**Done when:** Route returns `{ updateAvailable: false }` (or 204) when `GETWRITE_DESKTOP` is unset (FR1); when set, returns the model result; a repeated call within 24h does not re-hit GitHub (FR9); a failing check yields a 200 with `{ updateAvailable: false }` (FR8). Tests pass.
**Depends on:** 3
**Estimate:** 3
**Notes:** Follow the `getwrite-api-route` skill conventions (typed request/response, consistent errors). In-memory module-level cache keyed by current version with a timestamp is sufficient for a single-process standalone server.

### Task 5: Client transport service — ✅ Done

**What:** A client function that calls `/api/version-check` and returns the typed result.
**Files:** `frontend/src/store/update-check-transport-service.ts`
**Done when:** `fetchUpdateCheck()` returns the parsed result and resolves to `{ updateAvailable: false }` on any network/parse failure; type matches the route's response.
**Depends on:** 4
**Estimate:** 1
**Notes:** Mirror the existing `*-transport-service.ts` files (e.g. `feature-config-transport-service.ts`). No Redux slice required — this is read-once, ephemeral state.

### Task 6: Suppression persistence utility — ✅ Done

**What:** A client utility that records and reads the highest dismissed/skipped version from `localStorage`.
**Files:** `frontend/src/lib/update-notice-suppression.ts`, `frontend/tests/update-notice-suppression.test.ts`
**Done when:** `getSuppressedVersion()` / `setSuppressedVersion(v)` round-trip through `localStorage`; `isSuppressed(latest)` returns true only when `latest` is not newer than the stored version (FR7, reuses Task 2's comparator). Tests pass.
**Depends on:** 2
**Estimate:** 1
**Notes:** Dismiss and Skip write the same stored value; the button labels differ but the persisted effect is identical per spec.

### Task 7: `UpdateNoticeBanner` component + Storybook story — ✅ Done

**What:** A dismissible banner presenting the new-version message and its four actions.
**Files:** `frontend/components/Layout/UpdateNoticeBanner.tsx`, `frontend/components/Layout/UpdateNoticeBanner.stories.tsx`
**Done when:** Component renders the new version and offers "View release notes" (opens `releaseUrl`), "Download" (opens `downloadUrl`), "Dismiss", and "Skip this version" (FR3–FR6); actions fire callback props; a Storybook story exists and passes a11y. Built per brand tokens (no red for actions per STYLING.md).
**Depends on:** none
**Estimate:** 3
**Notes:** Verify props against TypeScript/stories per CLAUDE.md. Keep it presentational (data + callbacks via props) so it's testable in isolation.

### Task 8: Wire banner into the app shell — ✅ Done

**What:** AppShell fetches the update check once per open, applies suppression, and renders the banner when an update is available.
**Files:** `frontend/components/Layout/AppShell.tsx`, `frontend/tests/update-notice-integration.test.tsx`
**Done when:** On mount AppShell calls `fetchUpdateCheck()` exactly once (FR9); the banner shows only when `updateAvailable` and `!isSuppressed(latest)` (FR3, FR7); Dismiss/Skip persist via Task 6 and hide the banner; nothing renders on web build or on check failure (FR1, FR8). Integration test passes.
**Depends on:** 5, 6, 7
**Estimate:** 2
**Notes:** Place the banner at the top of the shell, above the work area, so it doesn't displace the editor focus.

---

## Summary

- Total tasks: 8
- Total estimated effort: 15 story points
- Critical path: Tasks 2 → 3 → 4 → 5 → 8 (Task 8 also gates on 6 and 7, which run in parallel off Task 2 / standalone)
- Risks:
  - **Task 3** — highest uncertainty: GitHub asset naming for the platform-matched `downloadUrl`, fetch-timeout handling, and reading `package.json` version correctly under the Next.js standalone server.
  - **Task 1** — must be verified in a packaged build, not just `electron:dev`, since `app.isPackaged` changes the spawn path.
  - **Task 4** — the 24h in-memory cache assumes a single long-lived server process; correct for the Electron standalone server but would not hold if the route ever ran in a multi-instance web deployment (out of scope here).
