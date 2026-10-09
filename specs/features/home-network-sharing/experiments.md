# Home-network sharing: experiments

## A: proxy.ts and header behaviour in a standalone build

Run 2026-10-09, macOS (Darwin 25.5.0), Next.js 16.2.6 (as printed by the standalone server), inside the Claude Code OS sandbox. Every command below was run from `frontend/` of a git worktree unless stated. Nothing here names a cause the runs did not discriminate; where a result is only an observation, it is marked as such.

### Setup as run (and how it differs from the packaged layout)

- `node_modules` in the worktree root was a symlink to the main checkout's `node_modules` (it was already present, untracked, before this task started); `frontend/node_modules` was symlinked to the main checkout's `frontend/node_modules` for this task and removed afterwards.
- Throwaway files (deleted at the end): `frontend/proxy.ts`, `frontend/app/api/spike-echo/route.ts`, `frontend/src/lib/spike-state.ts`.
  - `proxy.ts`: `export function proxy(request: NextRequest)`, increments `spikeState.count` (imported from `./src/lib/spike-state`), appends one JSON line (pathname, method, `x-forwarded-for`, `host`, `x-forwarded-host`, `origin`, `referer`, `sec-fetch-dest`, `proxyCounter`) with `appendFileSync` to `process.env.SPIKE_LOG`, returns `NextResponse.next()`. Convention name and function name taken from `frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
  - `/api/spike-echo` (GET, `force-dynamic`): returns the same headers as JSON plus `routeSeesCounter` (= `spikeState.count` read in the route).
- LAN address: `ipconfig getifaddr en0` failed in the sandbox (`ipconfig_server_port failed (os/kern) unknown error code (44c)`). `ifconfig` worked and showed `inet 10.0.0.226 netmask 0xffffff00 broadcast 10.0.0.255` on `en0`. `10.0.0.226` is used below. Requests to it from curl on the same machine were not blocked by the sandbox.
- Ports 4817 and 4818 were used (checked free with `lsof`); port 3000 was not touched.

### (1) Build

Command (no matcher variant): `cd frontend && pnpm build` at Fri Oct 9 12:21:00 MDT 2026, inside the sandbox. Exit status `0`. The route table ends with `ƒ Proxy (Middleware)` and lists `ƒ /api/spike-echo`. First output lines included `WARN Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM: operation not permitted` and a Next warning: `We detected multiple lockfiles and selected the directory of /Users/jedaisaboteur/Repositories/getwrite/pnpm-workspace.yaml as the root directory.`

Build output for the proxy:

- `ls .next/server | grep -i "proxy\|middleware"` printed: `middleware`, `middleware-build-manifest.js`, `middleware-manifest.json`, `middleware.js`, `middleware.js.map`, `middleware.js.nft.json`. There is no file named `proxy*` in `.next/server`; the proxy is emitted under the `middleware` names. `.next/server/middleware.js` is 223 bytes (a Turbopack loader), and the string `SPIKE_LOG` is present in `.next/server/chunks/[root-of-the-server]__06paich._.js`.
- `.next/server/middleware-manifest.json` and `.next/server/middleware/middleware-manifest.json` both contain `"middleware": {}` and `"sorted_middleware": []`/`"sortedMiddleware": []`, even though the proxy ran at request time (see (3)). Observation only; not investigated.
- Standalone layout observed: `.next/standalone/frontend/` contained only `node_modules`, and `server.js` was at `.next/standalone/.claude/worktrees/agent-a89ab57bebddae337/frontend/server.js`, i.e. the output was nested under the path from the main checkout root. The Next warning above said the inferred workspace root was the main checkout's `pnpm-workspace.yaml`. This is the layout in this worktree; it is not the `standalone/frontend/server.js` layout `electron/src/main.ts` expects, which was therefore not reproduced here. Under that nested directory, `.next/server/` contained `middleware.js`, `middleware-build-manifest.js`, `middleware-manifest.json` and `middleware/`, `proxy.ts` was copied next to `server.js`, and `SPIKE_LOG` was present in the same chunk file name. Whether the packaged (`standalone/frontend`) layout behaves the same was not measured.

### (2) Standalone server start

Static assets copied first (the `electron-builder.yml` `extraResources` step): `cp -R .next/static <standalone-frontend-dir>/.next/static`, where `<standalone-frontend-dir>` is the nested directory above. Then, from that directory:

`SPIKE_LOG=$TMPDIR/spike1.log PORT=4817 HOSTNAME=0.0.0.0 node server.js`

Output:

```
(eval):1: nice(5) failed: operation not permitted
▲ Next.js 16.2.6
- Local:         http://localhost:4817
- Network:       http://0.0.0.0:4817
✓ Ready in 0ms
Couldn't load fs
Couldn't load zlib
```

The `Couldn't load fs` / `Couldn't load zlib` lines appeared on every start; not investigated. Requests returned HTTP 200 (below), so the server was reachable on both `127.0.0.1` and `10.0.0.226`.

### (3) and (4) Which requests the proxy saw

Matcher variants: (a) no `config` export; (b) `export const config = { matcher: ["/((?!_next/static).*)"] }`. Variant (b) was a second `pnpm build` (Fri Oct 9 12:22:06 MDT 2026, exit `0`, `ƒ Proxy (Middleware)` in the route table) and a new server on port 4818. The asset requested was `/_next/static/chunks/0-0p2~uad-eg~.js` (a file that exists in `.next/static/chunks`). Each request was `curl -s -o /dev/null -w "%{http_code}"` against the server.

| Path | HTTP status | (a) no matcher: proxy logged it | (b) matcher excluding `_next/static`: proxy logged it |
|---|---|---|---|
| `/api/auth-status` | 200 | yes (log line 1) | yes (log line 1) |
| `/` | 200 | yes | yes |
| `/login` | 200 | yes | yes |
| `/_next/static/chunks/0-0p2~uad-eg~.js` | 200 | yes (log line 4, `proxyCounter` 4) | no (log went `/`, `/login`, then `/api/spike-echo`; no `_next/static` line) |

Variant (a) log for the four requests (127.0.0.1 target, `$TMPDIR/spike1.log`) began:

```
{"pathname":"/api/auth-status","method":"GET","x-forwarded-for":"127.0.0.1","host":"127.0.0.1:4817","x-forwarded-host":"127.0.0.1:4817","origin":null,"referer":null,"sec-fetch-dest":null,"proxyCounter":1}
```

Observation: with no matcher the proxy ran for the API route, both pages and the static asset; with the stated matcher it ran for all but the static asset.

### (5) Forged `X-Forwarded-For` (variant (a) server, port 4817, target `10.0.0.226`)

Commands and the values seen (proxy log line / echo route response):

| Request | `x-forwarded-for` seen by proxy | seen by echo route |
|---|---|---|
| `curl http://10.0.0.226:4817/api/spike-echo` (no header) | `10.0.0.226` | `10.0.0.226` |
| `curl -H 'X-Forwarded-For: 127.0.0.1' http://10.0.0.226:4817/api/spike-echo` | `127.0.0.1` | `127.0.0.1` |
| `curl -H 'X-Forwarded-For: 1.2.3.4' http://127.0.0.1:4817/api/spike-echo` | `1.2.3.4` | `1.2.3.4` |

