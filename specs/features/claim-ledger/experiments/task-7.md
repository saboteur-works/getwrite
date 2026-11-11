# Task 7: create projects with the declared module entries (results)

## Changes

- `frontend/src/lib/models/project-creator.ts`: `ProjectTypeSpec` (the local interface) gains optional `modules?: Record<string, boolean>`. After `createProject(...)` and before the single `project.json` write, `createProjectFromType` sets `project.config.modules` to a copy of the declared entries when the spec declares at least one; for a spec with no `modules` or an empty one, no key is written.
- `frontend/tests/unit/project-type-modules-creation.test.ts` (new, 11 tests): `{ claims: true }` stored in memory and on disk with `isModuleEnabled` true; explicit `false` stored; no key for a type declaring nothing and for `{}`; unknown id stored as given; the stored object is a copy; no built-in static spec declares `modules`; `createProjectCore` (saved type, real resolver) applies it; `createProjectCore` on a type declaring nothing writes no key; `createProjectCoreNative` applies a static-registry spec's `modules` (the registry lookup is mocked for one id, since no built-in declares modules); `replaceSavedProjectType` and `createSavedProjectType` leave an existing project's `project.json` byte-identical.
- Not edited: `frontend/src/lib/models/project-types-static.ts`, `frontend/tests/unit/helpers/project-creator.ts`.

## Findings (measured or read)

- `normalizeProjectConfig` (`project.ts`) lists keys explicitly and does not carry `modules`; it already drops it from a `config` passed to `createProject`. So passing `modules` in the `config` argument would have been dropped silently. This was read from the source; the fix places the entries after `createProject`. `project.ts` is outside this task's Files and was not edited.
- Native static path: `createProjectCoreNative` calls `getStaticProjectType` and then the same `createProjectFromType`; `project-types-static.ts` validates each template with `validateProjectType`, which accepts `modules` since Task 6. No change to `project-types-static.ts` was needed (test above shows the native path applies it). Not run on a device or against the real native backend with a fake Capacitor filesystem.
- "No code path re-applies a type": the test exercises saved-type create and replace only. A grep for other callers of `createProjectFromType` found the project routes and importers (creation paths), not any edit path; that was a read, not a proof over all code.

## Order

The test file was written first. On its first run before the implementation, 7 of 11 tests failed. Two of those failures were my own test bug (project directory is the generated uuid, not `project.id`; fixed by using `rootPath`). I did not separately record which of the 7 were the missing-implementation failures; after the implementation all 11 pass.

## Commands run

- `pnpm exec vitest run --project node` on `project-creator`, `project-type-modules-creation`, `native-project-backend-static-create`, `core-import-graph`: 4 files, 39 tests, passed. An earlier run including `project-types.test.ts` passed 5 files, 58 tests.
- `pnpm typecheck` (frontend): run, no errors (after one fix of a type error in my first form of the assignment).
- `pnpm exec eslint` on the two touched files: run, clean. `prettier --check`: clean.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, no errors.
- `pnpm --filter getwrite-cli typecheck`: run, no errors.
- Not run: full `pnpm lint` and `pnpm test:ci`, any build, e2e.

## Not verified

- Hosted creation (`saving-unavailable` for writer-made types) was not re-tested here; it is existing behaviour of the resolver.
- Task 4's `claims` manifest entry: tests use `claims` only as a declared id and `sources` for the explicit-false check; they do not depend on the manifest entry.
