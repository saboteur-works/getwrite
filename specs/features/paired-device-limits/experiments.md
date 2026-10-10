# Experiments: Feature 77 (paired device limits)

Records are measurements. A cause is named only where an experiment separated it from the alternatives; otherwise it is left unnamed.

## i: classification header on POST

Date: 2026-10-10. Machine: darwin, Node v24.15.0 (the Node on PATH; not the CI Node 22). Run in the main checkout, branch `feat/paired-device-limits`.

### Method

- Port 3000 checked first with `lsof -iTCP:3000 -sTCP:LISTEN`: no listener. The script repeats this check and refuses to run if anything listens.
- Throwaway route `frontend/app/api/zz-echo-classification/route.ts`: GET and POST handlers returning `{ header: request.headers.get("x-getwrite-classification") }` and nothing else (POST reads and discards the body). Deleted at the end of the task.
- Standalone build: `pnpm build` from `frontend/` (exit 0, in the command sandbox), then `.next/standalone/frontend/server.js` started by the script with `HOSTNAME=127.0.0.1`.
- `next dev`: `pnpm exec next dev -p <port>` from `frontend/`, no `HOSTNAME` set.
- Script: `specs/features/paired-device-limits/scripts/header-experiment.mjs`, run as `node header-experiment.mjs standalone` and `node header-experiment.mjs dev`. It picks free ports itself, starts each server in its own process group, records the pids and stops only those groups. Ports used were in the 61000 range, chosen by the script.
- Env passed to every server: `PORT=<port>`, `GETWRITE_PROJECTS_DIR=<throwaway dir under os.tmpdir()>`. Sharing-on server also `GETWRITE_SHARING=1`, `GETWRITE_WINDOW_SECRET=<window-secret>` (random per run, never printed), `GETWRITE_SHARING_DIR=<throwaway dir>`. Sharing-off server: neither sharing variable. Empty throwaway directories; not `~/Documents/GetWrite`, the repo's `projects/`, or `~/Library/Application Support/getwrite-electron`.
- Callers: window = request with header `x-getwrite-window: <window-secret>`; paired device = cookie `getwrite_device=<cookie>` obtained by writing a fixture `pairing-state.json` (same shape as `frontend/scripts/sharing-refusal-smoke.mjs`) and POSTing a code to `/api/sharing/pair` (status 200); unpaired = no cookie, no window header; sharing off = separate server with sharing unset. POSTs carry `content-type: application/json`, `origin: <server base>` and body `{"probe":true}`. All requests from the same host to `127.0.0.1:<port>`.
- Forged case: the same POST with an added client header `x-getwrite-classification: window`.
- Tokens, cookie values, pairing codes and the window secret are not in this record; the device id in a `confirmed:` value is shown as `<device-id>`.

### Observed values (status, header value the handler echoed)

`-` in the gate column means no `x-getwrite-gate` response header. "not reached" means the response was the gate's own refusal and the echo handler did not run (the JSON had no `header` field).

| Caller | Request | Standalone status / echoed | `next dev` status / echoed |
| --- | --- | --- | --- |
| window | GET | 200 / `window` | 200 / `window` |
| window | POST json | 200 / `window` | 200 / `window` |
| window | POST json + forged `window` | 200 / `window` | 200 / `window` |
| paired device | GET | 200 / `confirmed:<device-id>` | 200 / `confirmed:<device-id>` |
| paired device | POST json | 200 / `confirmed:<device-id>` | 200 / `confirmed:<device-id>` |
| paired device | POST json + forged `window` | 200 / `confirmed:<device-id>` | 200 / `confirmed:<device-id>` |
| unpaired device | GET | 401, gate `not-paired` / not reached | 401, gate `not-paired` / not reached |
| unpaired device | POST json | 401, gate `not-paired` / not reached | 401, gate `not-paired` / not reached |
| unpaired device | POST json + forged `window` | 401, gate `not-paired` / not reached | 401, gate `not-paired` / not reached |
| sharing off | GET | 200 / `off` | 200 / `off` |
| sharing off | POST json | 200 / `off` | 200 / `off` |
| sharing off | POST json + forged `window` | 200 / `off` | 200 / `off` |

Note on the window row: a real window request already carries `window`, so the forged row for the window caller cannot show a forged value surviving or not; the forged rows that discriminate are paired, unpaired and sharing off.

### FR-4 verdict

- Standalone build: the header reaches a POST handler: **yes** (window, paired and sharing-off callers). A forged client copy survives: **no** (paired saw `confirmed:<device-id>`, sharing off saw `off`; the unpaired forged request was refused by the gate with 401 before any handler ran, so the handler saw nothing).
- `next dev`: the header reaches a POST handler: **yes**. A forged client copy survives: **no** (same observations).
- Route-level enforcement as written (Tasks 9 to 13) is not contradicted by this measurement. Not tested: other request bodies or content types, other methods than GET and POST, other routes than the echo route, a proxy matcher exclusion.

### `next dev` request from the host's LAN address, sharing off

Server B (sharing off, `next dev -p <port>`), request sent from the host to its own LAN address (`10.0.0.226`, a second device was not used), GET and POST json to the echo route: both **200**, no `x-getwrite-gate` header, handler echoed `off`. Server kept up for these requests and a listener check only, then stopped by recorded pid group.

Listener check (`lsof -nP -a -iTCP -sTCP:LISTEN -p <pid>` for each member of the process group the script started; the `pnpm` parent and three of its children showed no TCP listener, one child showed):

```
COMMAND   PID          USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    48717 jedaisaboteur   13u  IPv6 0x20b2c5741829d23b      0t0  TCP *:61373 (LISTEN)
```

So under this launch the `next dev` listener was on `*:<port>` and the sharing-off request via the LAN address was classified `off` and served. No cause is named for why it listens on `*`. The standalone server in this experiment was started with `HOSTNAME=127.0.0.1`, so a LAN request to it was not tried.

### FR-3 context (restated, not re-measured as such)

Feature 76 observed: a development-mode server child showed `TCP *:3000`; a request from the host to its own LAN address returned 200 with project data and no `x-getwrite-gate` header with sharing off. It was sent from the host, not from a second device; it was not separated from other explanations; it was not checked whether it predates Feature 75. The measurement above is consistent with that observation on a different port and route but does not settle those points. This matter is tracked separately and is not fixed here.

### What did not go as first run, and what was not run

- `next dev` inside the command sandbox: the first run's sharing-on server answered, but its sharing-off server returned 404 for the echo route (including from the LAN address); a rerun in the sandbox with a stricter readiness check never got a non-404 response from the echo route on the sharing-on server (script error "server did not become ready"). The final `next dev` run, whose values are in the table, was run with `dangerouslyDisableSandbox: true` (the script also uses `ps` and `lsof`, which the sandbox denied for `ps`: "operation not permitted: ps"). The 404s in the sandbox were not investigated and no cause is named.
- The standalone build and its server ran inside the sandbox without problems. The `pnpm build` ran inside the sandbox (exit 0).
- Not run: a second physical device; Node 22; the unpaired caller reaching a handler (the gate refuses every non-exempt path first); a window request carrying a forged copy different from `window`.
- No server left running: the final `lsof` for ports in the 61000 range showed no listener.

### Cleanup

Throwaway route deleted. Build output is under gitignored `frontend/.next/`. `git status --short` from the repo root after cleanup after cleanup:

```
?? specs/features/paired-device-limits/experiments.md
?? specs/features/paired-device-limits/scripts/
```

## ii: traversal projectId

Date: 2026-10-10. Machine: darwin, Node v24.15.0 (the Node on PATH, not the CI Node 22). Main checkout, branch `feat/paired-device-limits`. No source file changed; the real `POST /api/encryption` route was measured (no throwaway route).

### Finding (stated first)

