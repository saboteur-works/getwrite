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
