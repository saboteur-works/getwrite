# Spell checker experiments

Labels: MEASURED = observed by running the command; READ = taken from reading code or docs.

## Environment record

- Date: 2026-10-25
- `git rev-parse HEAD`: 89ac0f443d64cb1aa60c9620609bcf76528be7fa (branch feat/spell-checker)
- `node --version`: v24.15.0
- `uname -a`: Darwin Jedais-MacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:15 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6041 arm64
- `sw_vers`: macOS 26.5.1 (build 25F80)
- Run inside the Bash sandbox (not retried outside it).

## Native build

MEASURED.

- Command: `pnpm build:native` (cwd `frontend/`)
- Exit code: 1
- Stage reached: `Compiled successfully in 8.0s`, then `Running TypeScript ...`, then `Failed to type check.`
- First error lines, verbatim:

```
Failed to type check.

./stories/Start/CreateProjectModal.stories.tsx:6:8
Type error: Cannot find module '../../../frontend/components/Start/CreateProjectModal' or its corresponding type declarations.
```

- Final lines, verbatim:

```
Next.js build worker exited with code: 1 and signal: null
[build-native-static] ERROR: `next build` exited with status 1.
 ELIFECYCLE  Command failed with exit code 1.
```

- Also printed (not necessarily related): `WARN Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM: operation not permitted` and a Turbopack "3 warnings" block about an unexpected file in the NFT list (`./frontend/.native-build/next.config.mjs`).
- Cause: not established.

## Native build, second run

MEASURED.

- Command: `pnpm build:native` (cwd `frontend/`), run inside the Bash sandbox.
- Change 1 (file `frontend/stories/Start/CreateProjectModal.stories.tsx`, line 6):
  - old: `} from "../../../frontend/components/Start/CreateProjectModal";`
  - new: `} from "../../components/Start/CreateProjectModal";`
- Exit code after change 1 alone: 1. First error lines, verbatim:

```
Failed to type check.

./stories/Start/ImportDocxDialog.stories.tsx:4:30
Type error: Cannot find module '../../../frontend/components/Start/ImportDocxDialog' or its corresponding type declarations.
```

- Change 2: the same import-path edit (`../../../frontend/components/` to `../../components/`) in `frontend/stories/Start/ManageProjectMenu.stories.tsx`, `ImportDocxDialog.stories.tsx`, `StartPage.stories.tsx`, `ImportScrivenerDialog.stories.tsx`. These were the only other files under `frontend/stories` containing `../../../frontend/`.
- Exit code after changes 1 and 2: 0 (`Native static export produced at .../frontend/out`).
- `pnpm typecheck` and `pnpm lint` results: see the task report.
- Cause: not established.
