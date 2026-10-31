# Feature Spec: Two-client save behaviour (measurement)

> **Scope note:** this is larger than the 500-word guideline for a feature
> spec, as the Feature 75 to 80 specs it follows are. No product code is
> expected to change; the weight is in the definition of the claim and in the
> method. Source: Feature 78 (and 79, which depends on it) in
> `specs/product/getwrite.features.md`; FR-66, US-27, OQ-67, OQ-68, OQ-74 and the
> carried default in `specs/product/getwrite.md`; the merged sibling specs
> `specs/features/home-network-sharing.md`, `paired-device-limits.md` and
> `desktop-server-port.md` for conventions and process-safety rules; and the
> save path as read in the code (below). Home-network sharing (Features 75, 76,
> 77, 80) is merged to `main` and not released; the desktop server listens on
> port 7340. Released in 2.3.0 (2026-10-30).
>
> **Gate 0 decision (Owner decision, Gate 0, 2026-10-11), settled and not
> reopened:** this feature is a MEASUREMENT of what happens when two of the
> writer's own devices save the same resource. It changes no product behaviour
> and adds no in-product statement (that is Feature 79, decided after this
> result). The measurement has two required parts: (1) scripted runs with two
> real browser clients (Playwright Chromium) for exact, repeatable sequences and
> timings; (2) the owner's Android phone in Chrome as the real second device,
> an owner step an implementor cannot do. Standing rules kept from Features 75
> to 80: the final suites include `pnpm test:e2e`; tasks are tracked in POS (the
> lead adds the `**POS:**` lines); builds and running apps happen in the main
> checkout, one task at a time; working-copy strings are reviewed in one later
> copy pass; a measurement is a fact and a cause is a hypothesis.
>
> **Provenance labels.** **Read, not run** means read in code or a file, cited
> by file and function, and not executed; every code fact below is read, not
> run, unless it says otherwise (line numbers were not recorded). **Measured**
> means a recorded run; nothing in this document was run by its author.
> **Hypothesis** marks a cause or a prediction no experiment has discriminated.
> **Unverified** means not established; the check that would settle it is
> named. No claim here goes beyond what a check shows.
>
> **Gate 3 decisions (Owner decision, Gate 3, 2026-10-11; the owner answered
> "I'll take your recs" to the lead's presentation), folded in below and listed
> under "Resolved questions".** "Last save wins" is defined as last PROCESSED by
> the server, whole document, all four stores (FR-1). Core scripted scenarios are
> S1 to S5; S9 is cut; S6, S7, S8 and S10 are held until after the stop. The
> other behaviours (stale editor replacing text, saves without typing, whether
> the overwritten device is told, recoverability, writing-log effect, failed
> saves) are reported as findings beside the verdict, not as pass or fail
> (FR-33).
>
> **What this document still does not decide.** What to do about the result
> (state the promise, change the save path, change the promise, or ship without
> the statement) is the owner's decision after the measurement, per the carried
> default; this document must not pre-decide it. A FAIL of FR-66's prerequisite
> triggers that decision and does not make it.

## Overview

FR-66 says that when two of a writer's devices save the same resource the
product's promise is that the last save wins, and that a two-client save test
demonstrating this must pass before the promise is treated as met. Nobody has
run two clients against one resource; a keyword search found no conflict check,
and reading the save path (below) confirms none is sent or checked, so what
actually happens is unmeasured. This feature runs two clients (two paired
browsers, the desktop window plus a browser, and the owner's real Android phone
in Chrome) against one resource through the real save path, defines in advance
what the claim means so the result can pass or fail, and records exactly what
the server holds, what each open editor shows, what each writer is told, and
what else the save touches. It fixes nothing and states nothing to the writer.

## Goals

- The claim "last save wins" is defined precisely enough to pass or fail, by the owner, before any scenario is run.
- For every scenario, six distinct outcomes are recorded as observations: server state, each editor's display, notification, a stale editor's later overwrite, side effects (revisions, writing log, index, word counts), and failed saves.
- The save path's conflict handling, write contents and serialisation are established by reading, and each reading is then checked against a run.
- The owner's phone supplies a real second device and a real mobile browser, with a procedure whose result is recorded without the pipeline observing it.
- The owner receives a result, with counts and limits stated, and a stop, before any decision about Feature 79 or the save path.

## Non-goals

- Fixing, changing or adding anything in the save path, the editor or the sharing UI; defects found are recorded and reported (FR-28).
- Any in-product statement about what happens when two devices save (Feature 79).
- Two different people editing; accounts or per-person permissions (FR-66 is one writer on their own devices).
- The product spec's FR-32 conflict model for hosted sync, which is separate and unaffected (OQ-68).
- The Android app as a client (OQ-74); the phone here is a Chrome browser.
- Tuning autosave, adding conflict detection, merging, or live sync between open clients.
- Rewording working-copy strings.

## User stories

- US-1: As a writer who keeps the same resource open on my desktop and my phone, I want to know exactly what the product does when both save so that I can decide whether to trust it with my work.
- US-2: As a maintainer who owns the last-save-wins promise in FR-66, I want to have the claim defined and then tested with two real clients so that the promise is stated only if it is true.
- US-3: As a maintainer who owns the promise, I want to have a real phone in Chrome used as the second device, with a procedure I can follow and report from, so that the result is not only desktop-host scripts.
- US-4: As a maintainer who owns the promise, I want to receive the measurement with its counts, limits and a not-run list, and then decide what to do about it so that no outcome is chosen for me.
- US-5: As a maintainer, I want to have the throwaway setup, process-safety and no-behaviour-change checks recorded so that the measurement cannot harm the owner's data or running app and the suites show it changed nothing.

## Functional requirements

FR-1: Before any scenario is run, the definition of the claim MUST be written at the top of `specs/features/two-client-save-measurement/experiments.md`, as the definition and in these terms (Owner decision, Gate 3, 2026-10-11, OQ-1 option b). "Last" means the last save PROCESSED by the server, not the last typed and not the last sent. "Wins" means: after the server is quiet, all four stores (the canonical revision's `content.bin`, `resources/<id>/content.tiptap.json`, `resources/<id>/content.txt`, and the sidecar's `wordCount` and `updatedAt` consistent with that document) hold exactly the whole document of the last-processed client, parseable and never a mix or interleaving of two clients' documents, and both clients show that document after a reload. A scenario PASSES only if all of that holds; any store holding another document, a mix, an unparseable file or a sidecar inconsistent with the content is a FAIL. How "last processed" is determined MUST be written beside the definition: it is taken from recorded evidence, in this order of use, the order of the server-assigned timestamps (sidecar `updatedAt` in each save's response, and the writing-log entry timestamps), the order in which the responses were received by the clients, and the clients' send times; the limits MUST be stated (timestamps have finite resolution, two overlapping requests can be assigned timestamps in a different order from the order their writes land on disk, response order at a client is not processing order, and on one host all scripted clients share one clock while the phone's clock is not assumed to match). Where the evidence does not order two saves, the scenario's verdict MUST be stated as "order not determined" with the stores' contents, and counts as unstable (FR-20), never as a pass. Every scenario's result MUST be stated as pass, fail or unstable against this definition and also as the raw observation. [US-2]

