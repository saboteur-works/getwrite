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
