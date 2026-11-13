# Task 5: module declaration, view slot and switch

Results of this task only.

- Manifest: `folklore` entry, `defaultEnabled: false`, `indexSteps: []`, view `{ id: "folklore", label: "Narratives" }`, built from the Task 4 constants.
- UI registry: one `view` slot (BookOpen icon) rendering `components/Folklore/NarrativesView.tsx`, a placeholder `<section>` with heading "Narratives". No new slot kind.
- `ViewName` gains `"folklore"`.
- `AppShell.tsx`: `view === "folklore"` added to the two module-view conditions (outer render guard and the registry lookup). Measured by test: with the module on, the Work Area shows the "Narratives" heading and no "Work Area" heading, for no selection, a text and a folder.
- Switch: the existing `ModuleSwitchSection` lists it from the manifest with no code change; "Enable Narratives" reads off with no entry and one click writes only `{ moduleId: "folklore", enabled: true }`. Nothing writes an entry automatically.
- Existing test edited: the Claims id-list assertion in `module-ui-registry.test.tsx` now checks the first three ids, since a fourth view is registered.
- Project Types editor: the draft is manifest-driven, so it now lists Narratives with state `not-set` by default, like Claims (owner decision, Gate 5). Measured before the fix: 5 tests failed in `project-type-draft-service.test.ts` (3, "module declaration in the draft") and `project-type-draft-service-hook.test.tsx` (2), because they pinned the states to exactly `{sources, claims}`. Fix: the expected objects and the `Object.keys` expectation now include `folklore: "not-set"`. No production code changed to hide folklore. After the fix both files pass (74 tests).
