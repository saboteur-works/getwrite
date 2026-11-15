# Task 50: Documentation and the project type editor label

Date: 2026-11-15. Records Task 50's own results only. Checked by reading code and running the tests named; no running app, device or built output was used.

## Project type editor label

- Test: `frontend/tests/component/ProjectTypeEditorForm.test.tsx` (the Task 50 file path in `tasks.md`, `frontend/tests/ProjectTypeEditorForm.test.tsx`, does not exist; the file is under `tests/component/`). New test "labels each module by its manifest label: Citations for citations, the view labels unchanged".
- Failing first, before the one-line change in `ProjectTypeEditorForm.tsx`: 1 failed, 55 passed. `TestingLibraryElementError: Unable to find an accessible element with the role "group" and name "Citations module"`.
- Change: `label={`${entry.view?.label ?? entry.label ?? entry.id} module`}`. Three existing tests in the same file built the expected label from `entry.view?.label ?? entry.id` and would have expected "citations module"; their expression was updated to the same `view?.label ?? label ?? id`. After: 56 passed. The labels "Sources module", "Claims module" and the Narratives label are asserted unchanged by the new test.

## Handbook page: where each statement was checked (read code)

| Statement | Read |
| --- | --- |
| Project Settings > Modules > Enable Citations; off by default | `ModuleSwitchSection.tsx` label expression (Task 14 record), `manifest.ts` `defaultEnabled: false` |
| Sidebar "Citation fields" for a Source while the module is on; not tied to Sources switch | `CitationFieldsSection.tsx` |
| Reference types, fields per type, Add / Person / Organisation / Remove, 500 characters, 50 people, date formats, Save button and saved message | `CitationFieldsEditor.tsx`, `citations-types.ts` |
| Still-needs line text and the needs per type | `CitationFieldsSection.tsx` (`Still needs: ...`, `Nothing is missing for this style.`), `citations-required-details.ts` |
| The line follows the draft, the compile reads saved values | `onDraftChange` in the section; `citations-precheck-core.ts` reads stored fields |
| Android: fields section shows a fixed sentence | `CITATION_FIELDS_NATIVE_MESSAGE` |
| Switch, style choice, disabled reasons for txt, md, Android, Start Page without config | `CompilePreviewModal.tsx`, `StartPage.tsx` |
| Check before compile, dialog title, summary, per-Source lines, Proceed and Cancel, failed check offers Cancel only | `CompilePreviewModal.tsx`, `CitationCheckDialog.tsx` |
| A never-filled Source is listed as incomplete | `requiredDetailsCheck` (`fields === null` gives the union of the table's labels) |
| Marker `[citation incomplete: <name>]`, `unnamed Source` | `citations-incomplete.ts` |
| Bibliography heading "Bibliography", none when nothing is cited | `style-loader.ts`, `compile-core.ts` |
| PDF: note at the foot of the page of its number, reserved bottom space can grow the page count | `experiments/task-43.md` (tall-notes corpus 12 to 19 pages), `task-36.md`, `task-57.md` |
| DOCX: notes are footnotes; page placement left to the program | `experiments/task-36.md` (footnotes.xml, 24 of 24 references resolve; "page placement is left to Word and is not claimed") |
| A citation whose passage is not in the document fails the compile | `compile-core.ts` `unplacedError`, `task-43.md` |
| An interview is cited in its note, not listed in the bibliography, no warning | `task-43.md` "Not verified"; `tests/unit/citations-bibliography.test.ts` (one interview fixture with interviewee and date) |

## Left out of the handbook because it was not confirmed

- Android, paired-device, hosted-web and Word results: none claimed. `experiments/task-37.md` does not exist (Task 37 has not been run), so no OQ-8 or placement statement beyond Tasks 36, 43 and 57 is made.
- The text of the error a writer sees when the compile fails for a detached citation. `app/api/compile/{pdf,docx}/route.ts` map only `CitationsUnavailableError` (Task 43 record), so the core's message naming the citation is not claimed to reach the screen; the page says only that the compile fails and makes no file. That "no file is made" is read from the core throwing; no download flow was run.
- Page, paragraph and line locators and a timestamp in a note: the render test only shows a page locator passed to the engine; how the note prints them was not read from output here.
- The order of bibliography entries.
- The interview rule is from one fixture; an interview with every field filled in was not run.
- Behaviour with the module off but the switch left on in a request, and everything in Tasks 51 to 53.

## Developer docs, Code Map, glossary

Updated `docs/features/modules.md` (manifest now four entries, `label`, citations switchable and off by default, a Citations section), `docs/features/sources.md` (Citation fields), `docs/features/compile-export-defaults.md` (the Citations switch and the pre-run check), `frontend/CLAUDE.md` (a Citations at compile Code Map entry), `CLAUDE.md` (Module entry; new glossary entries Citation fields, Citations switch, Pre-run citation check). The handbook index lists the new page.

## Commands and results (from `frontend/`)

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/component/ProjectTypeEditorForm.test.tsx` (new test only, before the fix) | 1 failed, 55 passed |
| same, after the fix | 56 passed |
| `pnpm typecheck` | no errors |
| `pnpm lint` | 0 errors, 459 warnings (the same count Tasks 43 and 49 recorded) |
| `check-copy.sh` on `docs/user/handbook/write/citations.md` | No FAIL lines |
| `prettier --write` on the handbook page; `prettier --check` on the three feature docs | page reformatted; feature docs clean |

Not run: `pnpm test:ci` (whole suite), Electron and CLI typechecks (no file outside `frontend/components` and tests was changed in code).