FR-2: Outcome 1, server state. After every scenario, once the server is quiet (no request in flight and the index queue drained, with the wait recorded), the run MUST read and record, for the resource: the canonical revision's `revisions/<id>/v-N/content.bin` (and a list of every `v-*` directory with its `metadata.json`), `resources/<id>/content.tiptap.json`, `resources/<id>/content.txt`, and the sidecar `meta/resource-<id>.meta.json` keys `updatedAt`, `wordCount` and `name`. For each it MUST record whether it equals client A's whole document, client B's whole document, the base document, or none of them (and then the bytes and a diff). It MUST state whether all four agree with each other. [US-1] [US-2]

FR-3: Outcome 2, each open editor. For each client, the run MUST record the text its open editor shows (a) immediately after the other client's save was acknowledged, with no reload, (b) after a fixed wait with no reload (the wait recorded, at least 30 s), and (c) after a reload. Recorded as the editor's text content plus its footer status text, verbatim. [US-1]

FR-4: Outcome 3, notification. For each client, the run MUST record every toast, alert, dialog, status or footer text, console error and failed request that appears from the moment the other client saved until the end of the scenario, verbatim, or state that there was none and what was looked at. It MUST NOT state that a client "was told nothing" without naming the surfaces checked. Whether the overwritten client was told is a finding (FR-33) and is not part of pass or fail (Owner decision, Gate 3, 2026-10-11, OQ-3). [US-1]

FR-5: Outcome 4, the lost-update shape. In every scenario with a stale open editor, the run MUST record whether that editor's next autosave writes its older copy over the other client's newer text, how that is established (server state per FR-2), and whether it did so only after the writer typed or without the writer typing anything. For the idle case (FR-13) it MUST record the idle duration and whether idleness alone produced any request. [US-1] [US-2]

