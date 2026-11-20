# Task 46: CI commands, sharing smoke and close-out (lead-run)

Commit: `3af3c2f5` on `feat/merge-documents`. Run by the lead from the main checkout, outside the command sandbox, on macOS 26.5.1 arm64, from 2026-11-20T07:09:54Z to 07:15:39Z. Each command ran once, one after another, in the order below. The workflows are unchanged since Task 43 (`git diff --stat 6261aa6e HEAD -- .github/workflows` is empty).

## Workflow commands

From `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` at `3af3c2f5`:

| Command | Directory | Run? | Exit | Time |
| --- | --- | --- | --- | --- |
| `pnpm install --frozen-lockfile` | — | not run | — | dependencies are installed by the owner |
| `pnpm exec playwright install --with-deps chromium` | — | not run | — | browsers already installed |
| `pnpm typecheck` | `frontend/` | run | 0 | 2 s |
| `pnpm lint` | `frontend/` | run | 0 (0 errors, 460 warnings) | 21 s |
| `pnpm run check:no-hex` | `frontend/` | run | 0 | 0 s |
| `pnpm run format:check` | root | run | 0 | 4 s |
| `pnpm test:ci` | `frontend/` | run | 0 (1053 files; 15078 passed, 8 expected fail, 1 skipped) | 118 s |
| `pnpm build` | `frontend/` | run | 0 | 26 s |
| `pnpm --filter getwrite-frontend build` | root | run | 0 | 26 s |
| `pnpm test:e2e` | `frontend/` | run | 0 (270 passed, 1 skipped) | 81 s |
| `pnpm --filter getwrite-electron typecheck` (both passes) | root | run | 0 | 1 s |
| `pnpm --filter getwrite-electron test` | root | run | 0 | 3 s |
| `pnpm --filter getwrite-electron build` | root | run | 0 | 1 s |
| `pnpm --filter getwrite-cli typecheck` | root | run | 0 | 2 s |
| `pnpm --filter getwrite-cli test` | root | run | 0 | 14 s |
| `pnpm --filter getwrite-cli build` | root | run | 0 | 0 s |
| `node cli/dist/bin/getwrite-cli.cjs --help \| head -n 20` (and `doctor --help`, `prune --help`) | root | run | 0 | 1 s |
| `pnpm --filter getwrite-android build` | root | run | 0 (placeholder build) | 0 s |
| `gh release upload …` | — | not run | — | release only; needs a tag and a token |
| multi-line `run: \|` blocks (electron-builder signing and notarization, signature verification, Linux AppImage smoke, `gh workflow run`) | — | not run | — | release and Linux CI only; need signing secrets, a published release or Linux |

Also run, not workflow commands: `pnpm build:native` (`frontend/`, exit 0, 19 s) and `pnpm build-storybook` (`frontend/`, exit 0, 22 s). The task list names both.

### Lint warning count

There are 460 warnings against 459 at Task 43 (`6261aa6e`). The normalised warning lists differ by one line: `frontend/src/lib/api/split.ts`, `'SPLIT_OPERATION_KINDS' is defined but never used` (`@typescript-eslint/no-unused-vars`). The import is at line 56. `git log -S` names `b0c3d831`, the Task 44 defect fix, which removed the identifier's last use and left the import.

## Sharing smoke

`.next/static` was copied into `.next/standalone/frontend/.next/static` after `pnpm build`, as in Task 43. `pnpm test:sharing-smoke` (`frontend/`) then exited 0 with: "static files checked: 246; enumerated entries: 134; exceptions: 4 (3 enumerated + /_next/static/; 1 store-independent); checks: 37; failures: 0".

The entry count of 134 equals Task 32's `MIN_ENTRIES` of 134 (`experiments/task-32.md`). It is also the same count as Task 43.

## knip

`pnpm knip` (root; not a workflow command) exited 1, as at Task 43. Its findings are recorded in `task-43.md` and were not changed here.
