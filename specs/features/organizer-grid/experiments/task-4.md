# Task 4: measurement fixture generator

Results of running `scripts/organizer-grid-fixture/generate.mjs`. No timing is claimed or recorded. Generated projects were written to the session scratchpad, not the repo.

## Generator runs (observed)

Command: `node scripts/organizer-grid-fixture/generate.mjs --count <N> --out <scratchpad>/fx-<N>` (default seed 109).

| N | Folders written | Cards with status | Cards with subtype | Cards with genre (select) | Cards with themes (multiselect) |
| --- | --- | --- | --- | --- | --- |
| 100 | 4 | 87 | 91 | 100 | 100 |
| 500 | 20 | 447 | 454 | 500 | 500 |
| 2000 | 80 | 1789 | 1803 | 2000 | 2000 |

`--count 0` exits 1 with `--count must be an integer from 1 to 100000, got "0"`.

## Loader check (observed)

A throwaway vitest probe (written to `frontend/tests/`, run, then deleted; `git status` clean of it afterwards) set `GETWRITE_PROJECTS_DIR` to each scratch directory and called `loadProjectCore(<projectId>)`, the repository's own project open path, then re-read the files from disk and parsed them: `ProjectSchema` on the loaded project, `FolderSchema` on each loaded folder, `AnyResourceSchema` on each resource sidecar, `FolderSidecarSchema` on each folder sidecar. All three runs passed with no parse error.

| N | Loaded resources | Loaded folders | Folder sidecars parsed | Non-empty plaintext | Status / subtype / select / multiselect counted from sidecars on disk | Initial-revision repair log calls | `console.warn` calls |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 100 | 4 | 4 | 100 | 87 / 91 / 100 / 100 | 0 | 0 |
| 500 | 500 | 20 | 20 | 500 | 447 / 454 / 500 / 500 | 0 | 0 |
| 2000 | 2000 | 80 | 80 | 2000 | 1789 / 1803 / 2000 / 2000 | 0 | 0 |

The counts match the generator output.

## Not done

- Import of a generated project onto the Pixel 7 Pro and the card-count and excerpt-read-cost measurements: Task 42 (lead-run). Not run here.
- The Electron and native (Capacitor) project paths were not exercised; only `loadProjectCore` under Node.
