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