Raw echo output for the forged request: `{"x-forwarded-for":"127.0.0.1","host":"10.0.0.226:4817","x-forwarded-host":"10.0.0.226:4817","origin":null,"referer":null,"routeSeesCounter":0}`.

Also from (3): a request with no `X-Forwarded-For` to `127.0.0.1` was seen as `127.0.0.1`. So in this build, with no header sent the server supplied the connection's address; with a header sent, the client's value reached both the proxy and the route unchanged. This matches the spec's "Read, not run" reading of `base-server.js:577` as to behaviour; the source line itself was not re-read in this task.

### (6) Host-related headers (variant (a), port 4817, `Host` etc. as sent)

| Request headers sent (target `10.0.0.226:4817`) | `host` | `x-forwarded-host` | `origin` | `referer` | same at proxy and route |
|---|---|---|---|---|---|
| `Host: 10.0.0.226:4817`, `X-Forwarded-Host: other.example`, `Origin: http://evil.example`, `Referer: http://evil.example/x` | `10.0.0.226:4817` | `other.example` | `http://evil.example` | `http://evil.example/x` | yes |
| `Origin: http://10.0.0.226:4817`, `Referer: http://10.0.0.226:4817/` | `10.0.0.226:4817` | `10.0.0.226:4817` | `http://10.0.0.226:4817` | `http://10.0.0.226:4817/` | yes |
| `Host: foo.example:4817` only | `foo.example:4817` | `foo.example:4817` | null | null | yes |
| `X-Forwarded-Host: other.example` only | `10.0.0.226:4817` | `other.example` | null | null | yes |

