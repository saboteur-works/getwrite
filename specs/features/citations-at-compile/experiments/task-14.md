# Task 14: FR-3 (b) after

Date: 2026-11-14. Values below come from the tests named, run from `frontend/` with `pnpm exec vitest run`. Compare with the "before" in `task-10.md` (b).

## Label and messages after the change

`ModuleSwitchSection.tsx` computes `module.view?.label ?? module.label ?? module.id`. Pinned by `tests/moduleSwitchSection.test.tsx`:

| Entry | Switch label | Status message after a click |
|---|---|---|
| `citations` (real manifest: no `view`, `label: "Citations"`) | `Enable Citations` | `Citations is now on.` |
| a view (`view.label` "From view", `label` "Ignored") | `Enable From view` | `From view is now off.` |
| only a `label` ("From label") | `Enable From label` | `From label is now off.` |
| neither (id `x-mod`) | `Enable x-mod` | `x-mod is now off.` |

Before (Task 10): the same `citations` entry read `Enable citations` and `citations is now on.`. The failed message uses the same `label` (`Could not turn <label> on: ...`); it is not separately pinned by a new test.

The "off"/"on" in the three fixture rows is the toggle result: a module id not in the manifest reads on, so the click turns it off.

## Switch behaviour observed in tests

- With no `config.modules` entry the Citations switch is unchecked and the store's modules stay `undefined` until a click.
- One click calls `setModuleEnabled` once with `{ projectId, moduleId: "citations", enabled: true }`; the store then holds only `{ citations: true }`.
- With `{ sources: false, citations: true }` the Citations switch is checked and the Sources switch is not; `isModuleEnabled({ modules: { sources: false, citations: true } }, "citations")` is true (`module-registry.test.ts`).
- The registry lists no `citations` view, `enabledViews` omits it with it on, and `indexSteps` stays empty.
- Project type draft: `moduleStatesOf` returns `citations: "not-set"` beside `claims` (`project-type-draft-service.test.ts`, `-hook.test.tsx`).

## Not changed, for the owner

`components/project-types/ProjectTypeEditorForm.tsx:708` builds its control label as `` `${entry.view?.label ?? entry.id} module` ``. It is not in Task 14's Files, so the project type editor still reads `citations module` (lower case), not `Citations module`. Not run: a rendered check of that form.

## Not run

No browser run of the Modules screen; the values above are jsdom test output.
