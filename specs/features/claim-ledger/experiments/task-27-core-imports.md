# Task 27 corrective: claim cores import graph

Method: a throwaway source-level walker (same specifier regexes and resolution as
`frontend/tests/unit/core-import-graph.test.ts`; type-only imports not followed),
run from each of `claims-add-core.ts`, `claims-update-core.ts`, `claims-list-core.ts`.
Flags react/react-dom, `.tsx`/`.jsx`/`.json` files, `components/Modules/` and, for the
entry file only, its own `node:*` imports. The walker lived in the session scratchpad
and was never added to the repo.

## Before

| core | files reached | own node:* | JSON / react / UI registry reached |
|---|---|---|---|
| claims-add-core | 92 | none | six bundled project-type JSON files, via `project-types-static.ts` |
| claims-update-core | 92 | none | same six |
| claims-list-core | 90 | `node:path` | same six |

Measured paths: each core imported `InvalidProjectIdCoreError` from
`./project-crud-core` (which value-imports `project-types-static`). `annotations-core.ts`
(imported by add and update) did the same, so changing only the three cores left add and
update reaching the JSON (measured by re-walking after the first swap).

## Change

- `claims-add-core.ts`, `claims-update-core.ts`, `claims-list-core.ts`,
  `annotations-core.ts`: `InvalidProjectIdCoreError` now imported from
  `./project-id-core-error`. `project-crud-core.ts` already imports the class from that
  module and re-exports it (`export { InvalidProjectIdCoreError }`), so there is one
  class and `instanceof` holds. `app/api/claims/route.ts` imports it from a re-export
  and its `instanceof` mapping is unchanged.
- `claims-list-core.ts`: removed `import path from "node:path"`; the project.json read
  uses `` `${projectRoot}/${PROJECT_FILENAME}` ``. No existing adapter-based core had a
  path-join helper without node:path (they each import node:path), so none was reused.
  Forward slash is accepted by Node on Windows and by the Android adapter; not verified
  on Windows here.
- Scope note: `annotations-core.ts` was outside the three named files; it was the
  second route to the JSON.

## After

| core | files reached | own node:* | JSON / react / UI registry reached |
|---|---|---|---|
| claims-add-core | 70 | none | none |
| claims-update-core | 70 | none | none |
| claims-list-core | 68 | none | none |

## Commands (from `frontend/` unless noted)

- `pnpm typecheck`: pass
- `pnpm exec vitest run` on claims-add-core, claims-update-core, claims-list-core,
  claims-route, core-import-graph, annotations-core, native-claims-backend tests: 7 files,
  123 tests passed
- `pnpm exec eslint` on the four touched files: no output
- `pnpm --filter getwrite-electron typecheck` (incl. worker tsconfig): pass
- `pnpm --filter getwrite-cli typecheck`: pass
