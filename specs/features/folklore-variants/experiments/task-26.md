# Task 26: Documentation results

Environment: worktree branch `worktree-agent-a9515e953dc86e884` at commit 8b140f8e, date 2026-11-13. Documentation only: no code, test or dependency was changed.

## Files written

- `docs/user/handbook/views/narratives.md` (new), linked from `docs/user/handbook/index.md`.
- `docs/features/modules.md`, `docs/features/sources.md`, `docs/features/folder-metadata.md`.
- `frontend/CLAUDE.md` (Code Map) and `CLAUDE.md` (glossary: Narrative / Variant, Narratives tab, Comparison; module list names `folklore` as switchable and off by default).

## Source of each statement

- Set-up steps, field settings, tab states and strings: read from `components/Folklore/*`, `src/lib/models/folklore-*.ts`, `manifest.ts` and `OptionsRemovalPreview.tsx` at the commit above. A statement taken from reading code is a reading, not a run.
- Tag behaviour under rename and removal: the stored values `experiments/task-2.md` observed, section (b), in unit tests of `updateFieldOptionsWithMigration`. The handbook page says they were observed in unit tests and not in a running app. The dialog's labels (Remap, Remove value, Keep option) were matched to the tested migration choices by reading the dialog source, not by a run of the dialog.
- Exact-tag query: `experiments/task-2.md`, section (c).
- A removed subtype label keeps its stored value: the existing handbook `story/metadata.md` observation and `experiments/task-1.md` (d) (a reading for the module's own matching).

## Not stated on purpose

- No column limit (`COMPARISON_COLUMN_LIMIT` is `null`; the long-text run is lead-run).
- No Android, paired-device, phone-device, screen-reader or large-narrative result; no built-in set-up path.
- The 768 px message is stated as the text the code shows below that width, not as an observed result on a device.

## Checks

See the report returned to the orchestrator for the commands run and results.
