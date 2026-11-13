# Task 2: FR-1 (b) and (c) results

Environment: worktree branch `worktree-agent-adfbda678a92a5da9`, vitest 4.1.6, date 2026-11-13. Tests: `frontend/tests/unit/folklore-option-migration.test.ts` (6 tests), `frontend/tests/unit/folklore-exact-tag-query.test.ts` (8 tests, including the picker component test, run in jsdom through a docblock because the declared file is a `.ts` file). Command: `pnpm --filter getwrite-frontend exec vitest run <both files>`; 14 passed.

Order note: the tests were written after reading the code and passed on their first run; none was shown failing first, because they pin behaviour that already exists.

## (b) `updateFieldOptionsWithMigration` on a Source tagged with two options of a multiselect

Setup: multiselect `tale-type`, options `[A, B, C]` with A = "ATU 510A | Cinderella", B = "ATU 510B | Peau d'Ane", C = "ATU 333 | Little Red Riding Hood". Source sidecar `userMetadata["tale-type"]` = `[A, B]`. "Shows its tag" is defined here as: the stored string is a member of the field's options after the call.

| Path | New options | Stored value after (observed) | Tag A shows | Tag B shows |
|---|---|---|---|---|
| Rename: remove A, add "ATU 510A | Cinderella (Perrault)" (normalize A to it) | `[renamed, B, C]` | `[renamed, B]` | yes (renamed) | yes |
| Removal, "clear" | `[B, C]` | `[B]` | no (dropped from the stored value) | yes |
| Removal, default "add-to-options" | `[B, C, A]` (A appended) | `[A, B]` | yes | yes |
| Removal, "keep" | `[B, C]` | `[A, B]` | no (stored, not an option) | yes |
| Removal, no migration entry | `[B, C]` | `[A, B]` | no (stored, not an option) | yes |
| "clear" on a Source whose only tag is A | `[B, C]` | key `tale-type` absent | no | n/a |

Measured, not explained: under "keep" and with no entry the stored string survives while it is no longer in the options list.

## (c) Exact `in` query on a multiselect tag

Corpus of four Sources; tags A with B, a comma name ("Cinderella, or the Little Glass Slipper"), a double-quote name (`The "Glass" Slipper`), and another tale.

- `in` with `[A]` and with the plain string A (" | " separator): returns the one Source tagged A.
- `in` with the comma name: returns that Source only.
- `in` with the double-quote name: returns that Source only.
- `in` with "ATU 510A", "ATU 510A |" and "Cinderella": returns nothing (no prefix or partial match).
- `in` with `[A, quote name]`: returns both Sources.
- Query builder value picker (`ValuePicker`, `fieldType` multiselect, operator "includes", which renders `SelectPickerInput`): on change to each of A, the comma name and the double-quote name, `onChange` is called once with the whole string unchanged.

## query-evaluator.ts / query builder change needed

No. No test showed a change to `query-evaluator.ts` or the query builder to be needed; neither was edited.

## Typechecks

`pnpm typecheck` (frontend), `pnpm --filter getwrite-electron typecheck` (both tsc passes) and `pnpm --filter getwrite-cli typecheck`: no errors reported (the electron and cli runs were done before one import fix in a test file, and the electron and cli programs do not include `frontend/tests/`).