FR-6: Outcome 5, side effects. For every scenario the run MUST record: the revisions created (count, name, `automaticSnapshot` flag, canonical flag); the writing-log entries for the UTC day (each entry's `added`, `deleted`, `skipped`/`source` and timestamp) with the expected entries computed independently from the documents (a canonical save logs a word-bag diff of the incoming document against whatever the canonical revision held when the save was processed, read, not run), and whether the log counted the other device's words as deleted or the stale copy's words as added; the search index (a full-text search for a token unique to each client's text, before and after); the sidecar `wordCount` against the word count of the stored document; and whether the entity mention index and diagnostics index match the stored plain text. [US-1]

FR-7: Outcome 6, failed saves. For every scenario the run MUST record every non-2xx response to a save (status and body), what the client showed for it, and whether the failed document was retained (the client's `failedSaveDoc` and retry control, read, not run) and whether a retry produced the result a writer would expect. A scenario with no failed save MUST say so. [US-1]

FR-8: Every observation MUST be recorded separately from its interpretation. Each result row MUST carry the scenario, the clients, the sequence with times, the observed outcomes 1 to 6, the pass, fail or unstable verdict against the FR-1 definition, and the stated cause only if an experiment discriminated it, otherwise labelled hypothesis. Findings (FR-33) carry the raw observation and no verdict. [US-4]

FR-9: Timing. Each save request MUST be recorded with the client's send time, the client's response time, the status, and, as server-side order evidence, the sidecar `updatedAt` and writing-log entry timestamps the server assigned (read, not run: both come from the server's clock at processing time). For near-simultaneous runs the script MUST record the measured gap between the two requests' send times and the order of the server timestamps, and MUST NOT call a pair "simultaneous" without the gap. Scripted clients on one host share one clock; the phone's clock is not assumed to match and the phone run is ordered by the owner's report and the server timestamps only. [US-2]

FR-10: Scenario S1, in turn (core). Both clients open the same resource. A types, waits for "saved", waits longer than the autosave delay (read, not run: `useCanonicalAutosave.ts` debounces 2500 ms), then B types without a reload, then A types again without a reload. The run MUST record outcomes 1 to 6 after each step. This is the sequence that shows whether the second client's editor holds the first client's text at all. [US-1] [US-2]

FR-11: Scenario S2, near-simultaneous (core). Both clients type at the same moment so their debounced saves fire as close together as the script can get; the run MUST record the send-time gap per repetition, vary the gap on purpose (for example 0, 50, 250, 1000 ms, including the smallest the harness can produce) and say which values were achieved, with 20 repetitions per gap variant (FR-20). The documents MUST be of different lengths in at least one variant (read, not run: the content file is written with a plain `writeFile`, so two overlapping writes of different lengths could in principle leave bytes of both in one file; this is a hypothesis to be tested, not a finding). [US-2]

FR-12: Scenario S3, stale client never reloads (core). A opens; B opens, types and saves; A, without reload, types and saves. Then the reverse roles. The run MUST record whether A's save contains B's text, whether B's text survives anywhere (including an "Auto-backup before large deletion" revision; read, not run: written when a save would remove at least ten words and most of the document), and what A's editor shows. [US-1] [US-2]

FR-13: Scenario S4, idle then resume (core). A opens and is left idle while B edits and saves; A is then touched without typing (click, focus, scroll), then A types one character. Idle durations (Owner decision, Gate 3, 2026-10-11, OQ-4): scripted 60 s (repeated per FR-20), one scripted 10-minute run, and 5 minutes on the owner's phone (the phone step, step 4). A 60-minute idle is not run. The run MUST record whether any request is sent without typing (on resume, focus or visibility change), and what A's save writes. [US-1]

FR-14: Scenario S5, different resources, same project (control, core). A edits resource R1 and B edits resource R2 at the same time, including S2's near-simultaneous timing. The run MUST show each resource holds exactly its own client's document and that no other file of either resource changed, so any interference in S1 to S4 can be told apart from interference between resources. [US-2]

FR-15: Scenario S6, sidecar and content from two clients (context; HELD until after the stop and run only at the owner's request, Owner decision, Gate 3, 2026-10-11; holding it leaves unmeasured whether a sidecar save and a content save from two clients drop each other's keys). A edits sidecar metadata of resource R (for example the status or `entityKind`, which the CLAUDE.md glossary records as dropped from a second sidecar payload in a unit test, cause not established) while B types and saves content of R; then the reverse; then both set different keys; then both set the same key. The run MUST record the final sidecar keys, `updatedAt` and `wordCount`, and whether either client's change was dropped. [US-1]

FR-16: Scenario S7, rename and delete versus edit (context; HELD until after the stop and run only at the owner's request, Owner decision, Gate 3, 2026-10-11; holding it leaves unmeasured what a client editing a resource that the other client renamed or soft-deleted is told and whether its text survives). A renames R (and in a second run soft-deletes R) while B has R open and types. The run MUST record B's request outcome, B's editor, the files present, the Trash content, and whether B's text survives anywhere. It MUST also run delete with B idle and then typing. [US-1]

FR-17: Scenario S8, offline or slow then reconnect (context, if feasible; HELD until after the stop and run only at the owner's request, Owner decision, Gate 3, 2026-10-11; holding it leaves unmeasured whether a document queued while offline overwrites a newer one on reconnect, other than what the phone step's background case shows on one phone). B is set offline (Playwright's context offline switch) or slowed, types, A saves, B reconnects. The run MUST record what B sends, in what order, and whether B's queued document overwrites A's; if the browser tooling cannot reproduce it, the run MUST say so under the not-run list. [US-1]

FR-18: Scenario S9, the desktop window as a client (CUT from the scripts, Owner decision, Gate 3, 2026-10-11, OQ-2). It is not run as a scripted scenario. What the cut leaves unmeasured: the desktop window as a scripted client in S1, S2 and S3 timing, and the real Electron shell's behaviour in those sequences. Why it is acceptable: the PATCH path is the same server code for the window and a browser (read, not run), and the owner's phone step uses the desktop window plus the phone, so the window is exercised as a client there once. The result MUST state that S9 was not run. [US-1]

FR-19: Scenario S10, encrypted versus plain (context; HELD until after the stop and run only at the owner's request, Owner decision, Gate 3, 2026-10-11; holding it leaves unmeasured whether any outcome differs on an encrypted project). Read, not run: the revision PATCH handler is the same code for an encrypted and a plain project, the difference being the storage adapter chosen per path (`workspace-adapter.ts`, `encryptingAdapter.ts`). If run, S2 and S3 MUST be run once on a throwaway encrypted project (throwaway passphrase held in memory, never printed) and compared with the plain run; the run MUST record whether any outcome differs. [US-1]

FR-20: Repetition. Each scenario MUST be repeated enough times to say whether the outcome is stable; the count MUST be stated per scenario, with every repetition's result recorded, not only a summary. Counts (Owner decision, Gate 3, 2026-10-11, OQ-6): 3 repetitions for each sequential scenario (S1, S3, S4, S5), and 20 repetitions per gap variant for S2. "Stable" means every repetition agrees. The result MUST state that 20 clean repetitions bound a failure rate at roughly 14% (rule of three, 95% confidence) and are not proof that it is zero, and that 3 repetitions bound it far more loosely. The phone step is one run; its stability is not assessable and MUST be stated so. A scenario whose outcome varies between repetitions MUST be reported as unstable with its distribution, not as a pass or a fail. Each result MUST state what was and was not varied (document lengths, timing gap, order of clients, idle duration, project type, client type). [US-2] [US-4]

FR-21: Method, isolation. Every run MUST use a throwaway projects folder and a throwaway user-data folder under `$TMPDIR` with the paths asserted before anything starts; the owner's real folders (`~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron`) MUST never be read or written. The packaged app writes logs under the last of these, so the real app MUST be run only in the forms Feature 80 used (development copied-tree or unpacked, with a throwaway `--user-data-dir` and projects folder) and the run MUST record which mechanism kept the app off the real log folder. [US-5]

FR-22: Method, which server. Every scripted scenario MUST use the built standalone server started by script with environment (as Feature 80's Task 15 did), on a free port the script picks, with a throwaway sharing directory and projects folder and the port checked first (Owner decision, Gate 3, 2026-10-11, OQ-7); any run that needs port 7340 MUST first check it for a listener and refuse to run if one exists. The real desktop app MUST be used only for the owner's phone step (FR-26), as it needs the pairing code the app shows. Every result MUST say which server it came from. [US-5]

FR-23: Method, process safety. Every task that starts a server or app MUST check each port it uses for a listener first (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) and refuse to run if one exists, record the pids it started, stop only those pids (never by port, never by name), confirm they exited, and confirm afterwards that no listener remains on its ports. [US-5]

FR-24: Method, secrets. No credential, cookie, pairing code, window secret or passphrase MUST be printed, logged or written to a recorded file. The phone's pairing code is shown only in the desktop window, to the owner. [US-5]

FR-25: Method, labelling. A request sent from the host to its own LAN address MUST be labelled as a host-to-itself request and not a second-device result (the Feature 80 record states every scripted browser request came from the host to its own LAN address). Only the phone step is a second-device result. Every code fact in the experiments record MUST be labelled "read, not run". The two-clients record's earlier observations (below) MUST be cited with their limits and not restated as findings. [US-4] [US-5]

FR-26: The owner's phone step (US-3) MUST be written as numbered owner instructions in `experiments.md` (procedure in "The owner's phone step" below), with a fixed report form, run against the real desktop app on a throwaway project the pipeline created, with marker strings the owner types so each device's text is identifiable. The pipeline MUST NOT watch the owner's screens; it MUST record the owner's report as owner-reported, read the disk of the throwaway project only after the owner has reported (FR-2), and say which items rest on the owner's report alone. [US-3]

FR-27: The phone step MUST include, beyond what the scripts can do: (a) the phone's tab moving to the background mid-edit and the phone locking, (b) a real mobile browser's resume behaviour, (c) a stale phone editor typing after the desktop saved, (d) the phone's real network timing. It MUST NOT claim to cover other phones, other browsers or other networks. [US-3]

FR-28: No fix. The run MUST NOT change product code, tests, configuration or documentation outside `specs/` (OQ-5 resolved: no pinning test in this feature; if the owner wants one it is decided after the stop). Every defect or surprise MUST be recorded and reported with its evidence and its limits, and not fixed, worked around or explained away. Defects outside the save path (for example the HTTP 404 on soft-deleting a folder that contains folders, recorded in the Feature 77 notes) MUST be recorded and not pursued. [US-4] [US-5]

FR-29: Previously recorded observations MUST be cited as starting evidence with their limits and rerun, not trusted: `specs/features/paired-device-limits/experiments.md`, "Two paired clients" (an already-open page did not change within 7000 ms without a reload when another client locked or unlocked; after another client locked the workspace, the open editor's only request after typing was `PATCH /api/resource/revision/<id>` answered 404 "Revision <id> not found", footer "Autosave failed", cause not established) and `specs/features/desktop-server-port/experiments.md` (port 7340; cookie scope; every scripted browser request came from the host to its own LAN address). The lock-then-save shape is NOT a scenario here (Owner decision, Gate 3, 2026-10-11, OQ-8): it is tracked separately (a POS note filed by the lead on 2026-10-10, and Feature 77's FR-37 record). If the same response (404 "Revision <id> not found") appears in a scenario it is recorded under failed saves (FR-7) with a pointer to that record and no cause. [US-4]

FR-30: Baselines and final suites. Before any scenario, and again after the last, the run MUST record `pnpm test:ci`, `pnpm typecheck` and `pnpm lint` (frontend/), `pnpm test` and `pnpm typecheck` (electron/), `pnpm --filter getwrite-cli test`, `pnpm test:e2e`, `pnpm test:sharing-smoke` against a fresh build, and `pnpm knip`, each with date, sandbox use, exit status and counts, even though no product code is expected to change, so that "no behaviour change" is itself checked. The only expected new knip entries are the scripts under `specs/`; any other difference MUST be reported. The git diff outside `specs/` MUST be empty (OQ-5: no pinning test). [US-5]

FR-31: Recording and the stop. Results MUST be recorded in `specs/features/two-client-save-measurement/experiments.md`, scripts in `specs/features/two-client-save-measurement/scripts/`, with a "Not run" list (every scenario or variation not done and why) and a section "Result against the definition" with the pass, fail or unstable verdict per scenario. The Feature 78 entry in `specs/product/getwrite.features.md` MUST be updated with the result and its limits. The run MUST then STOP and report to the owner; no task for Feature 79, a save-path change or a changed promise MUST be started, and the outcome (state the promise, change the save path, change the promise, or ship without the statement) MUST be left to the owner, per the carried default (sharing ships without the statement and the gap is recorded). [US-4]

FR-32: What FR-66's prerequisite means, for the report (Owner decision, Gate 3, 2026-10-11, OQ-9): results are reported per scenario as pass, fail or unstable, with conditions and distributions. The formal rule: the prerequisite PASSES only if every core scenario (S1 to S5) passes the FR-1 definition in a stable way; it FAILS if any core scenario fails it, or is unstable, or was not run. A conditional pass is not a pass: the conditions are reported and the verdict stays FAIL. A FAIL does not decide the outcome; it triggers the owner's decision. A PASS says nothing about scenarios not run (S6 to S10), other phones or other browsers. The report MUST say which. [US-2] [US-4]

FR-33: Findings beside the verdict (Owner decision, Gate 3, 2026-10-11, OQ-1 and OQ-3). The following MUST be reported as findings, each with its raw observation, what was and was not varied, and NO pass or fail: (a) whether a stale editor replaced the other device's text on a keystroke; (b) whether any save was sent with no typing (on resume, focus or visibility change); (c) whether the device whose text was overwritten was told anything (surfaces named, FR-4); (d) whether the overwritten text survives anywhere recoverable (for example an auto-backup revision) and under what condition; an overwrite that leaves no recoverable copy MUST be called out as its own finding; (e) whether an overwritten editor keeps showing text the server no longer holds; (f) the writing-log effect (whether the other device's words are counted as deleted or added, FR-6); (g) any failed save on the device the writer believes is last (FR-7). A finding is not a defect to fix (FR-28). [US-1] [US-4]

## Save path, as read (read, not run)

Everything here was read from the code on 2026-10-11 and not executed. It is a map for the scenarios, not a result.

- **Client trigger.** `frontend/components/WorkArea/EditView.tsx` `handleChange` calls `queueAutosave(doc)` only when the writer is editing the canonical revision and the change is not structural-only. `frontend/components/WorkArea/useCanonicalAutosave.ts` debounces 2500 ms (lodash `debounce`) and then calls `patchRevisionContent` in `frontend/src/lib/api/resources.ts`.
- **What is sent.** `PATCH /api/resource/revision/<resourceId>` with `{ projectId, revisionId, content }` where `content` is `JSON.stringify` of the editor's whole document. The save is a whole document, not a delta. No base revision, version number, `updatedAt` precondition, ETag or `If-Match` is sent (a search of `useCanonicalAutosave.ts`, `resources.ts`, `revision-core.ts` and the route for `etag`, `If-Match`, `baseRevision` and an `updatedAt` input found none; `updatedAt` appears only as an output).
- **Server, in order** (`frontend/app/api/resource/revision/[resource-id]/route.ts` `handlePatch` into `frontend/src/lib/models/revision-core.ts` `updateRevisionInPlace`): list the revisions and find the one with that id (error `Revision <id> not found.` becomes 404; an absent revisions directory reads as an empty list in `revision.ts` `listRevisions`, so a trashed or missing resource gives the same 404); require it to be canonical (else 400); `snapshotBeforeDestructiveWrite` reads the canonical revision's `content.bin` and, if the incoming document loses at least ten words and keeps no more than a set fraction of them (`content-loss.ts`), writes a new non-canonical revision named "Auto-backup before large deletion" holding the previous content; read the previous `content.bin` for the writing log; write `content.bin` (`io.ts` `writeFile`, not an atomic temp-and-rename); `logCanonicalSave` appends a writing-log entry holding the word-bag difference (`word-diff.ts`) between the previous `content.bin` and the incoming document (`writing-log.ts` appends under `withMetaLock`); `syncDerivedResourceContent` writes `resources/<id>/content.tiptap.json` then `content.txt` with plain `writeFile` and schedules indexing with `setImmediate`; read the sidecar and `writeSidecar` it with `updatedAt` and `wordCount` replaced. The response is the revision plus `updatedAt`, `snapshotCreated` and an optional `writingLog` signal.
- **What serialises concurrent saves.** Nothing around the whole sequence: `revision-core.ts` takes no lock (a search of it for `acquireLock` and `withMetaLock` found none). The only locks are inside `writeSidecar` (`withMetaLock`, per project root, around its own atomic write only) and `appendWritingLogEntry` (`withMetaLock`). Both lock modules are in-process maps, so they would serialise within the one server process only. Two PATCHes for one resource can therefore interleave at each await, and the four stores (`content.bin`, `content.tiptap.json`, `content.txt`, sidecar) are written as separate steps, not as a unit. Hypotheses to test, not findings: that they can end holding different clients' documents; that the writing-log diff for the later save is computed against whatever `content.bin` held when it was read, so the other device's words appear as deleted and the stale copy's as added; that two overlapping `writeFile` calls of different lengths could leave a mix of bytes in one file.
- **What the client does with the response.** On HTTP 200 it sets "saved", records the time, dispatches `updateResource` with the response `updatedAt` and a word count computed from its own document, and shows a toast only when `snapshotCreated` is true. It does not compare the response with its own document and does not replace the editor's document with anything from the server. On any non-2xx it throws, sets "error", keeps the failed document for a retry control, and the footer shows "Autosave failed" (the failed-save wording is as recorded in the earlier two-clients record, not re-read here).
- **Does an open editor re-read the server?** Read: no. `frontend/components/WorkArea/useRevisionContent.ts` fetches (`POST /api/project-resources`, then `GET /api/resource/revision/<id>`) in an effect keyed on project, selected resource, a reload token and a load key, so on selecting a resource and on a retry. A search of `components`, `src` and `app` for `visibilitychange`, window `focus`, `EventSource`, `WebSocket` and `setInterval` found timers only for relative-time labels (30 s ticks in `EditView.tsx`, `AppShell.tsx`, `StartPage.tsx`) and for the sharing limits and paired-device lists, none of which reads resource content. The store loads on mount through `GET /api/projects` with no sync layer. Whether switching to another resource and back re-fetches is read from the effect's dependencies and is unverified.
- **Sidecar path.** `frontend/app/(app)/page.tsx` `updateResource` sends the whole resource object for the selected resource (with the Redux `resourceSubtype` overlaid) to `POST /api/resource/<id>/sidecar`; `resource-crud-core.ts` `updateSidecarCore` reads the existing sidecar, merges `{ ...existing, ...update }`, deletes any `clearKeys`, and calls `writeSidecar`. The read and merge are outside the lock; only the write inside `writeSidecar` is locked. So a sidecar save and a content save (which also read-modify-writes the sidecar) from different clients can overwrite each other's keys; and a client's whole-resource payload may carry its own older values. Both are hypotheses.
- **Index.** `enqueueIndex` queues a task whose `runTask` (`indexer-queue.ts`) reads the persisted plain text at run time, so it reflects whichever `content.txt` is on disk when it runs; whether tasks for one resource coalesce was not read.
- **Encrypted projects.** The PATCH code path is the same; the adapter chosen per request path seals file bodies. A locked workspace raises `ProjectLockedError`, mapped by `with-storage-context.ts` (401 and 409); the recorded 404 after a lock does not match that mapping and is unexplained (OQ-8).

## The owner's phone step

Designed to be reported from, not observed. The pipeline prepares a throwaway project with one resource "Phone test" holding the text `BASE alpha bravo charlie`, starts the real desktop app on a throwaway user-data folder and projects folder with sharing on (FR-21 to FR-23), and gives the owner the address shown in the app; the pairing code is read from the app window by the owner and pairs the phone. Then the owner, in this order (markers are typed exactly, each on its own end-of-text position):

1. Open "Phone test" on both the desktop window and the phone (Chrome). Wait until both footers show saved. Report both texts.
2. Desktop: type ` D1`, wait 10 s. Phone: do not touch, do not reload. Report what the phone shows (exact text and footer, any message). 
3. Phone (still no reload): type ` P1`, wait 10 s. Report the phone's footer and any message verbatim. Report what the desktop window shows, untouched. Then reload both and report both texts.
4. Stale case: with both freshly reloaded, desktop types ` D2` and waits 10 s. On the phone, do not reload; switch to another app or lock the screen for 5 minutes (record the real time), return, and report what the phone shows before touching it. Then type ` P2`, wait 10 s, report footers and messages. Reload both and report both texts.
5. Background mid-edit: with both reloaded, on the phone type ` P3` and within 1 s switch to another app or lock the screen; leave it 60 s. During that minute, desktop types ` D3` and waits for saved. Return to the phone and report what it shows before touching it, wait 10 s, report again. Reload both and report both texts.
6. Report: the phone model and Chrome version, whether Wi-Fi stayed connected, and anything that looked wrong.

Report form per step: the text each device showed (verbatim), each footer status (verbatim), any message or toast (verbatim, or "none seen"), and the clock time. After the report the pipeline reads the throwaway project's files (FR-2) and compares. What the phone adds beyond the scripts: a real second device on the network, real mobile tab-suspension and resume (step 5, which Playwright cannot reproduce as the mobile OS does), real network latency, and a real mobile editor's input events.

## Open questions

None open. The Gate 3 answers of 2026-10-11 are folded in; the full text of each resolved question is under "Resolved questions (Gate 3, 2026-10-11)" below. The ids are kept contiguous.

- OQ-1 (resolved): the claim under test is last PROCESSED, all four stores, whole document; see FR-1.
- OQ-2 (resolved): core S1 to S5, S9 cut, S6, S7, S8, S10 held; see FR-10 to FR-19.
- OQ-3 (resolved): "told nothing" is a finding, not pass or fail; see FR-4, FR-33.
- OQ-4 (resolved): idle 60 s repeated, one 10-minute run, 5 minutes on the phone; see FR-13.
- OQ-5 (resolved): no pinning test in this feature; see FR-28, FR-30.
- OQ-6 (resolved): 3 repetitions sequential, 20 per S2 gap variant; see FR-20.
- OQ-7 (resolved): standalone server for everything scripted, real app for the phone step only; see FR-22.
- OQ-8 (resolved): lock-then-save is not a scenario; see FR-29.
- OQ-9 (resolved): per-scenario pass, fail or unstable; any core failure, unstable result or unrun core scenario fails the prerequisite; see FR-32.

## Resolved questions (Gate 3, 2026-10-11)

Format follows `specs/features/desktop-server-port.md`. The owner answered "I'll take your recs" to the lead's presentation of the recommendations (Owner decision, Gate 3, 2026-10-11).

- OQ-1 (resolved): What is the claim "last save wins"? Resolution: option (b). "Last" is last processed by the server; a scenario passes only if all four stores hold exactly the last-processed client's whole document, parseable and never a mix, and both clients show it after a reload. How "last processed" is determined, and its limits, are written into FR-1. The writer-facing readings (c) and (d) of the original options are not tested as pass or fail; their observable parts are findings (FR-33). Impact: FR-1, FR-2, FR-32, FR-33.
- OQ-2 (resolved): Which scenarios are core? Resolution: core and scripted S1 (in turn), S2 (near-simultaneous), S3 (stale client saves after the other), S4 (idle then resume), S5 (control, different resources). S9 is cut from the scripts; the PATCH path is the same (read, not run) and the phone step uses the desktop window plus the phone; what the cut leaves unmeasured is stated in FR-18. S6, S7, S8 and S10 are held until after the stop and run only at the owner's request; what holding them leaves unmeasured is stated in FR-15 to FR-17 and FR-19. Impact: FR-10 to FR-19, FR-32.
- OQ-3 (resolved): Is "the overwritten client is told nothing" part of pass or fail? Resolution: no. It is recorded only, as one of the findings (FR-33); an overwrite that leaves no recoverable copy is called out as its own finding. Impact: FR-4, FR-33.
- OQ-4 (resolved): How long is idle? Resolution: scripted 60 s (repeated), one scripted 10-minute run, and 5 minutes on the owner's phone. No 60-minute run. Impact: FR-5, FR-13.
- OQ-5 (resolved, confirmed): Pinning test? Resolution: no test in this feature; if the owner wants one it is decided after the stop. Impact: FR-28, FR-30.
- OQ-6 (resolved): Repetitions? Resolution: 3 for sequential scenarios, 20 per gap variant for S2; "stable" means every repetition agrees; 20 clean repetitions bound a failure rate at roughly 14% (rule of three) and are not proof; the phone step is one run and its stability is not assessable. Impact: FR-11, FR-20, FR-32.
- OQ-7 (resolved): Which server? Resolution: the built standalone server, started by script with environment, throwaway folders and the port checked first, for everything scripted; the real app only for the owner's phone step. Impact: FR-22, FR-26.
- OQ-8 (resolved, confirmed): Is the lock-then-save 404 a scenario? Resolution: no. It is tracked separately (a POS note filed by the lead on 2026-10-10, and Feature 77's FR-37 record); if the same response appears in a scenario it is recorded under failed saves with a pointer and no cause. Impact: FR-7, FR-29.
- OQ-9 (resolved): Does the verdict allow "partially passes"? Resolution: results are reported per scenario as pass, fail or unstable with conditions and distributions; the formal rule stays that any core failure, unstable result or unrun core scenario means FR-66's prerequisite FAILS; a FAIL triggers the owner's decision and does not make it. Impact: FR-32.

## Out of scope (deferred)

- Feature 79, the in-product last-save-wins statement, and any decision to ship, change or withhold it.
- Any change to the save path (a base-revision precondition, a lock around the save, merging, live sync), which is the owner's post-measurement decision.
- The Android app as a client (OQ-74), other phones, other mobile browsers, Safari and Firefox.
- Two-person editing, accounts and hosted-sync conflict handling (the product spec's FR-32).
- TLS and headless delivery.
- A review of working-copy strings (one later copy pass).