Observation: with no `X-Forwarded-Host` sent, the server set it equal to `Host`; a client-sent `X-Forwarded-Host` was passed through unchanged; `host` was not altered by it. `Origin` and `Referer` were passed through unchanged. The proxy and the route saw identical values in all four requests.

### (7) Module state shared between proxy and route

Variant (a): proxy log `proxyCounter` reached 11 over 11 requests; the echo route returned `"routeSeesCounter":0` in all 7 echo responses. Variant (b): `proxyCounter` reached 9 over 9 logged requests; the echo route returned `"routeSeesCounter":0` in all 6 responses. In both runs the counter incremented in `src/lib/spike-state.ts` by the proxy was not visible to the route. The runs did not discriminate why (the Next docs say not to rely on shared modules or globals with proxy).

### (8) Implications the spec states, against these observations

- FR-8/FR-9 (one interception layer if it covers API, page and asset): in the standalone server run here, the proxy covered the API route, both pages and the static asset with no matcher, and a matcher can exclude the asset. Per the spec's rule this supports one interception layer in `proxy.ts`. Not measured: the packaged `standalone/frontend` layout; the native static export (that is experiment B); behaviour of POST requests, WebSocket or streaming responses.
- FR-9 state sharing: because module-level state set in the proxy was not visible to the route (7), anything the gate needs to share with routes cannot be assumed to travel through a module variable in this build; it was not measured whether headers set by the proxy reach routes.
- FR-12 (a client-supplied `X-Forwarded-For` cannot identify the window): refuted for the raw header in this build. A client-supplied `X-Forwarded-For: 127.0.0.1` from the LAN address arrived at both the proxy and the route as `127.0.0.1`, so a loopback test on that header's value can be forged. The connection's own address as seen by Next was not available from a source other than this header in these runs.
- FR-29's same-origin comparison: `host` was the value the client sent in `Host` and was not changed by `X-Forwarded-Host`; `X-Forwarded-Host` is client-forgeable and, when absent, equals `Host`. `Origin` and `Referer` were client-supplied values passed through.

### Cleanup and final state

Both servers were killed (PID 20692, then PID 23863; the first `kill` inside the sandbox failed with `kill:1: kill 20692 failed: operation not permitted`, so each kill of that own server was run with the sandbox disabled, on that PID only). After the runs `lsof -iTCP:4818 -sTCP:LISTEN` listed nothing. The three throwaway files were deleted and `frontend/node_modules` symlink removed. `frontend/.next` is ignored (`.gitignore:2:.next/`).

`git status --short` run at the worktree root:

```
?? node_modules
?? specs/features/home-network-sharing/experiments.md
```

## C: preparation

Prepared 2026-10-09 by Task 3 (an agent, inside the Claude Code OS sandbox). This section contains the patch, what was verified about it, and the steps for the owner to run Task 4. No result of the experiment itself is recorded here; nothing was launched.

### The patch

File: `specs/features/home-network-sharing/experiments/oq1-window-secret.patch` (a `git diff`, not applied). It changes:

- `electron/src/main.ts`:
  - imports `session` from `electron` and `crypto` from `crypto`;
  - `const SPIKE_SECRET = crypto.randomBytes(32).toString("hex")` at module level;
  - in `startServer`, the server env gets `HOSTNAME: process.env.SPIKE_HOSTNAME ?? "127.0.0.1"` (the default stays `127.0.0.1`) and `GETWRITE_SPIKE_SECRET: SPIKE_SECRET`;
  - in `app.whenReady`, before `resolveDirectories()` and `openMainWindow()`: `session.defaultSession.webRequest.onBeforeSendHeaders` for `http://localhost:3000/*` adding header `x-getwrite-spike: <secret>`, and `session.defaultSession.cookies.set` of cookie `getwrite_spike=<secret>` for `http://localhost:3000`. A failed cookie set writes `spike cookie set failed: <error>` to the app log (the error, never the secret).
- `frontend/proxy.ts` (new, throwaway): `export function proxy(request: NextRequest)`, no `config` export (so no matcher, as in the section A (a) variant). If `process.env.SPIKE_LOG` is set it appends one JSON line per request with keys `pathname`, `method`, `sec-fetch-dest`, `sec-fetch-mode`, `headerPresent`, `headerMatches`, `cookiePresent`, `cookieMatches`, `x-forwarded-for`. The secret is read from `GETWRITE_SPIKE_SECRET` only to compare; the log holds booleans, never the value.

### What was verified in Task 3, and what was not

