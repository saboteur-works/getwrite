# Task 5: Modules screen, claims switch (FR-3, FR-6)

Date: 2026-11-11.

## Changes
- `frontend/components/Modules/useEnabledModuleViews.ts`: `useModuleViews(registry = uiModuleRegistry)` takes an optional UI registry (default unchanged); doc comment now states the per-module default. Needed so the claims view can be tested before Task 25 registers its `UiModuleEntry`.
- `frontend/components/Modules/useModuleEnabled.ts`: doc comment only.
- `frontend/components/Modules/ModuleSwitchSection.tsx`: NOT changed. It maps over `MODULE_MANIFEST` and reads `useModuleEnabled`, which goes through `isModuleEnabled` (Task 3 default), so the claims switch already rendered off and saved only its own `moduleId`. Its header comment still says "A project with no `config.modules` entry shows the module on (OQ-13)"; left as is (stale for Claims, not edited).
- `frontend/tests/component/claims-module-switch.test.tsx` (new, 11 tests).

## Tests first
Written before the hook edit: 5 of 11 failed (the 5 `useModuleViews`/fake-shell cases using a fake registry, because the parameter did not exist and the real registry was used). The Modules-screen cases and `useModuleEnabled` cases passed before any source change (the Task 3/4 work already covered them). After the hook edit: all pass. Two failures along the way were test bugs (a missing redux Provider; `beforeEach` returning the mock, which vitest ran as teardown).

## Observed
- `pnpm exec vitest run` on claims-module-switch, work-area-view-gating, module-ui-registry, viewSwitcher: 4 files, 106 tests passed.
- `pnpm typecheck` (frontend): run, no errors.
- `pnpm exec eslint components/Modules tests/component/claims-module-switch.test.tsx`: 0 errors, 1 pre-existing warning (`UiSlotKind` unused, uiRegistry.ts:32, untouched).
- Electron/CLI typecheck: not run (nothing under `lib/models/` touched).

## Not verified
- Fallback of an open Claims tab is tested with a fake shell component applying the same predicate as `AppShell` (registered and not enabled -> leave); `AppShell` itself was not mounted with a claims view, since no claims `UiModuleEntry` exists until Task 25. Task 25 should add that case to `work-area-view-gating`.
- `tests/moduleSwitchSection.test.tsx` multiple `role="status"` matches: not touched (lead's). Each row renders an always-present empty `role="status"` live region; that is a reading of the markup, not changed here.
- Full suite, `next build`, device behaviour: not run.