`POST /api/encryption` with `action: "enable"` and `projectId: "../<sentinel>"` returned 200 and acted OUTSIDE the workspace root: the sentinel directory beside the workspace received a `.encrypted.json` marker and its `marker.txt` was rewritten (16 B before, 49 B after, different digest; the file's contents were not read back). It reproduced for both a null passphrase (session unlocked by a prior valid enable) and a non-null passphrase, in both runs. `export` with the same value did not act (it stopped at a key lookup, see table). The empty string made `enable` act on the workspace root itself. Recorded as measured; not fixed here.

### Build, server, commands

- Port 3000 checked first: `lsof -iTCP:3000 -sTCP:LISTEN` returned no listener. The script repeats the check and refuses to run if there is one.
- Standalone build already in `frontend/.next/standalone/frontend/server.js` (written 14:17 today by Task 1's `pnpm build`; `frontend/app/api/encryption/route.ts` last modified 2026-09-22 and `git status` clean, so the build reflects the current route). Chosen over `next dev` because it was already built and starts fast enough to give every case its own fresh server; `next dev` was not run, so nothing is claimed for it. Ran in the command sandbox; no EMFILE or other sandbox error, no retry outside the sandbox.
- Command: `node specs/features/paired-device-limits/scripts/traversal-experiment.mjs standalone`. Run twice. The first run's classifier labelled the empty-string cases "failed later"; the rule for "workspace root itself" was then added to the script and it was run again; the table is from the second run, and the first run's statuses and listings had the same outcomes.
- Script behaviour: per (action, value) it builds a fresh throwaway layout and starts a fresh standalone server on a free port chosen by the script (127.0.0.1, sharing off, `HOSTNAME=127.0.0.1`, hosted-auth variables unset), records the pid, stops only that process group, then deletes the layout. After the runs: `Process groups still recorded: 0`, no listener from the script remained, no `gw-trav-*` directory left in `$TMPDIR`.
- Env passed to the server: `PORT`, `GETWRITE_PROJECTS_DIR=<workspace>`, `HOME=<userdata>`. The server reads no other path variable for encryption.

### Throwaway layout (per case)

```
$TMPDIR/gw-trav-XXXXXX/        throwaway parent (every path asserted under os.tmpdir())
  workspace/                   GETWRITE_PROJECTS_DIR; one seeded valid-UUID project (project.json, resources/r1/content.txt)
  sentinel-<8 hex>/            sibling sentinel; marker.txt "sentinel marker\n" (16 B)
  userdata/                    throwaway HOME for the server; empty
```

Passphrase: random per case, never printed or recorded. Setup for `enable` with a null passphrase and for `export`: one valid `enable` of the seeded project with the passphrase (status 200 in every case), which creates the keyring and leaves the server session unlocked; that setup is before the "before" listing. For `enable` with a non-null passphrase: no setup, no keyring beforehand.

### Request shapes

All `POST http://127.0.0.1:<port>/api/encryption`, `content-type: application/json`, `origin` set to the server base, sharing off.

- enable, null passphrase: `{"action":"enable","projectId":V,"projectName":"Throwaway","passphrase":null}`
- enable, non-null: same with `"passphrase":"<throwaway>"`
- export: `{"action":"export","projectId":V}`

Values V (JSON as sent; `<sentinel>` is `sentinel-<8 hex>`, `<abs>` the throwaway parent's absolute path):

1. relative: `"../<sentinel>"`
2. absolute: `"<abs>/<sentinel>"`
3. percent-encoded: `"..%2F<sentinel>"` (the literal text `..%2F`, not decoded by the client)
4. empty string: `""`
5. JSON null: `null`
6. NUL byte: `"../<sentinel>\u0000"` (JSON escape for a NUL byte at the end)

### Results (second run)

Listings are names and counts only (digests of file bytes were compared, contents never printed). `ws` = workspace file/dir entries before -> after, `sentinel` likewise. "keyring rewritten" means `.getwrite-keyring.json` and `.getwrite-names` in the workspace changed size/digest (or were created) during the case.

| Action | Value | Status | `error` | Listings | Classification |
| --- | --- | --- | --- | --- | --- |
| enable, null passphrase | relative | 200 | none | sentinel 1 -> 2: `.encrypted.json` added, `marker.txt` 16 B -> 49 B; ws 8 -> 8, keyring rewritten | path was built outside the root |
| enable, null | absolute | 400 | `ENOENT ... open '<workspace>/<abs>/<sentinel>/.converting.json.tmp'` | sentinel 1 -> 1 unchanged; ws 8 -> 8, keyring rewritten | failed later for another reason (the path was joined under the workspace; the directory does not exist there; no file effect except the keyring) |
| enable, null | percent-encoded | 400 | `ENOENT ... open '<workspace>/..%2F<sentinel>/.converting.json.tmp'` | sentinel unchanged; ws 8 -> 8, keyring rewritten | failed later for another reason (same) |
| enable, null | empty | 400 | `Keyring at <workspace>/.getwrite-keyring.json is not valid JSON. Refusing to treat a corrupt keyring as an absent one.` | sentinel unchanged; ws 8 -> 9: `.encrypted.json` added at the workspace root, the seeded project's `.encrypted.json` rewritten, keyring and names rewritten | path was built at the workspace root itself (effect inside the workspace, none outside it) |
| enable, null | null | 400 | `The "path" argument must be of type string. Received null` | sentinel unchanged; ws 8 -> 8, keyring rewritten | failed later for another reason |
| enable, null | NUL byte | 400 | `The argument 'path' must be a string, Uint8Array, or URL without null bytes. Received '<parent>/<sentinel>\x00/.converting.json.tmp'` | sentinel unchanged; ws 8 -> 8, keyring rewritten | failed later for another reason (the joined path reached `fs`, which refused it) |
| enable, non-null | relative | 200 | none | sentinel 1 -> 2: `.encrypted.json` added, `marker.txt` 16 B -> 49 B; ws 5 -> 7 (keyring and names created) | path was built outside the root |
| enable, non-null | absolute | 400 | `ENOENT ... open '<workspace>/<abs>/<sentinel>/.converting.json.tmp'` | sentinel unchanged; ws 5 -> 7 (keyring, names created) | failed later for another reason |
| enable, non-null | percent-encoded | 400 | `ENOENT ... open '<workspace>/..%2F<sentinel>/.converting.json.tmp'` | sentinel unchanged; ws 5 -> 7 | failed later for another reason |
| enable, non-null | empty | 400 | `Keyring at <workspace>/.getwrite-keyring.json is not valid JSON. Refusing ...` | sentinel unchanged; ws 5 -> 8: `.encrypted.json` at workspace root, keyring and names created, the seeded project's `project.json` and `content.txt` rewritten (15 B -> 48 B, 64 B -> 97 B) | path was built at the workspace root itself |
| enable, non-null | null | 400 | `The "path" argument must be of type string. Received null` | sentinel unchanged; ws 5 -> 7 | failed later for another reason |
| enable, non-null | NUL byte | 400 | `The argument 'path' must be a string, Uint8Array, or URL without null bytes. ...` | sentinel unchanged; ws 5 -> 7 | failed later for another reason |
| export | relative | 400 | `No data key registered for project "../<sentinel>".` | all listings unchanged (ws 8 -> 8, sentinel 1 -> 1) | failed later for another reason (key lookup; see limits below) |
| export | absolute | 400 | `No data key registered for project "<abs>/<sentinel>".` | unchanged | failed later for another reason |
| export | percent-encoded | 400 | `No data key registered for project "..%2F<sentinel>".` | unchanged | failed later for another reason |
| export | empty | 400 | `No data key registered for project "".` | unchanged | failed later for another reason |
| export | null | 400 | `The "path" argument must be of type string. Received null` | unchanged | failed later for another reason |
| export | NUL byte | 400 | `No data key registered for project "../<sentinel>\u0000".` | unchanged | failed later for another reason |

Across all eighteen cases no `error` string was a project-id validation message, `userdata` stayed empty, and the throwaway parent gained no entries. In the `enable` cases that reached key registration (every one except relative, where the keyring is also rewritten but the call succeeded), the keyring was rewritten before the later error, i.e. the supplied string was written into the workspace keyring.

### Limits of this measurement

- "Failed later" for `export` rests on the key lookup (`requireSessionKeyring().projectKey(projectId)`) throwing before any read. In the route the joined `path.join(workspaceRoot, projectId)` is evaluated as an argument first; whether it was acted on is not shown, only that no filesystem change occurred. An `export` of the relative value after a prior `enable` with the same value has registered a key for it was NOT run; that sequence is plausible from the enable result above and is unmeasured.
- Contents of `marker.txt` after the relative `enable` were not read back; the change is shown by size (16 B -> 49 B), digest and the new `.encrypted.json`. This is a measurement of an effect, not a statement of what the file now contains.
- The percent-encoded value was a literal string inside JSON; URL-level decoding by a proxy or the route was not exercised (the route takes `projectId` from the body, not the URL).
- Standalone build only; `next dev` not run.

### Verdict for FR-4 / FR-32

A traversal value IS accepted: `enable` with `../<sentinel>` (null and non-null passphrase) built a path outside the workspace and converted a directory there; `enable` with an empty string acted on the workspace root. The route has no `validateProjectId` guard in front of `enable` or `export`. **Task 25 is needed** (guard the encryption route's `projectId`). This is a defect in the shipped route independent of sharing; not fixed in this task. Cause of why the values pass is not named beyond the observation that no validation message was returned; the code read (`route.ts` ~140-220, `enable-encryption.ts` `path.join(workspaceRoot, projectId)`) shows no check before the join, but that is reading, and the measurement above is what is claimed.

### `git status --short` (repo root, after the task)

```
?? specs/features/paired-device-limits/scripts/traversal-experiment.mjs
 M specs/features/paired-device-limits/experiments.md
```

## iii: next dev reachability (context only)

Date: 2026-10-10. Machine: darwin, Node v24.15.0 (not the CI Node 22). Main checkout, branch `feat/paired-device-limits`. No source file changed.

This is context only. It was measured from the host to its own addresses; the second-device case (a different physical device on the home network) was not tested. No cause is named here that was not discriminated by an experiment. The matter is tracked separately and is not fixed here.

### Finding (stated first)

A `next dev` server started the way the desktop app starts it in development mode with sharing off (`HOSTNAME=127.0.0.1`, `GETWRITE_BIND=127.0.0.1`, `GETWRITE_SHARING=0` in its environment) showed a listener on `TCP *:<port>` (IPv6 wildcard socket) in `lsof`, and a request from the host to its own LAN address returned 200 with no `x-getwrite-gate` header, the same as the loopback request. Consistent with Feature 76's observation above. Which part of the startup (the `HOSTNAME` variable, the `next dev` default, or something else) determines the bind was not separated by any experiment, so none is named.

### How the desktop app starts the dev server (read, not run)

`electron/src/main.ts` `startServer` (non-packaged branch): `spawn("pnpm", ["dev"], { cwd: <repo>/frontend, env, shell: true })`, where `env` is `process.env` plus `PORT`, `GETWRITE_PROJECTS_DIR`, `GETWRITE_TEMPLATES_DIR`, `GETWRITE_DESKTOP`, `GETWRITE_REPO`, `GETWRITE_APP_VERSION`, `GETWRITE_WINDOW_SECRET`, `GETWRITE_SHARING_DIR` (= userData) and `buildServerBindEnv(mode)`. `buildServerBindEnv` for a non-effective mode returns `HOSTNAME: "127.0.0.1"`, `GETWRITE_BIND: "127.0.0.1"`, `GETWRITE_SHARING: "0"` (`electron/src/sharing/sharing-mode.ts`). `frontend/package.json` `dev` is `next dev`, with no `-H`/`--hostname` argument.

### Environment the script passed (names only)

Inherited `process.env`, plus: `PORT` (a free port the script chose), `GETWRITE_PROJECTS_DIR` (empty throwaway dir), `GETWRITE_DESKTOP`, `GETWRITE_REPO`, `GETWRITE_APP_VERSION`, `GETWRITE_WINDOW_SECRET` (random, not printed), `GETWRITE_SHARING_DIR` (empty throwaway dir), `HOSTNAME=127.0.0.1`, `GETWRITE_BIND=127.0.0.1`, `GETWRITE_SHARING=0`. Not passed: `GETWRITE_TEMPLATES_DIR` (the script has no packaged templates dir). `DATABASE_URL` and `BETTER_AUTH_SECRET` were not set in the inherited environment (hosted auth inactive). Spawned with `shell: true` as in the app, as its own process group (`detached`).

### Commands and output

Port 3000 checked first: `lsof -iTCP:3000 -sTCP:LISTEN` printed nothing; the script repeats the check and refuses to run if there is a listener. Command: `node specs/features/paired-device-limits/scripts/dev-reachability.mjs`. LAN address found: `10.0.0.226` (first non-internal IPv4). Probe path `/api/projects` (the route Feature 76 used; throwaway empty projects directory, so the body is an empty list, not read).

Output of the run outside the command sandbox (port 61841, group leader pid 61235):

```
{"request":"loopback","status":200,"x-getwrite-gate":"(absent)"}
{"request":"own LAN address","status":200,"x-getwrite-gate":"(absent)"}
process-group members: 61235,61239,61258,61264
pid 61235: no TCP listener
pid 61239: no TCP listener
pid 61258: no TCP listener
lsof -nP -iTCP -sTCP:LISTEN pid 61264:
COMMAND   PID          USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    61264 jedaisaboteur   13u  IPv6 0xb20a68bfa0e0a0b6      0t0  TCP *:61841 (LISTEN)
```

`lsof` was run only for pids in the script's process group (listed with `ps -A -o pid=,pgid=` filtered to the recorded group), not by port.

### What did not go as first run, and what was not run

- First run, inside the command sandbox: the server answered 200 on loopback and on the LAN address (both without `x-getwrite-gate`), then the script failed at `ps` ("spawnSync ps EPERM"), so no `lsof` listing was produced there. The server was stopped by the script's `finally` (second stop attempt: ESRCH, already gone). The listing above is from the second run, which used `dangerouslyDisableSandbox: true` (same reason as in section i). No EMFILE or 404s occurred in this task.
- Not run: a request from a second physical device; a run with sharing on; Node 22; a run without `shell: true`; anything that would separate `HOSTNAME`, the `next dev` default and the shell wrapper as explanations.
- No server left running: after the run, no listener in the 6xxxx range and no `gw-devreach-*` directory in `$TMPDIR`.

### Cleanup and git status

Throwaway directories removed by the script. `git status --short` from the repo root:

```
 M specs/features/paired-device-limits/experiments.md
?? specs/features/paired-device-limits/scripts/dev-reachability.mjs
```

Nothing outside `specs/`.

## Baselines

Date: 2026-10-10. Machine: darwin. Run directly in the main checkout `/Users/jedaisaboteur/Repositories/getwrite`, branch `feat/paired-device-limits`. No server started; `lsof -iTCP:3000 -sTCP:LISTEN` first: no output (exit 1, no listener).

- `git rev-parse --short HEAD`: `b24cc0b5`. `node --version`: `v24.15.0` (volta, the repo pin; CI uses Node 22 for the frontend/Electron jobs and Node 20 for the CLI job).
- Fair-baseline check: `git diff --stat a20b814a HEAD -- . ':!specs'` printed nothing (exit 0). HEAD differs from main's `a20b814a` only under `specs/`, so the main checkout at HEAD is a fair baseline for source.
- Sandbox: every command below ran inside the command sandbox; no retry outside it was needed. The only stderr noise was `WARN Issue while reading "~/.npmrc". EPERM` from pnpm, which did not affect exit status.

### Results

| Command (directory) | Exit | Counts |
| --- | --- | --- |
| `pnpm test:ci` (frontend/) | 0 | 595 files passed, 0 failed; 6046 tests passed, 0 failed, 1 skipped (6047 total) |
| `pnpm typecheck` (frontend/) | 0 | no errors |
| `pnpm lint` (frontend/) | 0 | 0 errors, 395 warnings (7 potentially fixable with `--fix`) |
| `pnpm test` (electron/) | 0 | 23 files passed; 322 tests passed, 0 failed, 0 skipped |
| `pnpm typecheck` (electron/) | 0 | no errors (both `tsc --noEmit` projects) |
| `pnpm knip` (repo root) | 1 | issues below (knip exits 1 when it reports any) |
| `pnpm --filter getwrite-cli test` (repo root) | 0 | 22 files passed; 144 tests passed, 0 failed, 0 skipped; duration 491.70s |

No failing test names: nothing failed. The skipped frontend test was not identified. The CLI run prints `error: missing required argument 'scrivPath'` / `'source'` to stderr from tests that assert on that; the suite passed.

### Node 20

`volta list`: runtime `node@24.15.0` (current, from the repo `package.json`), `pnpm@10.28.0`; default toolchain packages on node 24.15.0. `ls ~/.volta/tools/image/node`: `22.23.2`, `24.15.0`. No Node 20 binary is available, so no run on Node 20 was made and the CLI job on Node 20 is not covered by this record. Frontend/Electron were run on Node 24.15.0, not the CI Node 22 either (22.23.2 is installed but was not used).

### knip (`pnpm knip`, root)

| Section | Count |
| --- | --- |
| Unused files | 53 |
| Unused dependencies | 1 |
| Unused devDependencies | 4 |
| Unlisted dependencies | 6 |
| Unlisted binaries | 4 |
| Unused exports | 167 |
| Unused exported types | 170 |
| Duplicate exports | 14 |
| Configuration hints (not an issue section) | 6 |

Observation: 3 of the 53 unused files are this feature's own experiment scripts under `specs/features/paired-device-limits/scripts/` (`dev-reachability.mjs`, `header-experiment.mjs`, `traversal-experiment.mjs`), so knip does see files under `specs/` here, contrary to the premise in the task list's rules. Excluding them the count at the start of the feature's source work is 50. Compare later runs by set, treating those three as present or absent consistently.

Knip prints long paths shortened with a leading `…` at the terminal width it was run under; the names and line numbers are as printed. Compare by the first column (name) plus the file tail.

The full lists as printed (whitespace squeezed) follow.

```
Unused files (53)
android/harness/harness-entry.ts
android/harness/shims/async_hooks.mjs
android/harness/shims/buffer-inject.mjs
android/harness/shims/fs-promises.mjs
android/harness/shims/fs.mjs
android/harness/shims/path.mjs
demo/demo.spec.ts
demo/playwright.demo.config.ts
demo/screens.spec.ts
demo/seed.mjs
electron/src/preload.ts
frontend/.storybook/fs-shim.mjs
frontend/components/common/UI/Card/index.ts
frontend/components/common/UI/Textarea/index.ts
frontend/scripts/serve-storybook-static.mjs
frontend/src/hooks/use-toast.ts
frontend/src/lib/adapters/placeholderAdapter.ts
frontend/src/lib/api/index.ts
frontend/src/lib/models/native-bootstrap.web-stub.ts
frontend/src/native-shims/async-hooks.mjs
frontend/src/native-shims/fs-promises.mjs
frontend/src/native-shims/fs.mjs
frontend/src/native-shims/path.mjs
frontend/src/store/queries-guards.ts
frontend/src/store/transport/native-compile-backend.web-stub.ts
frontend/src/store/transport/native-editor-config-backend.web-stub.ts
frontend/src/store/transport/native-entity-alias-table-backend.web-stub.ts
frontend/src/store/transport/native-entity-graph-positions-backend.web-stub.ts
frontend/src/store/transport/native-entity-graph-settings-backend.web-stub.ts
frontend/src/store/transport/native-entity-mention-counts-backend.web-stub.ts
frontend/src/store/transport/native-export-backend.web-stub.ts
frontend/src/store/transport/native-feature-config-backend.web-stub.ts
frontend/src/store/transport/native-global-noise-words-backend.web-stub.ts
frontend/src/store/transport/native-mentions-backend.web-stub.ts
frontend/src/store/transport/native-metadata-schema-backend.web-stub.ts
frontend/src/store/transport/native-preferences-backend.web-stub.ts
frontend/src/store/transport/native-project-actions-backend.web-stub.ts
frontend/src/store/transport/native-project-backend.web-stub.ts
frontend/src/store/transport/native-project-types-backend.web-stub.ts
frontend/src/store/transport/native-prose-diagnostics-backend.web-stub.ts
frontend/src/store/transport/native-query-backend.web-stub.ts
frontend/src/store/transport/native-resource-backend.web-stub.ts
frontend/src/store/transport/native-resource-excerpts-backend.web-stub.ts
frontend/src/store/transport/native-revision-backend.web-stub.ts
frontend/src/store/transport/native-search-backend.web-stub.ts
frontend/src/store/transport/native-tags-backend.web-stub.ts
frontend/src/store/transport/native-word-count-goal-backend.web-stub.ts
frontend/tests/integration/refactorParity.ts
frontend/tests/unit/refactor-guardrails/fixtureBuilders.ts
specs/001-ui-getwrite-skeleton/scripts/capture-storybook-screenshots.js
specs/features/paired-device-limits/scripts/dev-reachability.mjs
specs/features/paired-device-limits/scripts/header-experiment.mjs
specs/features/paired-device-limits/scripts/traversal-experiment.mjs
```

```
Unused dependencies (1)
typedoc frontend/package.json:89:6
```

```
Unused devDependencies (4)
@capacitor/filesystem android/package.json:19:6
@better-auth/cli frontend/package.json:93:6
@eslint/eslintrc frontend/package.json:96:6
next-devtools-mcp frontend/package.json:118:6
```

```
Unlisted dependencies (6)
@storybook/react frontend/stories/Common/Listbox.stories.tsx:2:37
@storybook/react frontend/stories/Common/Tabs.stories.tsx:2:37
@storybook/react frontend/stories/Sidebar/controls/Controls.stories.tsx:2:32
@storybook/react frontend/stories/WorkArea/DiffView.stories.tsx:3:32
@storybook/react frontend/stories/WorkArea/ViewSwitcher.stories.tsx:3:37
offbeat-fm-theme.css frontend/styles/saboteur-base.css:2:17
```

```
Unlisted binaries (4)
electron-builder .github/workflows/build-electron.yml
typecheck .github/workflows/frontend-checks.yml
lint .github/workflows/frontend-checks.yml
build .github/workflows/frontend-checks.yml
```

```
Unused exports (167)
registerDoctor function cli/src/commands/doctor.ts:114:17
registerPrune function cli/src/commands/prune.ts:69:17
stopServerByPid function cli/src/commands/qa.ts:468:23
registerQa function cli/src/commands/qa.ts:627:17
registerReindex function cli/src/commands/reindex.ts:42:17
runRepairRevisions function cli/src/commands/repair-revisions.ts:30:23
registerRepairRevisions function cli/src/commands/repair-revisions.ts:68:17
registerScreenshots function cli/src/commands/screenshots.ts:84:17
registerTemplates function cli/src/commands/templates.ts:76:17
defaultRepoRoot function cli/src/qa/report.ts:73:17
QA_SERVER_LOG_FILENAME cli/src/qa/server.ts:47:14
DEFAULT_READY_PROBE_PATHS cli/src/qa/server.ts:184:14
WORKSPACE_FOLDER_NAME electron/src/projects-dir.ts:30:14
WORKSPACE_CONFIG_FILENAME electron/src/projects-dir.ts:184:14
cardVariants frontend/components/common/UI/Card/Card.tsx:39:10
EditContextMenu frontend/components/common/UI/ContextMenu/index.ts:9:21
DialogTrigger frontend/components/common/UI/Dialog/Dialog.tsx:126:3
DialogPortal frontend/components/common/UI/Dialog/Dialog.tsx:127:3
DialogOverlay frontend/components/common/UI/Dialog/Dialog.tsx:128:3
DialogClose frontend/components/common/UI/Dialog/Dialog.tsx:129:3
DialogTrigger frontend/components/common/UI/Dialog/index.ts:3:3
DialogPortal frontend/components/common/UI/Dialog/index.ts:4:3
DialogOverlay frontend/components/common/UI/Dialog/index.ts:5:3
DialogClose frontend/components/common/UI/Dialog/index.ts:6:3
DialogHeader frontend/components/common/UI/Dialog/index.ts:8:3
PopoverClose frontend/components/common/UI/Popover/index.ts:4:3
PopoverClose frontend/components/common/UI/Popover/Popover.tsx:45:35
default variable …ents/Editor/Extensions/StripExternalPasteColor.ts:30:16
toItemKey function …mponents/project-types/ProjectTypeDraftService.ts:77:17
normalizeDefinition function …mponents/project-types/ProjectTypeDraftService.ts:98:17
FileIcon function …end/components/ResourceTree/ResourceTreeIcons.tsx:87:17
TimelineTooltip frontend/components/Timeline/index.ts:2:21
getAdaptiveFormat function frontend/components/Timeline/utils.ts:250:17
resolveOffsetToPosition frontend/components/TipTapEditor.tsx:40:10
TOOLTIP_POINTER_GAP …tityRelationshipGraphView/edgeTooltipPlacement.ts:42:14
TimelineView …nd/components/WorkArea/Views/TimelineView/index.ts:2:21
default function …ents/WorkArea/Views/TimelineView/TimelineView.tsx:44:25
resolveCompileTransport frontend/src/lib/api/compile.ts:155:14
resolveEditorConfigTransport frontend/src/lib/api/editor-config.ts:112:14
resolveEntityAliasTableTransport frontend/src/lib/api/entity-alias-table.ts:105:14
resolveEntityCooccurrenceTransport frontend/src/lib/api/entity-cooccurrence.ts:114:14
httpEntityGraphPositionsTransport frontend/src/lib/api/entity-graph-positions.ts:55:14
resolveEntityMentionCountsTransport frontend/src/lib/api/entity-mention-counts.ts:104:14
resolveEntityRelationshipsTransport frontend/src/lib/api/entity-relationships.ts:281:14
resolveExportTransport frontend/src/lib/api/export.ts:117:14
resolveMentionsTransport frontend/src/lib/api/mentions.ts:142:14
resolvePreferencesTransport frontend/src/lib/api/preferences.ts:93:14
resolveProjectTypesTransport frontend/src/lib/api/project-types.ts:70:14
httpProjectsTransport frontend/src/lib/api/projects.ts:90:14
resolveProjectsTransport frontend/src/lib/api/projects.ts:160:14
resolveProseDiagnosticsTransport frontend/src/lib/api/prose-diagnostics.ts:220:14
resolveResourceExcerptsTransport frontend/src/lib/api/resource-excerpts.ts:85:14
resolveResourcesTransport frontend/src/lib/api/resources.ts:419:14
ApiEditorConfigSchema frontend/src/lib/api/schemas.ts:88:14
ProjectSchema frontend/src/lib/api/schemas.ts:196:14
FolderSchema frontend/src/lib/api/schemas.ts:213:14
LockedProjectListEntrySchema frontend/src/lib/api/schemas.ts:265:14
resolveTagsTransport frontend/src/lib/api/tags.ts:155:14
resolveTrashTransport frontend/src/lib/api/trash.ts:225:14
renameFolderById creator frontend/src/lib/core.ts:28:26
writeTrashRefRecord creator frontend/src/lib/core.ts:41:3
readTrashRefRecord creator frontend/src/lib/core.ts:42:3
purgeResource creator frontend/src/lib/core.ts:48:3
purgeFolder creator frontend/src/lib/core.ts:49:3
PurgeSweepError creator frontend/src/lib/core.ts:50:3
loadMentionIndex creator frontend/src/lib/core.ts:80:3
isDesktopApp desktopBridge function frontend/src/lib/desktop-bridge.ts:265:17
HEADING_FIELD_DEFINITIONS frontend/src/lib/editor-heading-settings.ts:38:14
sanitizeEditorHeading function frontend/src/lib/editor-heading-settings.ts:59:17
default variable frontend/src/lib/models/backlinks-watcher.ts:109:16
default variable frontend/src/lib/models/backlinks.ts:373:16
DESTRUCTIVE_SURVIVING_RATIO frontend/src/lib/models/content-loss.ts:33:14
MIN_WORDS_LOST frontend/src/lib/models/content-loss.ts:42:14
default variable frontend/src/lib/models/diagnostics-index.ts:147:16
resolveEditorConfigProjectRootOrThrow function frontend/src/lib/models/editor-config-core.ts:60:17
default variable frontend/src/lib/models/entity-alias-table.ts:115:16
EntityGraphPositionRecordSchema frontend/src/lib/models/entity-graph-positions.ts:37:14
default variable frontend/src/lib/models/entity-graph-positions.ts:182:16
EntityRelationshipEdgeSchema frontend/src/lib/models/entity-relationships.ts:34:14
default variable frontend/src/lib/models/entity-relationships.ts:254:16
default variable frontend/src/lib/models/entity-shared-metadata.ts:272:16
scanFieldValues function frontend/src/lib/models/field-values.ts:111:23
default variable frontend/src/lib/models/inverted-index.ts:263:16
default variable frontend/src/lib/models/locks.ts:35:16
default frontend/src/lib/models/memoryAdapter.ts:320:16
default variable frontend/src/lib/models/mention-index.ts:116:16
default variable frontend/src/lib/models/mentions-core.ts:624:16
default variable frontend/src/lib/models/meta-locks.ts:42:16
default variable frontend/src/lib/models/metadata-schema.ts:1096:16
rebuildIndexes function …lib/models/plaintext/import-plaintext-project.ts:483:23
previewPath function frontend/src/lib/models/previews.ts:29:17
savePreview function frontend/src/lib/models/previews.ts:37:23
default variable frontend/src/lib/models/previews.ts:109:16
default frontend/src/lib/models/project-config.ts:95:16
default variable frontend/src/lib/models/project-creator.ts:359:16
default frontend/src/lib/models/project-features.ts:143:16
default frontend/src/lib/models/project-view.ts:18:16
default creator frontend/src/lib/models/project.ts:78:16
listResourceIds function frontend/src/lib/models/pruneExecutor.ts:9:23
default function frontend/src/lib/models/pruneExecutor.ts:57:16
ComparisonOpSchema frontend/src/lib/models/query-ast.ts:33:14
TextOpSchema frontend/src/lib/models/query-ast.ts:41:14
default variable frontend/src/lib/models/query-cache.ts:132:16
inspectTemplate creator frontend/src/lib/models/resource.ts:29:3
validateTemplate creator frontend/src/lib/models/resource.ts:30:3
default creator frontend/src/lib/models/resource.ts:38:16
default variable frontend/src/lib/models/revision-manager.ts:82:16
default variable frontend/src/lib/models/revision.ts:390:16
SavedQueryViewSchema frontend/src/lib/models/saved-queries.ts:9:14
default variable frontend/src/lib/models/saved-queries.ts:136:16
QueryASTSchema frontend/src/lib/models/schemas.ts:35:3
ComparisonNodeSchema frontend/src/lib/models/schemas.ts:36:3
InNodeSchema frontend/src/lib/models/schemas.ts:37:3
ExistsNodeSchema frontend/src/lib/models/schemas.ts:38:3
TextNodeSchema frontend/src/lib/models/schemas.ts:39:3
LinksToNodeSchema frontend/src/lib/models/schemas.ts:40:3
LinkedFromNodeSchema frontend/src/lib/models/schemas.ts:41:3
RefNodeSchema frontend/src/lib/models/schemas.ts:42:3
ParamNodeSchema frontend/src/lib/models/schemas.ts:43:3
ComparisonOpSchema frontend/src/lib/models/schemas.ts:44:3
TextOpSchema frontend/src/lib/models/schemas.ts:45:3
MetadataValue frontend/src/lib/models/schemas.ts:84:14
EditorConfigSchema frontend/src/lib/models/schemas.ts:114:14
MetadataFieldTypeSchema frontend/src/lib/models/schemas.ts:131:14
OrganizerCardBodySourceSchema frontend/src/lib/models/schemas.ts:221:14
ResourceTypeSchema frontend/src/lib/models/schemas.ts:368:14
TipTapMarkSchema frontend/src/lib/models/schemas.ts:376:14
TipTapNodeSchema frontend/src/lib/models/schemas.ts:392:14
RevisionSchema frontend/src/lib/models/schemas.ts:505:14
Schemas frontend/src/lib/models/schemas.ts:609:14
ProjectTypeResourceSchema frontend/src/lib/models/schemas.ts:640:14
ProjectTypeFolderSchema frontend/src/lib/models/schemas.ts:651:14
ProjectTypeDefaultFolderSchema frontend/src/lib/models/schemas.ts:662:14
default …/lib/models/scrivener/apply-document-metadata.ts:173:16
default variable …lib/models/scrivener/import-scrivener-project.ts:822:16
default frontend/src/lib/models/sidecar.ts:202:16
default variable frontend/src/lib/models/tags.ts:264:16
default variable frontend/src/lib/models/uuid.ts:52:16
NODE_TYPE_LABELS frontend/src/lib/node-display.ts:26:14
default frontend/src/lib/projectTypes.ts:182:16
default frontend/src/lib/tiptap-utils.ts:71:16
default variable frontend/src/lib/toast-service.ts:122:16
GLOBAL_COLOR_MODE_STORAGE_KEY frontend/src/lib/user-preferences.ts:38:14
getStoredGlobalColorMode function frontend/src/lib/user-preferences.ts:161:17
httpFeatureConfigTransport …end/src/store/feature-config-transport-service.ts:70:14
httpMetadataSchemaTransport …d/src/store/metadata-schema-transport-service.ts:226:14
resolveMetadataSchemaTransport …d/src/store/metadata-schema-transport-service.ts:428:14
httpProjectActionsTransport frontend/src/store/project-actions-controller.ts:100:14
resolveProjectActionsTransport frontend/src/store/project-actions-controller.ts:140:14
changeMetadataFieldType frontend/src/store/projectsSlice.ts:399:14
selectActiveProjectRootPath frontend/src/store/projectsSlice.ts:981:14
httpQueryTransport frontend/src/store/query-transport-service.ts:131:14
resolveQueryTransport frontend/src/store/query-transport-service.ts:173:14
selectQueryState frontend/src/store/querySlice.ts:321:14
resolveRevisionDisplayName function frontend/src/store/revision-normalization.ts:24:17
isRevision function frontend/src/store/revision-normalization.ts:52:17
sortRevisionsDescending function frontend/src/store/revision-normalization.ts:68:17
resolveRevisionTransport frontend/src/store/revision-transport-service.ts:293:14
selectRevisionsState frontend/src/store/revisionsSlice.ts:569:14
selectSearchIsLoading frontend/src/store/searchSlice.ts:123:14
selectSearchErrorMessage frontend/src/store/searchSlice.ts:126:14
store frontend/src/store/store.ts:13:14
default variable frontend/src/store/store.ts:44:16
httpSearchTransport frontend/src/store/transport/search-transport.ts:61:14
stubAppShellFetch function frontend/tests/helpers/appShellFetchStub.ts:66:17
default frontend/tests/unit/helpers/fs-utils.ts:34:16
default frontend/tests/unit/helpers/project-creator.ts:132:16
```

```
Unused exported types (170)
QaSessionRecord interface cli/src/commands/qa.ts:82:18
VerifyStatus type cli/src/qa/verify.ts:34:13
VerifyArtifactKind type cli/src/qa/verify.ts:37:13
WorkspaceRejection type electron/src/projects-dir.ts:187:13
ImportSuccessOutcome interface …rivener-import/handle-import-request.ts:38:18
ImportRefusalUnsupportedOutcome interface …rivener-import/handle-import-request.ts:43:18
ImportRefusalDestinationNotEmptyOutcome interface …rivener-import/handle-import-request.ts:49:18
ImportFatalOutcome interface …rivener-import/handle-import-request.ts:55:18
SelectionHandleTarget interface …c/scrivener-import/selection-handles.ts:23:18
CompileFormat type …mponents/common/CompilePreviewModal.tsx:36:13
ButtonProps interface …/components/common/UI/Button/Button.tsx:39:18
ButtonProps type …end/components/common/UI/Button/index.ts:2:15
CardProps interface …tend/components/common/UI/Card/Card.tsx:15:18
CheckboxProps type …mponents/common/UI/Checkbox/Checkbox.tsx:6:13
CheckboxProps type …d/components/common/UI/Checkbox/index.ts:2:15
ChipProps type …ntend/components/common/UI/Chip/index.ts:2:15
DialogContentProps interface …/components/common/UI/Dialog/Dialog.tsx:29:18
DialogContentProps type …nd/components/common/UI/Dialog/index.ts:13:15
InputProps type …tend/components/common/UI/Input/index.ts:2:15
SelectProps type …end/components/common/UI/Select/index.ts:2:15
SelectProps type …d/components/common/UI/Select/Select.tsx:6:13
TextareaProps type …mponents/common/UI/Textarea/Textarea.tsx:7:13
EntityMatchState type …Extensions/entityHighlightDecoration.ts:82:13
GetWriteImageOptions interface …ents/Editor/Extensions/GetWriteImage.ts:11:18
MediaDropOptions interface …/Editor/Extensions/MediaDropExtension.ts:9:18
EditorMenuColorIconName type …itor/MenuBar/EditorMenuColorSubmenu.tsx:10:15
EditorMenuIconName type …onents/Editor/MenuBar/EditorMenuIcon.tsx:8:15
EditorMenuInputIconName type …ents/Editor/MenuBar/EditorMenuInput.tsx:19:15
ToolbarInputCommand interface …ditor/MenuBar/toolbar-command-schema.ts:48:18
ToolbarColorCommand interface …ditor/MenuBar/toolbar-command-schema.ts:57:18
ToolbarCommandItem type …ditor/MenuBar/toolbar-command-schema.ts:71:13
ResolvedToolbarIconCommand interface …nts/Editor/MenuBar/useToolbarCommand.ts:26:18
ResolvedToolbarInputCommand interface …nts/Editor/MenuBar/useToolbarCommand.ts:35:18
ResolvedToolbarColorCommand interface …nts/Editor/MenuBar/useToolbarCommand.ts:45:18
HelpParagraphBlock interface frontend/components/help/help-content.ts:15:18
HelpHeadingBlock interface frontend/components/help/help-content.ts:20:18
HelpTipCardBlock interface frontend/components/help/help-content.ts:25:18
AppShellResourceActionOptions interface frontend/components/Layout/AppShell.tsx:154:18
ShellProjectTypeLoaderState interface …nents/Layout/ShellProjectTypeLoader.tsx:10:18
RelativeDateValue interface …/components/QueryBuilder/FilterChip.tsx:25:18
RangeValue interface …/components/QueryBuilder/FilterChip.tsx:30:18
ResetOptions interface …ts/QueryBuilder/useQueryBuilderState.ts:34:18
ValuePickerRange type …components/QueryBuilder/ValuePicker.tsx:17:13
ValuePickerRelativeDate type …components/QueryBuilder/ValuePicker.tsx:18:13
ResourceRef type …components/QueryBuilder/ValuePicker.tsx:33:15
RemoveFieldChoice type …chemaManager/DeprecateOrClearDialog.tsx:13:13
ResourceOption type …ebar/controls/MultiResourceRefInput.tsx:13:15
TimelineConfig type frontend/components/Timeline/index.ts:6:3
TimelineProps type frontend/components/Timeline/index.ts:7:3
TimelineTooltipProps type frontend/components/Timeline/index.ts:9:15
RevisionEntry type frontend/components/WorkArea/DiffView.tsx:3:15
SaveStatus type …onents/WorkArea/useCanonicalAutosave.ts:11:13
RevisionContentLoadState type …mponents/WorkArea/useRevisionContent.ts:51:13
ClientRect interface …onshipGraphView/edgeTooltipPlacement.ts:14:18
PositionedNode interface …tionshipGraphView/EntityGraphCanvas.tsx:96:18
PositionedEdge interface …ionshipGraphView/EntityGraphCanvas.tsx:102:18
EntityGraphData interface …phView/EntityRelationshipGraphView.tsx:160:18
FlaggedNoiseTerm interface …s/EntityRosterView/EntityRosterView.tsx:58:18
OrganizerFilterKey type …Views/OrganizerView/organizerFilters.ts:43:13
TimelineViewProps type …nts/WorkArea/Views/TimelineView/index.ts:3:15
TimelineViewProps interface …rea/Views/TimelineView/TimelineView.tsx:11:18
ExportBody interface frontend/src/lib/api/export.ts:10:18
LockedProjectApiEntry interface frontend/src/lib/api/projects.ts:25:18
FileDownloader type …ontend/src/lib/compile/download-file.ts:24:32
CompileFormat type …lib/compile/run-compile-and-download.ts:30:13
TrashRefRecord creator type frontend/src/lib/core.ts:43:8
PurgeStepName creator type frontend/src/lib/core.ts:51:8
ImportScrivenerProjectOptions creator type frontend/src/lib/core.ts:91:8
ImportPlainTextProjectOptions creator type frontend/src/lib/core.ts:108:8
ImportPlainTextProjectResult creator type frontend/src/lib/core.ts:109:8
ImportSuccessOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:35:18
ImportRefusalUnsupportedOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:46:18
ImportRefusalDestinationNotEmptyOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:52:18
ImportFatalOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:58:18
StartDocxImportOptions desktopBridge interface frontend/src/lib/desktop-bridge.ts:81:18
GlobalNoiseWordsSetResult desktopBridge interface frontend/src/lib/desktop-bridge.ts:93:18
DocxImportSuccessOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:99:18
DocxImportRefusalNoDocxFoundOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:109:18
DocxImportRefusalDestinationNotEmptyOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:115:18
DocxImportRefusalUnknownProjectTypeOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:121:18
DocxImportFatalOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:127:18
EditorHeadingFieldDefinition interface …ntend/src/lib/editor-heading-settings.ts:6:18
FileType type …/src/lib/models/capacitor-filesystem.ts:34:13
MediaResourceType creator type …tend/src/lib/models/media-validation.ts:33:13
MediaValidationOk creator interface …tend/src/lib/models/media-validation.ts:46:18
MediaRejectionReason creator type …tend/src/lib/models/media-validation.ts:57:13
MediaValidationError creator interface …tend/src/lib/models/media-validation.ts:60:18
SearchCheckReport interface …rc/lib/models/native-device-harness.ts:174:18
ThroughputCheckReport interface …rc/lib/models/native-device-harness.ts:182:18
MediaSizeThroughputReport interface …rc/lib/models/native-device-harness.ts:197:18
ImageThroughputCheckReport interface …rc/lib/models/native-device-harness.ts:208:18
AudioThroughputCheckReport interface …rc/lib/models/native-device-harness.ts:213:18
RenameCollisionCheckReport interface …rc/lib/models/native-device-harness.ts:218:18
PlainTextTipTapHardBreakNode interface …c/lib/models/plaintext/txt-to-tiptap.ts:46:18
PlainTextTipTapParagraphContentNode type …c/lib/models/plaintext/txt-to-tiptap.ts:52:13
PlainTextTipTapParagraphNode interface …c/lib/models/plaintext/txt-to-tiptap.ts:57:18
ProjectTypeSpecFolder interface …ntend/src/lib/models/project-creator.ts:68:18
ProjectTypeSpecResource interface …ntend/src/lib/models/project-creator.ts:91:18
ProjectTypeSpecDefaultFolder interface …tend/src/lib/models/project-creator.ts:111:18
LoadedResource interface …ontend/src/lib/models/project-loader.ts:23:18
UIResource type frontend/src/lib/models/project-view.ts:6:15
FolderWithResources type frontend/src/lib/models/project-view.ts:6:27
ComparisonOp type frontend/src/lib/models/query-ast.ts:117:13
TextOp type frontend/src/lib/models/query-ast.ts:118:13
ComparisonNode type frontend/src/lib/models/query-ast.ts:120:13
InNode type frontend/src/lib/models/query-ast.ts:125:13
ExistsNode type frontend/src/lib/models/query-ast.ts:126:13
TextNode type frontend/src/lib/models/query-ast.ts:127:13
LinksToNode type frontend/src/lib/models/query-ast.ts:128:13
LinkedFromNode type frontend/src/lib/models/query-ast.ts:129:13
ParamNode type frontend/src/lib/models/query-ast.ts:136:13
CombinatorNode type frontend/src/lib/models/query-ast.ts:146:13
SpliceNode type frontend/src/lib/models/query-ast.ts:147:13
IntrinsicFieldSource type …tend/src/lib/models/query-intrinsics.ts:12:13
ReorderFolderEntry resourceCrudCore interface …d/src/lib/models/resource-crud-core.ts:734:18
ReorderResourceEntry resourceCrudCore interface …d/src/lib/models/resource-crud-core.ts:741:18
TemplateInspection creator type frontend/src/lib/models/resource.ts:31:8
TemplateValidationResult creator type frontend/src/lib/models/resource.ts:32:8
RevisionRepairEntry interface …ntend/src/lib/models/revision-repair.ts:19:18
RevisionRepairSkip interface …ntend/src/lib/models/revision-repair.ts:24:18
SavedQueryView type frontend/src/lib/models/saved-queries.ts:13:13
QueryAST type frontend/src/lib/models/schemas.ts:16:3
LeafNode type frontend/src/lib/models/schemas.ts:17:3
CombinatorNode type frontend/src/lib/models/schemas.ts:18:3
SpliceNode type frontend/src/lib/models/schemas.ts:19:3
ComparisonNode type frontend/src/lib/models/schemas.ts:20:3
ComparisonOp type frontend/src/lib/models/schemas.ts:21:3
InNode type frontend/src/lib/models/schemas.ts:22:3
ExistsNode type frontend/src/lib/models/schemas.ts:23:3
TextNode type frontend/src/lib/models/schemas.ts:24:3
TextOp type frontend/src/lib/models/schemas.ts:25:3
LinksToNode type frontend/src/lib/models/schemas.ts:26:3
LinkedFromNode type frontend/src/lib/models/schemas.ts:27:3
AndNode type frontend/src/lib/models/schemas.ts:28:3
OrNode type frontend/src/lib/models/schemas.ts:29:3
NotNode type frontend/src/lib/models/schemas.ts:30:3
RefNode type frontend/src/lib/models/schemas.ts:31:3
ParamNode type frontend/src/lib/models/schemas.ts:32:3
ProjectTypeDefaultFolder type frontend/src/lib/models/schemas.ts:669:13
ImportPlanFolder interface …c/lib/models/scrivener/binder-mapper.ts:66:18
ImportPlanExclusionReason type …/lib/models/scrivener/binder-mapper.ts:108:13
ImportPlanExcludedItem interface …/lib/models/scrivener/binder-mapper.ts:115:18
ImportPlanNonTextResearchItem interface …/lib/models/scrivener/binder-mapper.ts:132:18
ImportPlanNote interface …/lib/models/scrivener/binder-mapper.ts:144:18
ImportPlanUntitledFallback interface …/lib/models/scrivener/binder-mapper.ts:156:18
ImportReportFieldKeyRename interface …c/lib/models/scrivener/import-report.ts:62:18
ImportReportKeywordMerge interface …c/lib/models/scrivener/import-report.ts:75:18
ImportReportResearchItem interface …c/lib/models/scrivener/import-report.ts:87:18
ImportReportExcludedOtherItem interface …c/lib/models/scrivener/import-report.ts:98:18
ImportReportTrashItem interface …/lib/models/scrivener/import-report.ts:108:18
ImportReportUntitledFallback interface …/lib/models/scrivener/import-report.ts:130:18
UnsupportedCustomMetaDataField interface …lib/models/scrivener/metadata-mapper.ts:40:18
MetadataValueSkip interface …lib/models/scrivener/metadata-mapper.ts:64:18
FieldKeyRename interface …lib/models/scrivener/metadata-mapper.ts:82:18
PlannedKeywordTag interface …lib/models/scrivener/metadata-mapper.ts:95:18
KeywordMerge interface …ib/models/scrivener/metadata-mapper.ts:108:18
KeywordTagPlan interface …ib/models/scrivener/metadata-mapper.ts:118:18
RtfTipTapMark interface …c/lib/models/scrivener/rtf-to-tiptap.ts:82:18
RtfTipTapHardBreakNode interface …c/lib/models/scrivener/rtf-to-tiptap.ts:99:18
RtfTipTapParagraphContentNode type …/lib/models/scrivener/rtf-to-tiptap.ts:104:13
RtfTipTapParagraphNode interface …/lib/models/scrivener/rtf-to-tiptap.ts:109:18
RtfTipTapDocument interface …/lib/models/scrivener/rtf-to-tiptap.ts:126:18
RtfDroppedFeature interface …/lib/models/scrivener/rtf-to-tiptap.ts:132:18
OrganizerCardBodySource creator type frontend/src/lib/models/types.ts:75:13
MetadataInputType creator type frontend/src/lib/models/types.ts:232:13
TipTapMark creator interface frontend/src/lib/models/types.ts:334:18
FetchLike type frontend/src/lib/models/update-check.ts:38:13
SearchFilters type frontend/src/store/searchSlice.ts:10:15
SearchState interface frontend/src/store/searchSlice.ts:12:18
ProjectTypeFolderMetadataSource interface frontend/src/types/project-types.ts:44:18
```

```
Duplicate exports (14)
registerDoctor|default cli/src/commands/doctor.ts
registerPrune|default cli/src/commands/prune.ts
registerQa|default cli/src/commands/qa.ts
registerReindex|default cli/src/commands/reindex.ts
registerRepairRevisions|default cli/src/commands/repair-revisions.ts
registerScreenshots|default cli/src/commands/screenshots.ts
registerTemplates|default cli/src/commands/templates.ts
flushIndexer|waitForDrain frontend/src/lib/models/indexer-queue.ts
bootstrapNativeStorageContext|ensureNativeStorageContext frontend/src/lib/models/native-bootstrap.ts
pruneAllResources|default frontend/src/lib/models/pruneExecutor.ts
Schemas|default frontend/src/lib/models/schemas.ts
toastService|default frontend/src/lib/toast-service.ts
useAppSelector|default frontend/src/store/hooks.ts
store|default frontend/src/store/store.ts
```

```
Configuration hints (6)
frontend knip.json Add entry and/or refine project files in workspaces["fr…
. (root) knip.json Add entry and/or refine project files in workspaces["."…
android knip.json Add entry and/or refine project files in workspaces["an…
…transport/native-trash-backend.web-stub.ts knip.json Remove from ignore
src/getwrite-cli.ts cli knip.json Remove redundant entry pattern
index.js package.json Package entry file not found
 ELIFECYCLE Command failed with exit code 1.
```

### git status

After all runs, `git status --short` from the repo root (before this section was appended it printed nothing; tests left only gitignored output, if any):

```
 M specs/features/paired-device-limits/experiments.md
```

## Owner confirmation at the Task 5 stop

Recorded by the pipeline lead, 2026-10-10, after the owner was shown the results of experiments (i) to (iii) and the baselines. Owner's words: "Fix the defect as suggested, no need for a note if it's fixed now, otherwise, proceed as planned (maybe hold for the merge though)".

1. Experiment (i): the classification reaches a POST route handler in the standalone build and in `next dev`, and a forged client copy did not survive. Route-level enforcement stands; no re-plan.
2. Experiment (ii): a traversal `projectId` is accepted by the encryption route's `enable` action. The owner chose to fix it at once as a separate branch and pull request to `main`, ahead of the rest of this feature, because it is independent of sharing and the route is in released builds. Branch `fix/encryption-project-id-validation`, commit `df62b9fa`, made in a separate worktree from `main`. Task 25 (the conditional fix inside this feature) is therefore satisfied by that pull request once it is merged and brought into this branch; Task 25 then only records that and re-checks the result on this branch.
3. Experiment (iii) and the LAN-address observation in experiment (i) are context only; tracked separately; no fix in this feature.
4. Tasks 6 onward proceed as planned, and are held until the fix's pull request is merged to `main` and merged into this branch.
5. Lead's addition, accepted with the plan at Gate 4: the main-side writer of Task 6 reuses the lock helpers of Feature 76's `electron/src/sharing/device-store-writer.ts` rather than reimplementing the lock protocol a third time.

## Owner decisions at the halt after Tasks 6 to 11

Recorded by the pipeline lead, 2026-10-10. The run halted because the existing Feature 75 test `frontend/tests/unit/sharing-gate-proxy.test.ts` ("imports src/lib/sharing from app/ only in the pairing route") fails once the limited routes import the shared check, as Tasks 10 and 11 require. Owner's words: "resolve, take your rec for the ambiguity".

1. Resolve: that test's allow-list is updated to the four limited route files (`app/api/encryption/route.ts`, `app/api/project/[project-id]/trash/purge/route.ts`, `app/api/project/delete/route.ts`, `app/api/resource/revision/[resource-id]/route.ts`) plus the read route `app/api/sharing/limits/route.ts`. Task 12's walk test owns the tighter rule: those routes may import only the limits check and the limits reader from `lib/sharing`, and no other route may import them.
2. A missing or unparseable classification header is refused for every limited action unconditionally, whatever the limits file says (the fail-closed reading, and what the read route already answers: `paired` with all five true). This supersedes the weaker wording of Task 9 as first built, under which such a request was subject to the limits file. The feature spec's FR-10 wording is to be aligned with this at the documentation stage.

## Built-server verification

Task 26. Date 2026-10-10. Main checkout, branch `feat/paired-device-limits`, `git rev-parse --short HEAD` = `7268dcad`, tree clean at the start. `node --version` = v24.15.0. Recorded by the implementor of Task 26. Hosted-auth variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`): not run (no database); the script unsets them for the servers it starts, and the only coverage of hosted mode is the unit-level `off` case. A missing or unparseable classification header cannot be produced over HTTP through the proxy (it always sets the header), so it is not asserted here; it is unit-covered only (`sharing-limits-check.test.ts`).

### What ran, and where

Everything below ran outside the command sandbox (`dangerouslyDisableSandbox: true`): the builds, both servers, the script and the tests. No run was attempted inside the sandbox first, so this section does not show whether any of these would have worked inside it.

Commands, in order:

1. `lsof -iTCP:3000 -sTCP:LISTEN` printed nothing (exit 1) before each server start in this task.
2. `cd frontend && pnpm build` (exit 0), then `rm -rf frontend/.next/standalone/frontend/.next/static; cp -R frontend/.next/static frontend/.next/standalone/frontend/.next/static`.
3. `cd electron && pnpm build` (`tsc`, exit 0). `electron/dist/sharing/limits-store.js` did not exist before this and exists after. `electron/dist` and `frontend/.next` are gitignored.
4. `node specs/features/paired-device-limits/scripts/verify-limits.mjs standalone`, final run exit 0.
5. `cd frontend && pnpm test:sharing-smoke` against that build, exit 0.
6. `cd frontend && pnpm exec vitest run tests/unit/sharing-gate-enumeration.test.ts tests/unit/sharing-no-device-routes.test.ts`, exit 0, 2 files, 36 tests passed.
7. `node specs/features/paired-device-limits/scripts/verify-limits.mjs dev`, exit 0. It ran after steps 5 and 6 because `next dev` writes into `frontend/.next`.

### What the script does

`scripts/verify-limits.mjs <standalone|dev>` refuses to run if anything listens on port 3000 (the refusal branch itself was not exercised: nothing listened, and no listener was created to test it; read, not run). It creates a throwaway root under `os.tmpdir()` (its real path is asserted to be inside the real temp directory and outside `~/Library/Application Support/getwrite-electron`, which the script never reads or writes), with its own `GETWRITE_PROJECTS_DIR` and `GETWRITE_SHARING_DIR`, a random per-run passphrase held in memory only, and a throwaway encrypted project created through the window. It starts server A (sharing on, window secret) in its own process group on a free loopback port (`next dev` is given `-H 127.0.0.1`; the Task 1 script did not pass that flag), pairs one device by writing `pairing-state.json` and POSTing the code (cookie held in memory), runs items (a) to (d), (f), (g), (h) on it, stops it, then starts server B (sharing off, same throwaway folders, the limits file all five on in its sharing directory) and runs (e). Every change to the limits file goes through the main-side writer `setLimit` from `electron/dist/sharing/limits-store.js` (no deviation). The only other file states are two deliberately unreadable ones that no writer produces: a mode-0 file whose contents say all five are off, and a directory at the file path. Fixtures (projects, resources, revisions, trashed items) are created by the window caller, which is never limited. The script prints request labels, status codes, the gate header value and `limit` keys; it prints no cookie, secret, passphrase or response text. After the run it checked the process groups it recorded (`ps -A -o pid=,pgid=`) and removed the root.

Each limited action has an "applied" probe read through the window or the throwaway filesystem: project directory gone (delete); `isUnlocked` from `GET /api/encryption` (unlock, lock); `.encrypted.json` marker present (enable with a null passphrase); project directory count plus one (export); item gone from the Trash list (purge ids; purge all); the revision no longer readable (revision delete). `resume` has no observable effect on this workspace, so only its status is checked.

### Results (identical in both builds)

Both runs: 195 checks, 195 passed, 0 failed; 119 measured requests (each printed as a `ROW`), 201 setup requests (fixtures, state changes and probes through the window). Per item, passed/total:

| Item | Standalone | `next dev` | What it covers |
| --- | --- | --- | --- |
| setup | 2/2 | 2/2 | throwaway encrypted project created through the window; fixture project has folders |
| (a) | 21/21 | 21/21 | paired device, all five on, 9 actions: 403, body keys exactly `error,limit`, `error` a non-empty string, `limit` equal to the action's key, no `x-getwrite-gate`, no `location`, and the action not applied (8 probes); plus a forged `x-getwrite-classification: window` and `off` on project delete: still 403 `projectDeletion`, project still on disk |
| (b) | 26/26 | 26/26 | for each key, only that key off: its actions return 200 and are applied; one key off does not allow another key's action (`unlocking` off: `lock` still 403; `permanentDeletion` off: project delete still 403); `enable` with a non-null passphrase with all five off: 403 `encryptionChanges`, project not encrypted, with the session unlocked and with it locked; afterwards the original passphrase still unlocks |
| (c) | 51/51 | 51/51 | window caller, 9 actions, three file states (all five on; mode-0 unreadable file; directory at the path): 200 each, applied, no refusal |
| (d) | 41/41 | 41/41 | no cookie, 9 actions with all five on and again with all five off: 401 with `x-getwrite-gate: not-paired`, no `limit` field, not applied; `GET /api/sharing/limits` the same; a made-up cookie on project delete, purge all and `GET /api/sharing/limits`: the same |
| (e) | 22/22 | 22/22 | server B, sharing off, no credentials, file all five on: `GET /api/sharing/limits` is `{role:"exempt"}` (200); 9 actions return 200 and are applied; with the file unreadable, `lock` and project delete still 200 |
| (f) | 10/10 | 10/10 | writer flips: `resume` with `unlocking` on, off, on, off gave 403, 200, 403, 200, each on the very next request, with `GET /api/sharing/limits` reporting the same value on the very next request each time; project delete 403 (project still present) then, after the writer set `projectDeletion` off, 200 (project gone), no restart |
| (g) | 14/14 | 14/14 | `GET /api/sharing/limits`: window `{role:"exempt"}` with no `limits` field and `Cache-Control` containing `no-store`, also with the file unreadable; paired, all on: `{role:"paired"}` and five `true`, `no-store`; paired, mixed file (projectDeletion false, unlocking true, locking false, encryptionChanges true, permanentDeletion false): the five booleans equal the file; file missing: five `true`; file unreadable (mode 0 whose contents say all off; directory): five `true` and `resume` and `lock` still 403; unpaired: 401 not-paired |
| (h) | 8/8 | 8/8 | paired, all five on, not refused (200, no `limit`): `GET /api/encryption`, `GET /api/projects`, Trash list, Trash restore (item restored), resource soft delete (item in Trash), soft delete of a leaf folder (folder in Trash), `GET` revision, `PATCH` revision `{preserve:true}` |

(a) covered `project delete`, `unlock`, `resume`, `lock`, `enable` with a null passphrase, `export`, Trash purge with `{ids}`, Trash purge with `{all:true}` and `DELETE` revision, which is every limited action of FR-11 the spec lists.

### Counts

- Enumeration entries, measured by the walk in `frontend/scripts/sharing-refusal-smoke.mjs` (`enumerated entries: 91` in its output, and 91 from the identical walk copied into `verify-limits.mjs`, whose output includes `GET /api/sharing/limits: true`). The reference was 90, so the new route adds one. The count the Vitest test `sharing-gate-enumeration.test.ts` walks was not printed (it asserts at least 80 and that `GET /api/sharing/limits` appears exactly once and is not an exception); the "before" value is the earlier reference, not re-measured here.
- Smoke checks: `checks: 28; failures: 0` (reference 28). The same 28 hold with the new route enumerated, so the check count did not change; the route is counted in the entries each "every enumerated URL refused" check walks, which `pnpm test:sharing-smoke` reports as 91.
- Exceptions: `ENUMERATED_EXCEPTIONS` is `GET /pair` and `POST /api/sharing/pair`, plus the `/_next/static/` prefix; the test asserts `ENUMERATED_EXCEPTIONS.length + 1` equals `EXCEPTION_COUNT` = 3 and passed.
- `sharing-gate-enumeration.test.ts` and `sharing-no-device-routes.test.ts`: 36 tests passed.

### Defects and surprises, recorded as they happened

1. The first standalone run failed 30 of 195 checks and the second failed 1. The first failures were a bug in this script, not in the product: it used the `project.id` inside `project.json` as the project's directory name, but the API's `projectId` is the directory name and the two differ. The script now takes the directory name from the projects folder listing. The second run's one failure is item 2 below. The two final runs are the ones tabulated above.
2. Soft-deleting a folder that has child folders returned HTTP 404 `Folder not found` in every case tried, on both builds: `ENOENT: no such file or directory, rename '<projects>/<id>/folders/workspace/chapters/chapter-1' -> '<projects>/<id>/.trash/folders/chapter-1'`. Observations (OBS lines, not pass/fail checks), standalone and `next dev` alike: a paired device with all five on, first attempt: 404; the window on a fresh project, first attempt: 404; a paired device on a fresh project whose `.trash/folders` directory was created beforehand, first attempt: 404. So the 404 did not depend on the caller or on that directory's absence, and it carries no `limit` key and no gate header. A leaf folder soft-deletes with 200 for the paired device. This is a response of the existing folder soft-delete route on the `novel` project type's folder tree; the cause was not established (the experiment that would settle it is to repeat the call on the `main` branch's build and read `softDeleteFolder` against the `folders/` layout `createProjectFromType` writes). No product source was changed.
3. The final item (h) therefore checks a leaf folder; that is a narrower check than "folder soft delete" for a folder with children.
4. Not asserted or not run: hosted-auth (no database); the missing or unparseable classification header (unit-covered); the port-3000 refusal branch; the `.local` and non-loopback `Host` paths (every request used `127.0.0.1`); a second device or a real phone; the client UI (Task 27).

### Cleanup

After each run the script reported `process-group members still alive after stop: none` and `throwaway root removed: true`. After the last run: `lsof -iTCP -sTCP:LISTEN` showed no node or next listener, `ps` showed no `next dev` or `standalone/frontend/server.js` process, no `gw-limits-*` folder remained under the temp directory, and `git status --short` showed only `?? specs/features/paired-device-limits/scripts/verify-limits.mjs` (plus this file and `tasks.md` once edited).
