# Experiments: paired-device management (Feature 76)

## i: cross-package import

Date: 2026-10-09. Node v24.15.0 (local). Worktree `getwrite-wt-pdm`, no config edited.

Throwaway test `frontend/tests/unit/zz-cross-package-spike.test.ts` (deleted afterwards). It imported `readPairingState` from `../../../electron/src/sharing/pairing-code` and `addDevice`, `mintCredential`, `readCredentialStore` from `../../src/lib/sharing/credential-store`. It called `readPairingState` on an empty temp directory (got `{ kind: "absent" }`), minted a device, wrote it with `addDevice` into a temp directory, and read it back with `readCredentialStore` (kind `ok`, same device id).

1. Vitest, from `frontend/`: `pnpm exec vitest run tests/unit/zz-cross-package-spike.test.ts`
   - Output: `Test Files  1 passed (1)`, `Tests  1 passed (1)`.
2. With the throwaway file present:
   - `pnpm typecheck` (`tsc --noEmit`): exit 0, no diagnostics.
   - `pnpm lint`: exit 0, `395 problems (0 errors, 395 warnings)`; no line mentions the spike file.
3. Verdict: YES (vitest, typecheck and lint all accept it).
4. Consequence (spec FR-15): YES means the interleaving tests of Task 5 run against both real implementations.

Not tested: `electron/` typecheck (not part of the Done-when), and Node 20 (the machine ran Node 24).

`git status --short` from the repo root, after deleting the throwaway:

```
?? specs/features/paired-device-management/experiments.md
```
