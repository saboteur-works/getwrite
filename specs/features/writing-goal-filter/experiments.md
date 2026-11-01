# Writing goal filter: experiments

## Task 28 (partial): core-level read cost, Node, 2026-11-01

Task 28 is not complete. This record covers only the shared server-side cores run in Node on one machine. It does not satisfy FR-39, which asks for web, desktop and a native device.

### What was run

- (a) Filtered total: `evaluateGoalFilteredTotal(projectRoot, evaluationTime)` in `frontend/src/lib/models/goal-filtered-total-core.ts`.
- (b) Filtered daily read: `getWritingLogAggregateCore(projectId, from, to)` in `frontend/src/lib/models/writing-log-core.ts`. `aggregateForRoot` is not exported, so the public core that calls it was used; the extra work is project-id validation and root resolution.
- Unfiltered comparison: the same two calls on a project of the same size with no `config.goalFilter`.
- Reference row (not a feature path): `readSidecar` called once for each of the N ids, to show what N bare sidecar reads cost on this machine.

### Method

- Generator and harness are throwaway and not committed (scratchpad `t28/measure.test.ts`, run with the repo's vitest under `NODE_OPTIONS=--expose-gc` and a config kept outside the repo). They run the repo's TypeScript sources directly.
- Each size builds two projects in a fresh temp dir (`GETWRITE_PROJECTS_DIR` pointed at it): one with `config.goalFilter = {op: eq, field: status, value: draft}` and `dailyWordGoal: 500`, one with no filter. The repo's `projects/`, `~/Documents/GetWrite` and the Electron user-data folder were not touched.
- Each project has N text resources: a `resources/<uuid>/` directory (no `content.txt`) and a `meta/resource-<uuid>.meta.json` sidecar with `type: text`, a `wordCount` and `userMetadata.status` alternating `draft`/`final`, so the filter matches N/2.
- One writing-log day file (`meta/writing-log/2026-10-31.json`), one word entry per resource with its `documentId`, N entries in total. The file was parsed with the repo's `WritingLogDayFileSchema` before measuring. The window was `2026-10-31T00:00:00.000Z` to `2026-11-01T00:00:00.000Z`.
- Sidecars and the day file were written with `fs.writeFile` and plain JSON, not the repo's writers. The repo's `appendWritingLogEntry` does not take a `documentId`, and 20,000 writes through the locked writer were not needed to produce valid files. The cores read them back through `readSidecar`, `loadProjectConfig` and the day-file schema without error.
- 7 runs per figure, in one process, one after another, so runs 2 to 7 follow run 1 with warm OS file cache and warm code. `first` is run 1.
- Wall time: `performance.now()` around the awaited call.
- Files read: `readFile`, `readdir`, `stat`, `lstat`, `access`, `open` and `realpath` on the `node:fs/promises` object, and the sync equivalents on `node:fs`, were wrapped for the run; a call counted only when its first argument was a string under the temp projects dir. "Reads" is the number of `fs.promises.readFile` calls; "distinct" is the number of different paths among them. Only `readFile` and one `readdir` (the `resources/` listing) occurred. No `stat`, `lstat`, `access`, `open` or sync call was seen. A read through any other API (streams, a file handle obtained elsewhere) would not be counted.
- Memory: RSS sampled every 2 ms during the call plus before and after, reported as the peak absolute RSS and the peak rise over the RSS at call start; heap delta is `heapUsed` after minus before the call, after `gc()` before each run, so it includes garbage not yet collected.

### Machine

Apple M4 Pro (12 cores, 8 performance and 4 efficiency), 24 GB, macOS (Darwin 25.5.0, arm64), local APFS SSD, Node v24.15.0, vitest 4.1.6. Run inside the Claude Code command sandbox, with other processes on the machine not controlled for.

### Results

Median and max wall time are over 7 runs, in milliseconds. "Reads" is `readFile` calls per run, "distinct" the different files among them.

| N resources | Operation | Median ms | Max ms | Run 1 ms | Reads (distinct) | Peak RSS MB | Max RSS rise MB | Heap delta MB, median (max) |
|---|---|---|---|---|---|---|---|---|
| 1,000 | (a) filtered total | 79.5 | 82.5 | 82.5 | 1,504 (1,003) | 109 | 1 | 5.3 (6.5) |
| 1,000 | (a) unfiltered baseline (no filter set) | 0.1 | 0.3 | 0.3 | 1 (1) | 109 | 0 | 0 (0) |
| 1,000 | (b) filtered daily read | 56.5 | 58.6 | 58.6 | 1,006 (1,004) | 115 | 3 | 2.6 (14.3) |
| 1,000 | (b) unfiltered baseline | 1.5 | 1.7 | 1.7 | 2 (2) | 115 | 0.2 | 2.6 (2.6) |
| 1,000 | reference: N `readSidecar` calls | 53.4 | 58.0 | 53.1 | 1,000 (1,000) | 115 | 0 | 10.8 (10.8) |
| 5,000 | (a) filtered total | 399.1 | 413.2 | 410.7 | 7,504 (5,003) | 195 | 34.3 | 14.5 (36.4) |
| 5,000 | (a) unfiltered baseline | 0.1 | 0.2 | 0.2 | 1 (1) | 194 | 0 | 0 (0) |
| 5,000 | (b) filtered daily read | 274.4 | 283.4 | 277.7 | 5,006 (5,004) | 212 | 16.4 | 20.2 (21.0) |
| 5,000 | (b) unfiltered baseline | 5.7 | 6.8 | 5.7 | 2 (2) | 211 | 1.7 | 12.1 (13.1) |
| 5,000 | reference: N `readSidecar` calls | 260.2 | 275.7 | 258.2 | 5,000 (5,000) | 210 | 0.6 | 3.7 (3.7) |
| 20,000 | (a) filtered total | 1,634.5 | 1,675.2 | 1,675.2 | 30,004 (20,003) | 278 | 4.5 | 34.7 (34.8) |
| 20,000 | (a) unfiltered baseline | 0.1 | 0.2 | 0.2 | 1 (1) | 276 | 0 | 0 (0) |
| 20,000 | (b) filtered daily read | 1,140.5 | 1,147.6 | 1,143.3 | 20,006 (20,004) | 285 | 8.4 | 33.6 (39.5) |
| 20,000 | (b) unfiltered baseline | 22.7 | 23.5 | 22.9 | 2 (2) | 285 | 7.6 | 48.1 (48.1) |
| 20,000 | reference: N `readSidecar` calls | 1,071.3 | 1,076.1 | 1,074.3 | 20,000 (20,000) | 279 | 1.8 | 13.5 (17.2) |

Results returned: filtered total 254,500 / 1,322,500 / 5,455,000 words (N = 1,000 / 5,000 / 20,000); filtered daily net 15,503 / 77,503 / 310,000 against unfiltered 31,503 / 157,505 / 630,003. Both filtered figures were about half of the unfiltered one, as expected for a half-matching filter.

Peak RSS is the high-water mark of the whole process, which kept growing across sizes (the sizes ran in one process, in ascending order), so the absolute RSS column is not a per-operation figure; the "rise" column is the per-call figure and is noisy (it is small when an earlier run already raised RSS). Heap delta is sensitive to when garbage collection ran; the max column varies run to run (for example 14.3 against a 2.6 median for the 1,000-resource daily read).

### Observations (measurements, not causes)

- Files read per filtered call: total 1.5 reads per resource (30,004 reads over 20,003 distinct files at N = 20,000); daily 1 read per resource (20,006 over 20,004 distinct). Both reads grow in step with N. The unfiltered calls read 1 and 2 files whatever N is.
- Wall time of both filtered operations grew about linearly with N between 1,000 and 20,000 (total: 79.5, 399.1, 1,634.5 ms; daily: 56.5, 274.4, 1,140.5 ms).
- The filtered daily read took about the same time as N bare `readSidecar` calls in this setup (1,140.5 against 1,071.3 ms at 20,000); the filtered total took about 1.5 times as long (1,634.5 ms).
- Nothing was timed against a limit. FR-39 promises none and none is asserted here. Whether 1.1 s to 1.6 s at 20,000 documents is acceptable on the writer's machine is not decided by this record.
- Why the total reads about 10,000 more files than the daily read at N = 20,000 was not tested. An experiment that would discriminate: count reads per caller (membership evaluation against the second pass over members) by recording the stack of each counted `readFile`.
- Why wall time per file is what it is was not tested. An experiment that would settle it: repeat the 20,000 run with the OS file cache cold (after a purge), and with the sidecars in a smaller number of larger files, and compare against the reference row.

### Not measured

- Web through HTTP (route, JSON serialisation, `withStorageContext`, browser fetch and render).
- The desktop app (Electron-bundled Next.js server, packaged build, window client).
- A native device (Capacitor filesystem on the Pixel 7 Pro; the code is shared but the I/O layer is different and was not run).
- Typing and autosave not blocking while a read runs. A Node script cannot show this: it needs the editor running with a filtered read in flight, and, for the server paths, a measurement of save latency during the read. No claim about it is made here.
- Project size on the owner's real data (resource count, sidecar size, day-file size). The generated sidecars are small (a few hundred bytes) and the day file is a single UTC day with one entry per resource, which may be smaller or larger than a real one.
- Cold-cache reads, a project with large `content.txt` files, backlinks or a mention index, or a stored `metadataSchema` with many fields, a filter other than a single `eq` on `status`, and concurrent writers.
- Peak memory of the full server process or the app; only the Node test process was observed.

Task 28 is not complete. No cache or index was added.

## FR-38: an older build reading a day file with `documentId` (Task 19)

Run 2026-11-01 by the pipeline lead. Script: `scripts/older-build.mjs`. Logs: `logs/older-build-*.txt`. Each build ran with a throwaway `--user-data-dir` and a `workspace.json` pointing at a throwaway projects folder, driven by Playwright. `~/Documents/GetWrite` kept the same modified time, the runs started with 7340 free, and each ended with its run folder removed. The packaged apps append to `~/Library/Logs/GetWrite/getwrite.log`.

Builds: the installed `/Applications/GetWrite.app` (reports 2.2.0, Developer ID signed), and a local unsigned packaged build reporting 2.3.0 as the stand-in for the 2.3.0 release. The stand-in holds the window-close fix (#319) and predates this feature; `git diff getwrite-v2.3.0 main -- frontend/src/lib/models/schemas.ts frontend/src/lib/models/writing-log.ts frontend/src/lib/models/writing-log-core.ts` prints nothing. The released 2.3.0 app itself was not run.

Method: create a project and document, type and save, quit. Add `documentId` to the day file's entries, as a newer build would. Reopen, read the footer and details window, type and save, read the files, restart, read again. `documentId` here was added by the script, not written by the feature's code.

| Observation | 2.2.0, today's day file | Stand-in, today's day file | Stand-in, day file 4 days old |
| --- | --- | --- | --- |
| Project and document open | yes | yes | yes |
| Footer and details window | "Today's count is unavailable" | "Today's count is unavailable" | normal figures |
| New text in `content.txt` and after restart | yes | yes | yes |
| Save status in the footer | "Saved · just now" | "Saved · just now" | "Saved · just now" |
| Message after the save | "Today's word count may be incomplete: this save couldn't be recorded." | same | none |
| New log entry | not added; the day file is unchanged | not added; the day file is unchanged | added to today's file |

Verdict against FR-38: the effect is limited to the log for days in today's window, and the writer's text still saves. The owner's condition is met, so the older-build behaviour is accepted and documented, and the tolerant-reader fallback isn't needed.

What is lost on the older build: while the affected file is in today's window, today's figure is unavailable and that build's saves add no log entries. A day file outside the window had no effect. Inferred, not run: because a local day can span two UTC day files (`writing-log-core.ts`), the effect could last for the local day and not one UTC day.
