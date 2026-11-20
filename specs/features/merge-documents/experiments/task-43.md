# Task 43: build check of every CI workflow command (lead-run)

Commit: `6261aa6e` on `feat/merge-documents`. Run by the lead from the main checkout, outside the command sandbox, on macOS arm64 (Darwin 25.5.0), 2026-11-19, 23:06:46Z to 23:13:11Z for the first pass. Each command ran once, one after another, in the order below.

## Task-named commands

| Command | Directory | Exit | Time |
| --- | --- | --- | --- |
| `pnpm typecheck` | `frontend/` | 0 | 17 s |
| `pnpm lint` | `frontend/` | 0 (0 errors, 459 warnings) | 52 s |
| `pnpm test:ci` | `frontend/` | 0 (1053 files; 15075 passed, 8 expected fail, 1 skipped) | 137 s |
| `pnpm build` (`next build`) | `frontend/` | 0 | 24 s |
| `pnpm build:native` | `frontend/` | 0 | 19 s |
| `pnpm build-storybook` | `frontend/` | 0 | 23 s |
| `pnpm --filter getwrite-electron typecheck` (both passes: `tsc --noEmit && tsc --noEmit --project tsconfig.worker.json`) | root | 0 | 1 s |
| `pnpm --filter getwrite-cli typecheck` | root | 0 | 1 s |

`pnpm test:ci` includes `core-import-graph.test.ts`, `split-core-import-graph.test.ts`, `sample-project-generator.test.ts` and `sample-project-encrypted.test.ts` (all in `frontend/tests/unit/`); every file passed.

## Workflow commands

From `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` at `6261aa6e`:

| Command | Run? | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | not run | dependencies are installed by the owner; not re-run |
| `pnpm exec playwright install --with-deps chromium` | not run | browsers already installed |
| `pnpm typecheck` | run | exit 0 |
| `pnpm lint` | run | exit 0 |
| `pnpm run check:no-hex` | run (`frontend/`) | exit 0 |
| `pnpm run format:check` | run | first run from `frontend/`: exit 1, `ERR_PNPM_NO_SCRIPT Missing script: format:check` (wrong directory; the workflow runs it at the root). Rerun from the root: exit 0, "All matched files use Prettier code style!" |
| `pnpm test:ci` | run | exit 0 |
| `pnpm test:e2e` | run (`frontend/`) | exit 0, 66 s |
| `pnpm build` | run (`frontend/`) | exit 0 |
| `pnpm --filter getwrite-frontend build` | run | exit 0, 24 s |
| `pnpm --filter getwrite-electron typecheck` | run | exit 0 |
| `pnpm --filter getwrite-electron test` | run | exit 0 |
| `pnpm --filter getwrite-electron build` | run | exit 0 |
| `pnpm --filter getwrite-cli typecheck` | run | exit 0 |
| `pnpm --filter getwrite-cli test` | run | exit 0 |
| `pnpm --filter getwrite-cli build` | run | exit 0 |
| `node cli/dist/bin/getwrite-cli.cjs --help \| head -n 20` (and `doctor --help`, `prune --help`) | run | exit 0 |
| `pnpm --filter getwrite-android build` | run | exit 0 (placeholder build) |
| `gh release upload …` | not run | release-only, needs a tag and token |
| multi-line `run: \|` blocks (electron-builder signing and notarization, signature verification, Linux AppImage smoke, `gh workflow run`) | not run | release and Linux CI only; need signing secrets, a published release or Linux |

## Also run

- `pnpm test:sharing-smoke` (`frontend/`): first run straight after `next build` exited 1 with two failures, every `/_next/static/` file answering 404, because the standalone server had no `.next/static`. After copying `.next/static` into `.next/standalone/frontend/.next/static` (as Feature 120 Task 37 did), rerun: exit 0, "enumerated entries: 134; … checks: 37; failures: 0".
- `pnpm knip` (root; not a workflow command): exit 1 with findings across the repository (311 unused files, 166 unused exports, 220 unused exported types, among others). Findings in exports this branch added: `MERGE_COMPOSE_FAILURES`, `MergeComposeAbsorbed`, `MergeComposeFailureReason` (`merge-compose.ts`), `MergeUndoClientFields`, `MergeUndoClientResult` (`lib/api/split.ts`), and the files `scripts/sample-project/driver.ts` and `generate.mjs` (run by Node, not an entry knip knows). Recorded, not changed; whether to trim them is a follow-up.

## Owner wording review in the built app

The owner reviewed the Task 37 wording and the Task 41 Undo texts in the packaged app during Task 44. Their changes are recorded in the next section. On 2026-11-19 the owner signed off on the wording and the panelled layout as built.

## Owner decision, 2026-11-19 (Task 43 review)

Wording changes (user-facing only; code identifiers and spec terms such as "target" are unchanged):

- The first document of a merge is called the "base document" ("Base document" at the start of a line) in `merge-messages.ts`, `merge-undo-messages.ts`, `MergeDialog.tsx` and `docs/user/handbook/write/merge-documents.md`. This covers the documents list label, the "Keep the base document's value" option, the "(combined with the base document's values)" legend, the explanatory paragraph, the dialog description, the refusals, the compile and Inbox warnings, the failure step names, the Undo texts and the success texts.
- Heading "Move these to the first document" is now "Select the notes, citations, and claims you would like to move to the base document".
- Heading "Copy these details to the first document" is now "Select metadata fields you would like to override on the base document below".

Layout change: in `MergeDialog.tsx`, (a) the explanatory paragraph and the documents list, (b) the notes, citations and claims section and (c) the metadata section are each in a contained panel with the menu surface of `.resource-context-menu` (`styles/getwrite-utilities.css`): 0.5px `gw-border` border, `rounded-md`, `gw-chrome2` background, padded `p-4` (the menu has no shadow, so none is used). Warnings stay between the panels, outside them. The metadata section uses the same panel so the three read consistently. Semantics, the `ol` aria-label and the `aria-labelledby` headings are unchanged.