Verified (on a worktree whose tracked tree was clean; `node_modules` symlinked from the main checkout for `frontend/` and `electron/`, removed afterwards):

- `git apply --check specs/features/home-network-sharing/experiments/oq1-window-secret.patch`: exit 0, no output.
- After `git apply`, `git status --short` showed ` M electron/src/main.ts` and `?? frontend/proxy.ts` (plus the untracked `specs/` files and the pre-existing `node_modules` symlink).
- `pnpm typecheck` in `electron/` (`tsc --noEmit && tsc --noEmit --project tsconfig.worker.json`): exit 0, no diagnostics. `pnpm typecheck` in `frontend/` (`tsc --noEmit`): exit 0, no diagnostics. Both printed only the pnpm warning `WARN  Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM: operation not permitted`.
- After `git apply -R`, `git status --short` showed only `?? node_modules` (pre-existing symlink) and `?? specs/features/home-network-sharing/experiments/`. No change outside `specs/`.

Not run, left to Task 4: `pnpm build`, `electron-builder`, launching Electron, any request to the server. So it is not known whether the patched app starts, whether `proxy.ts` is picked up in the packaged `standalone/frontend` layout, or how the packaged build behaves at runtime. Typechecking does not exercise `onBeforeSendHeaders` or `cookies.set`.

### Run steps for the owner (Task 4)

Run these in the main checkout, from the repo root, with the tracked tree clean. Build in the main checkout, not a worktree: section A observed that a build inside a worktree nests `server.js` away from `standalone/frontend/server.js`, which is the path `electron/src/main.ts` forks.

1. Apply the patch:

```
git apply --check specs/features/home-network-sharing/experiments/oq1-window-secret.patch && git apply specs/features/home-network-sharing/experiments/oq1-window-secret.patch
git status --short
```

Expected: ` M electron/src/main.ts` and `?? frontend/proxy.ts`.

2. Build the frontend (writes `frontend/.next/standalone`, gitignored), then the Electron main process, the workers, and an unpacked app:

```
pnpm --filter getwrite-frontend build
cd electron
pnpm build && pnpm build:worker && pnpm exec electron-builder --config electron-builder.yml --dir
cd ..
```

3. Locate the app. `electron-builder.yml` sets `directories.output: ../dist-electron`, i.e. `dist-electron/` at the repo root (gitignored). With `--dir` on macOS the unpacked app is in a per-arch subdirectory; list it for the exact name on your machine:

```
ls dist-electron
```

