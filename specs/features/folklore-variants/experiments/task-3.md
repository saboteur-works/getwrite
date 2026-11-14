# Task 3: FR-1 (e): folder-sidecar read cost

Observed values only. No cause is stated.

## Environment

- node v24.15.0, darwin (Darwin 25.5.0), run inside the Claude Code Bash sandbox.
- Store read: the repo-root `projects/` of the owner's checkout (read-only; nothing written). 14 project directories.

## Largest project

- Chosen by the count of `folder.json` files under each project's `folders/` tree: `c02957ec-8ad1-480f-a5e9-62017ad1f525` has 41; the next largest has 13 (counted with `find <project> -name 'folder-*.meta.json' -o -name folder.json`, which also counts any folder sidecars, so that figure is an upper bound for the others; the probe's own count for the largest is 41).
- Top-level entries of `folders/`: 36 for this project, at most 8 for any other.

## Number of folders

41 (every `folder.json` under `folders/`, nested included, read by the probe).

## Command

Probe at `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/f23d67b0-4986-41c8-9d32-176755fd0f75/scratchpad/task3-probe.ts` (scratchpad, not in the repo). It walks `folders/`, collects each folder id from `folder.json`, then calls `getFolderMetadataCore(projectId, folderId)` (`frontend/src/lib/models/folder-metadata-core.ts`, which calls `readFolderSidecar`) for all 41 ids at once with `Promise.allSettled`, five times in one process, timing each pass with `performance.now()`.

```
esbuild task3-probe.ts --bundle --platform=node --format=esm --outfile=task3-probe.mjs
GETWRITE_PROJECTS_DIR=<repo>/projects node task3-probe.mjs c02957ec-8ad1-480f-a5e9-62017ad1f525
```

This is an equivalent probe through `folder-metadata-core.ts`, not the `useFolderRowMetadata` path (no HTTP route, no browser, no Redux).

## Result

```
{"folders":41,"failed":0,"runsMs":[1.28,0.86,0.77,0.55,0.55]}
```

Elapsed per pass over 41 folders, in milliseconds: 1.28, 0.86, 0.77, 0.55, 0.55. Reads that failed: 0.

## What this does and does not show

- `meta/` of this project holds 0 `folder-*.meta.json` files (`ls meta | grep -c '^folder-'` returned 0). Every one of the 41 reads therefore took the absent-file branch of `readFolderSidecar` (ENOENT, returned as an empty value) and none parsed a sidecar. The figures are the cost of 41 absent-file reads, not of 41 stored sidecars.
- The passes after the first are concurrent warm-cache reads; the first pass (1.28 ms) is the closest to cold, and the OS file cache was not cleared, so a cold-disk figure is not measured.
- Not measured: reads of existing folder sidecars (none exist in this project); a project with more than 41 folders (none available); the HTTP route and `useFolderRowMetadata`; Android native storage; a paired device; a hosted tenant.
