# Feature 116 experiments index

This file is an index only. Measurements are written in the per-task files under `experiments/`. Only Task 1 and Task 54 edit this file.

## Environment

Observed on 2026-11-14 (details and commands: `experiments/task-1.md`).

- node: `v24.15.0` (`node --version`)
- pnpm: `10.28.0` (`pnpm --version`)
- commit: `962a910faeb5b0566ae4f749ba412cedde09dcd1` (`git rev-parse HEAD`)
- branch: `worktree-agent-a0b23e82b7d1cd894` (`git branch --show-current`)
- engine: none installed (no `citeproc`, `hayagriva` or `citation-js` entry in `frontend/package.json`)

## Engine feasibility (FR-1)

- [task-2](experiments/task-2.md): licence facts from the upstream files.
- [task-3](experiments/task-3.md): the fidelity fixture and harness.
- [task-4](experiments/task-4.md): the fidelity run.
- [task-5](experiments/task-5.md): runtime in four runtimes, network disabled.
- [task-6](experiments/task-6.md): Hayagriva built to WebAssembly.
- [task-7](experiments/task-7.md): bundle size.
- [task-8](experiments/task-8.md): the comparison table for Hayagriva.

## Decision (FR-2)

[task-9](experiments/task-9.md):

> Decision: Hayagriva 0.10.1 (commit `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04`, compiled to WebAssembly, `wasm-opt -Oz`), taken under Apache-2.0 (licence text and Hayagriva's NOTICE bundled; Hayagriva source unmodified), accepted; Chicago Manual of Style 18th edition notes and bibliography (CSL `chicago-notes-bibliography.csl`, CC BY-SA 3.0, unmodified, author metadata kept) and the en-US locale (`locales-en-US.xml`, CC BY-SA 3.0, translators kept) accepted, crediting the CSL project with a link to citationstyles.org; bundle size of about 2.5 MB raw / 796 KB gzipped per engine copy accepted, with Task 32 loading as few copies as it can; 2026-11-15; by the owner.

The engine is delivered as a vendored build ([task-56](experiments/task-56.md), built from the Task 55 wrapper source).

## Non-engine inventory (FR-3)

- [task-10](experiments/task-10.md): FR-3 (a), (b) before, and (h).
- [task-11](experiments/task-11.md): FR-3 (c) and (d), sidecar writers and a new top-level key.
- [task-12](experiments/task-12.md): FR-3 (e) and (f), what compile and annotation marks give PDF and DOCX, and PDF byte reproducibility.
- [task-14](experiments/task-14.md): FR-3 (b) after.
- [task-51](experiments/task-51.md): FR-3 (g). Zero occurrences of `NEXT_PUBLIC_GETWRITE_RUNTIME` under `frontend/out/_next/static`. This record also covers the build and inlining check.

## Footnote placement (FR-12)

- [task-36](experiments/task-36.md): the footnote placement experiment.
- [task-37](experiments/task-37.md): "No decision needed: PDF placed each note on its page, per `experiments/task-36.md`."
- [task-57](experiments/task-57.md): page-finding without text extraction. This is the construction [task-43](experiments/task-43.md) uses.

## Repairs found during the work

- [task-58](experiments/task-58.md): PDF font failure, reproduction.
- [task-60](experiments/task-60.md): PDF font failure, root cause.
- [task-61](experiments/task-61.md): the PDF faces switched from `.woff2` to `.woff`.
- [task-63](experiments/task-63.md): compile error mapping in the PDF and DOCX routes.
- [task-64](experiments/task-64.md): the sidebar sends the project directory id.
- [task-65](experiments/task-65.md): real calendar dates, no later than today at UTC+14.
- [task-66](experiments/task-66.md): the citation-fields editor saves as you type.

Defects 64, 65 and 66 were found in the owner's Task 52 run.

## Tests and documentation

- [task-32](experiments/task-32.md): the engine adapter.
- [task-48](experiments/task-48.md): pins for module off, Sources off, isolation and annotations unchanged.
- [task-49](experiments/task-49.md): accessibility and keyboard tests.
- [task-50](experiments/task-50.md): documentation and the project type editor label.

## Runs (FR-26)

- [task-52](experiments/task-52.md): the packaged macOS arm64 app with the network off, run by the owner. Steps 2 and 3 were re-run on a package built after Tasks 65 and 66.
- [task-53](experiments/task-53.md): a hosted-mode production build in Chrome 157, run by the owner. In the lead's second-tenant probe, the first tenant's ids got the same 404 as made-up ids on the fields and check routes.
- [task-54](experiments/task-54.md): the CI commands, run after `pnpm install --frozen-lockfile`. Every command that ran exited 0, including `pnpm test:ci` (993 of 993 files) and `pnpm test:e2e` (270 passed, 1 skipped). Earlier runs on a tree that did not match the lockfile had `pnpm test:ci` failures in files this branch does not change. Their cause is not established.

## Not verified

Collected from `task-52.md`, `task-53.md` and `task-54.md`. Each record's own list is authoritative.

- Android, and the in-app PDF path on Android.
- A paired device.
- A DOCX opened in Microsoft Word.
- Screen-reader use.
- A manuscript with hundreds of notes.
- An in-text style other than the bundled one.
- Notarization, and a first launch through Gatekeeper.
- A deployed hosted service behind a proxy over https.
- Cross-tenant access to the compile routes with the citations option.
- The not-saved message when the whole Citation fields section unmounts.
- Why `pnpm test:ci` failed in the earlier runs, before the lockfile install.
- The signed CI packaging, the Linux AppImage smoke and the release workflows.

## Acceptance

- Tasks 1 to 66 are ticked once Task 54 is ticked.
- Every CI command that was run exited 0 in the run of record, on the lockfile tree.
- The commands not run, and the earlier failing runs, are in `task-54.md`.