Expected on Apple silicon: `dist-electron/mac-arm64/GetWrite.app` (Intel: `dist-electron/mac/GetWrite.app`; this is electron-builder's usual naming, not observed in this task). The binary is `<that .app>/Contents/MacOS/GetWrite`. The commands below assume `mac-arm64`.

4. Quit any running GetWrite first (the app holds a single-instance lock; a second launch hands off to the first and starts no new server). Port 3000 must be free: `lsof -iTCP:3000 -sTCP:LISTEN` should print nothing.

5. Run 1, loopback bind (default). Launch from a terminal so the environment reaches the forked server (the server env is built from `...process.env` in `startServer`):

```
export SPIKE_LOG="$TMPDIR/oq1-loopback.log"; rm -f "$SPIKE_LOG"
"dist-electron/mac-arm64/GetWrite.app/Contents/MacOS/GetWrite"
```

If macOS refuses to open the unsigned local build, allow it in System Settings > Privacy & Security, or (if it carries a quarantine attribute) run `xattr -dr com.apple.quarantine dist-electron/mac-arm64/GetWrite.app` and launch again.

6. Actions in the window, in this order (run `wc -l "$SPIKE_LOG"` from another terminal after each, to read the log against the actions):
   1. Cold load: wait for the Start page.
   2. Open a project.
   3. Edit text in a resource (type a few words, wait a few seconds for autosave).
   4. Switch views (Edit, Data, Entities, Graph, Trash tabs as available).
   5. Open App Settings from the Start page (close the project first if needed), then close it.
   6. Reload the window once if the menu offers it (Cmd+R), then quit with Cmd+Q.

7. Summarise the log (counts per `sec-fetch-dest`/`sec-fetch-mode` and header/cookie presence; plain Node, no `jq` needed):

```
node -e '
const lines = require("fs").readFileSync(process.env.SPIKE_LOG, "utf8").trim().split("\n").map((s) => JSON.parse(s));
const t = {};
for (const l of lines) {
  const k = [l["sec-fetch-dest"], l["sec-fetch-mode"], "hdr:" + l.headerPresent + "/" + l.headerMatches, "cookie:" + l.cookiePresent + "/" + l.cookieMatches].join("  ");
  t[k] = (t[k] || 0) + 1;
}
console.log("total", lines.length);
console.table(t);
console.log("neither header nor cookie:", lines.filter((l) => !l.headerPresent && !l.cookiePresent).map((l) => l.pathname + " [" + l["sec-fetch-dest"] + "]"));
'
```

`hdr:a/b` is header present / header equals the server's secret; `cookie:a/b` likewise.

8. Run 2, non-loopback bind. Same as run 1 with a new log and `SPIKE_HOSTNAME=0.0.0.0`:

```
export SPIKE_LOG="$TMPDIR/oq1-lan.log"; rm -f "$SPIKE_LOG"
SPIKE_HOSTNAME=0.0.0.0 "dist-electron/mac-arm64/GetWrite.app/Contents/MacOS/GetWrite"
```

With the window up (confirm it still loads `http://localhost:3000`), find the LAN address (`ifconfig en0 | grep 'inet '`), then from the second device send the following (replace `<lan-ip>`; `/api/projects` is a project-data route):

```
curl -i http://<lan-ip>:3000/
curl -i http://<lan-ip>:3000/api/projects
curl -i -H 'X-Forwarded-For: 127.0.0.1' http://<lan-ip>:3000/api/projects
curl -i -H 'x-getwrite-spike: not-the-secret' -H 'Cookie: getwrite_spike=not-the-secret' http://<lan-ip>:3000/api/projects
```

From a phone only the first two are practical (open `http://<lan-ip>:3000/` and `http://<lan-ip>:3000/api/projects` in its browser); the forged-header requests need a second computer, otherwise record them as not run from a second device. Do not substitute a request from the host for the second-device requests. Then, from the host:

```
curl -4 -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -6 -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

Run the step 7 summary on `oq1-lan.log`, then quit the app.

9. Run 3, unpackaged `next dev` and `HOSTNAME` (Task 4 item 5; outside the sandbox, with the run 2 app quit and port 3000 free):

```
cd frontend
HOSTNAME=0.0.0.0 pnpm dev
```

Then from another device (or the machine's LAN address) run `curl -i http://<lan-ip>:3000/api/auth-status`. Record whether it connects. Stop the server with Ctrl-C and `cd ..`.

10. Reverse the patch and check:

```
git apply -R specs/features/home-network-sharing/experiments/oq1-window-secret.patch
git status --short
```

Expected: no change outside `specs/` (`frontend/proxy.ts` removed, `electron/src/main.ts` restored). `electron/dist/`, `dist-electron/` and `frontend/.next/` are gitignored build output and may remain.

### Observations Task 4 must record (counts and pasted output, not impressions; never paste the secret)

1. From `oq1-loopback.log`: for each `sec-fetch-dest` value seen (`document`, `empty`, `script`, `style`, `image`, `font`, any other; and `sec-fetch-mode` where it differs), the number of requests, and how many carried the header, the correct header, the cookie, the correct cookie.
2. Whether any request kind from the window arrived with neither header nor cookie (the "neither" list from step 7, with paths).
3. Whether the cookie set succeeded: search the app log (`app.getPath("logs")/getwrite.log`; the app logs its resolved paths at start) for `spike cookie set failed`. Also whether the earliest requests in the log lack the cookie.
4. Run 2, from the second device: for the plain page and API requests and the forged `X-Forwarded-For: 127.0.0.1` and made-up header/cookie requests, what the proxy log lines show (`headerPresent`, `headerMatches`, `cookiePresent`, `cookieMatches`, `x-forwarded-for`) and what the device received (status, body shape). Say which requests came from which device.
5. Run 2: whether the window still loads `http://localhost:3000`, and the pasted output of `curl -4` and `curl -6` to `localhost`. Record the result without naming a cause.
6. Run 3: whether `HOSTNAME=0.0.0.0 pnpm dev` accepted a connection on the LAN address (spec OQ-3a), with the output.
7. That the patched build started at all, and whether the packaged `standalone/frontend` layout wrote a proxy log. An empty or missing `$SPIKE_LOG` after the actions means the proxy wrote nothing there; record that and do not guess why.
8. The implication per the spec (OQ-1): header covers all kinds, use the header; header misses some, use the cookie; neither covers every kind, stop and report, naming the two unchosen fallbacks (a thin launcher that overwrites the address header from the real socket, and a second loopback listener).
9. The reversal and the final `git status --short`.
