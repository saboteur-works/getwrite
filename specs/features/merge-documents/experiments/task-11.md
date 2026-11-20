# Task 11: sample project generator, encrypted copy

Test tooling only (POS `task_23e9c7df`). All projects were written under the OS temp directory; the passphrase in the test is a random throwaway value written to a temp file, never committed or printed.

## What was built

`scripts/sample-project/generate.mjs --out <dir> --encrypted <passphrase-file>` writes the usual project in `<dir>/` and a second project, built from the same seed (same ids and text), in `<dir>-encrypted/`. The second one is sealed through the real `enableProjectEncryption` (server-side layer, as recorded in `task-8.md`), driven from the esbuild bundle with the `server-only` alias already in the wrapper. The JSON line gains `encrypted: { path, projectId, keyringFile }`; without the option the line has no `encrypted` key and no second directory is written.

Files touched: `scripts/sample-project/generate.mjs`, `scripts/sample-project/driver.ts` (a driver file inside `scripts/sample-project/`, allowed as for Tasks 9 and 10: it takes a new `--passphrase-file` argument and runs the encryption step last), `frontend/tests/unit/sample-project-encrypted.test.ts` (new), this file.

Design points, each as built:

- The encrypted copy has a directory of its own because the keyring file `.getwrite-keyring.json` is written in the workspace root (`task-8.md`). It is a second driver run, not a copy of the plain directory, so `project.json` `rootPath` names the encrypted copy's own directory.
- The passphrase is read from the file (a trailing newline dropped). The wrapper checks that the file is readable and non-empty, and that `<dir>-encrypted` is not a non-empty directory, before the first write. The driver receives only the file path.
- If the encrypted run fails, the wrapper removes `<dir>-encrypted` and exits non-zero without printing the JSON line; the plain project is left.
- Key derivation uses the default Argon2id parameters (not timed here).

## Tests first

The test file was written before the change. First run (`vitest run tests/unit/sample-project-encrypted.test.ts`): `Failed Suites 1`, `9 skipped`; `beforeAll` failed on `expect(run.status).toBe(0)`, received 1 (the generator rejected the unknown `--encrypted` option). After the change: `Test Files 1 passed`, `Tests 9 passed (9)`, 25 s.

## Done-when clauses

| Clause | Verification |
|---|---|
| `--encrypted <passphrase-file>` writes a second project that opens only with its key | test "names the encrypted copy in the JSON line, in its own directory" (marker `.encrypted.json` present in the copy and absent from the plain project; keyring file in the copy's own root); test "does not hold the document text in plain form in the encrypted copy" (stored `content.txt` does not contain the plain text) |
| A read with no key raises the locked error and does not return an empty read | test "raises the locked error for a read with no key, not an empty read": `runInProjectContext(root, null, () => fetchResourceContentCore(...))` rejects with `ProjectLockedError` |
| A read with the key returns the document text | test "returns the document text for a read with the key": `unlockSession(passphrase, root)` then the same read; the result contains the plain project's text of that document and at least one revision |
| Passphrase read from a file, never from the command line, never printed | test "never prints the passphrase or writes it into either project" (stdout, stderr and every byte of both project directories searched for the throwaway value); the passphrase reaches the generator only as a file path; tests refuse a missing and an empty file with a non-zero exit, empty stdout and no directory written |
| Unencrypted output unchanged by the option | test "adds no encrypted key and writes no second project without the option"; the 36 tests of `sample-project-generator.test.ts` pass unchanged (`Tests 36 passed (36)`). That test file runs the generator without the option; it was not run with the option to compare the plain project byte for byte, and timestamps differ between runs in any case |
| `pnpm typecheck`, `pnpm lint` | `pnpm typecheck` (frontend): no error. `pnpm lint`: 0 errors, 459 warnings (the same count as Task 10's record, none attributed to the new test file) |
| `package.json` and lockfiles unchanged | `git status --short` lists only the two script files and the new test file; `git diff --stat` on `package.json` and `pnpm-lock.yaml` is empty |

The alternative branch of the clause (in-app steps instead of an encrypted copy) was not needed: the layer was driven from a script, as `task-8.md` observed. Task 12's README should say how to open the copy: point the app's projects directory at `<dir>-encrypted/`, then unlock the workspace with the passphrase from the file.

## Not established

- Opening the encrypted copy in the running app (desktop or web) was not run; the tests read through the core functions only. The sealed copy was not checked with a merge.
- `driver.ts` is outside `frontend/tsconfig.json`, so `pnpm typecheck` does not see it; it is checked by the esbuild bundle running (esbuild does not type-check), as in Task 10.
- Generation takes about twice as long with the option (the plain project is built twice, once in each directory); not timed separately.
- Hosted mode refuses encryption by design (`EncryptionUnavailableError`); not applicable to this script and not run.
