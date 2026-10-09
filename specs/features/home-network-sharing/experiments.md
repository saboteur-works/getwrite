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

## B: native export build with proxy.ts

Run 2026-10-09, macOS (Darwin 25.5.0), inside the Claude Code OS sandbox, from `frontend/` of a git worktree (`frontend/node_modules` was a temporary symlink to the main checkout's, removed afterwards). Nothing outside the sandbox was used. No cause is named below unless a run discriminated it. Before the first run there was no `frontend/out/`, no `frontend/.native-build/` and no `frontend/proxy.ts`, so stale output cannot confuse the searches.

### What `build-native-static.mjs` copies (as read, not run-derived)

It builds `frontend/.native-build/` by iterating the top-level entries of `frontend/`. Skipped entirely: `.next`, `out`, `.native-build`. Physically copied: `app/` (then `api`, `login`, `reset-password`, `verify-email`, `project-types` are removed from the copy only), `package.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`. Every other top-level entry, files included, is symlinked into the shadow root. `proxy.ts` is not in the copy list, so it is symlinked. `next build` then runs with `cwd` = the shadow root, `GETWRITE_BUILD_TARGET=native`, `NEXT_PUBLIC_GETWRITE_RUNTIME=native`, `GETWRITE_TEMPLATES_DIR=<repo>/getwrite-config/templates/project-types`, and `distDir: "../out"` from `next.config.mjs`.

### (1) Control run, no `proxy.ts`

`cd frontend && pnpm build:native`, Fri Oct 9 12:24:04 MDT 2026 to 12:24:15. Exit status `1` (repeated at 12:26:12 with the same result). The Next compile step printed `✓ Compiled successfully in 3.6s`, then:

```
  Running TypeScript ...
Failed to type check.

./stories/Start/CreateProjectModal.stories.tsx:6:8
Type error: Cannot find module '../../../frontend/components/Start/CreateProjectModal' or its corresponding type declarations.
...
Next.js build worker exited with code: 1 and signal: null
[build-native-static] ERROR: `next build` exited with status 1.
 ELIFECYCLE  Command failed with exit code 1.
```

`frontend/out/` did not exist afterwards. The error is a type error, not a sandbox-shaped error (no EPERM or "operation not permitted" in the build output other than the `.npmrc` read warning that every `pnpm` call in this sandbox prints), so no retry outside the sandbox was made. Observations only: `frontend/.native-build/stories` is a symlink to `frontend/stories` (per the script), and the failing import is a relative path (`../../../frontend/components/...`) written in `frontend/stories/`. The runs did not test whether either fact is the cause, and did not run the same build in the main checkout.

So the build as written does not complete in this worktree, with or without `proxy.ts`.

### (2) Same build with `frontend/proxy.ts`

First version: `proxy()` returned `NextResponse.next()` and held `"SPIKE-PROXY-MARKER"` only in an unused local. Second version (used for the results below): `const response = NextResponse.next(); response.headers.set("x-spike", "SPIKE-PROXY-MARKER"); return response;`, because the string in the first version was observed not to appear in the emitted JS (see (4)).

`pnpm build:native`: Fri Oct 9 12:24:40 MDT 2026, exit `1`; second version Fri Oct 9 12:25:35 MDT 2026, exit `1`. In both, the output was the same as the control: `✓ Compiled successfully`, then the same `Failed to type check` error in `./stories/Start/CreateProjectModal.stories.tsx:6:8`. `frontend/out/` did not exist afterwards. The first lines of the failure were therefore identical to the control's; the proxy file did not change the outcome of the script as run.

### (3) Does the shadow root contain `proxy.ts`

`ls -la frontend/.native-build/proxy.ts` after the with-proxy run: `lrwxr-xr-x ... .native-build/proxy.ts -> /Users/jedaisaboteur/Repositories/getwrite/.claude/worktrees/agent-aa93d7769971cdef2/frontend/proxy.ts`, i.e. a symlink to `frontend/proxy.ts`, as the script's symlink-everything-else rule predicts. After the control run (proxy.ts deleted) `ls -a .native-build | grep -i proxy` printed nothing.

### Supplementary runs (not the script as written)

Because both script runs stop at the type check, `frontend/out/` was never produced, so (4) could not be answered from them. To get an `out/` I ran, after each failed script run, the same `next build` the script runs, by hand, in the freshly assembled shadow root, with one change to the shadow copy only: `"stories"` added to `exclude` in `frontend/.native-build/tsconfig.json` (the script's own copy; `frontend/tsconfig.json` and the script were not edited). Command, with the script's environment:

`cd frontend/.native-build && GETWRITE_BUILD_TARGET=native NEXT_PUBLIC_GETWRITE_RUNTIME=native GETWRITE_TEMPLATES_DIR=<repo>/getwrite-config/templates/project-types ./node_modules/.bin/next build`

- With `proxy.ts` (first version): 2026-10-09 12:25:09 to 12:25:20, exit `0`. The route table ended with `ƒ Proxy (Middleware)` and the output included `⚠ Statically exporting a Next.js application via 'next export' disables API routes and middleware.`
- With `proxy.ts` (second version): 12:25:53 to 12:26:05, exit `0`.
- Control (no `proxy.ts`, script rerun to rebuild the shadow root, then the same hand command): 12:26:27 to 12:26:38, exit `0`; no `Proxy` line in its output.

So with the type-check obstacle removed from the shadow tsconfig only, the build exits 0 with and without `proxy.ts`.

### (4) Search of `frontend/out/` (supplementary runs)

- `grep -rl "SPIKE-PROXY-MARKER" out`: no match, exit `1`, in both with-proxy runs. In the first version the marker was also not in the emitted server JS; in the second version it was found in `frontend/.native-build/.next/server/chunks/[root-of-the-server]__0dplkwz._.js` (and its `.map`), and not in `out/`.
- `find out -iname "*proxy*" -o -iname "*middleware*"`: with proxy, `out/_next/static/wgy-P_wCWYA0DtK7vgcgp/_clientMiddlewareManifest.js`; control, `out/_next/static/Oke7wZuUVBE3MYf95NNrr/_clientMiddlewareManifest.js`. No file named `proxy*`.
- Contents, with proxy (first version): `self.__MIDDLEWARE_MATCHERS = [ { "regexp": "^.*$", "originalSource": "/:path*" } ];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()`. Contents, control: `self.__MIDDLEWARE_MATCHERS = [];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()`.
- File lists of `out/` (179 files each) differed only in the build-id directory name (`wgy-P_wCWYA0DtK7vgcgp` vs `Oke7wZuUVBE3MYf95NNrr`); every other path was identical (`diff` of the sorted `find out -type f` lists).
- `grep -rli proxy out` matched 34 files with the proxy present; the matches were not inspected. The control's count was not taken.

### (5) Implication, per the spec

- The build as written (`pnpm build:native`) failed identically with and without `proxy.ts` in this worktree, at a TypeScript error in `stories/`, so `proxy.ts` is not shown here to break it. The failure is pre-existing in this worktree and was not caused by this experiment; its cause was not established.
- Where the build could be completed (supplementary, shadow tsconfig edited), `proxy.ts` did not break it, and no proxy code or marker reached `out/`. One proxy-related artefact did: the client file `_clientMiddlewareManifest.js` exists in `out/` in both runs, with a matcher entry only when `proxy.ts` is present. It is an inert manifest, not the proxy function; the runs did not test whether anything reads it in the Capacitor WebView.
- Per the spec's rule this reads as "clean" for the native export on the supplementary evidence, with the caveat above. No exclusion in `build-native-static.mjs` was needed or tried; Task 6 (or whichever task adds `frontend/proxy.ts`) should not rely on the script building successfully until the `stories/` type error is dealt with, or should name it as a separate pre-existing problem.
- Not measured: the same build in the main checkout (so whether the `stories/` failure is specific to this worktree is unknown); the Capacitor/Android runtime; `pnpm build:native` outside the sandbox (not needed, the failure was a type error).

### Final state

Throwaway `frontend/proxy.ts` deleted; `frontend/out`, `frontend/.native-build`, the `frontend/node_modules` symlink and the generated `frontend/getwrite-config` link (created by the script's `ensure-config-link`) were removed. `git check-ignore -v` output: `frontend/.gitignore:25:/out/	out`, `frontend/.gitignore:26:.native-build/	.native-build`, `frontend/.gitignore:28:/getwrite-config	getwrite-config`; so `out` and `.native-build` are gitignored (neither existed before the run). `git status --short` at the worktree root, run before this section was appended:

```
?? node_modules
```

`node_modules` is the pre-existing root symlink. `experiments.md` is tracked and shows as modified by this append.

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

## D: locked workspace (partial)

Run 2026-10-09 by the pipeline lead, in the main checkout on branch `feat/home-network-sharing` (source identical to `main`; the branch differs only under `specs/`). Parts (1) to (3) of Task 5 were run. Part (4), the Electron window, was NOT run. No cause is named below that the runs did not discriminate.

### Setup as run, and how it differs from the task's wording

- `cd frontend && pnpm build` at 12:30 MDT, exit 0, inside the command sandbox. `.next/static` and `public` copied into `.next/standalone/frontend/`.
- Server: `PORT=4821 HOSTNAME=127.0.0.1 GETWRITE_PROJECTS_DIR=/tmp/claude-501/gw-exp-d GETWRITE_TEMPLATES_DIR=<repo>/getwrite-config/templates/project-types node server.js` from `.next/standalone/frontend/`. This is the standalone server, not `next dev` and not the packaged app. `GETWRITE_DESKTOP` was not set. Port 3000 was not touched.
- "Ordinary browser": the Playwright MCP browser (Chromium) at `http://127.0.0.1:4821/`. It has no desktop bridge.
- Deviation: the task says to lock "from the desktop window". No Electron window was used. The lock, and one later unlock, were sent from a second client with `curl` to `POST /api/encryption`. The requests carried no `Origin` header and no cookie, and each returned 200.
- In the plain browser: created project "Lock Experiment" (Novel type) from the Start page; opened Project Settings, tab "Project Encryption", "Encrypt this project…", entered a throwaway passphrase twice, ticked the acknowledgement, "Encrypt project". Afterwards `GET /api/encryption` returned `{"isAvailable":true,"hasKeyring":true,"isUnlocked":true,"encryptedProjectIds":["a7605f9e-228f-4c25-a7be-f5749bb07964"]}` and the project folder held `.encrypted.json`.

### (3) Project open in the plain browser, then locked from a second client

1. Opened "Scene 1", typed "Before lock sentence. ". Five seconds later `grep -rl "Before lock"` over the project folder found no file (no plaintext copy on disk).
2. Locked with `curl -X POST -d '{"action":"lock"}' /api/encryption` (200, `isUnlocked:false`).
3. Typed "After lock sentence. " in the still-open editor and waited 6 seconds. Rendered: the editor kept both sentences; the footer read "Words: 8 | Node: Body | Today's writing | Today: 3 | Autosave failed | Retry now". No toast, no dialog, no unlock prompt. The browser's resource timing showed the last request to `/api/resource/revision/<id>` with status 404; the earlier ones were 200. The status was 404, not 401. Which request that was (the save, or a read before it) was not separated.
4. Trash tab with nothing in the trash and the workspace locked: `GET /api/project/<id>/trash` returned 200 `{"resources":[],"folders":[]}` and the view read "Trash is empty." At that point the project had no trashed item, so this is a true empty and does not show how a refusal renders.
5. To get a refusal: unlocked from the second client, soft-deleted "Scene 1" with `POST /api/resource/<id>/delete` (200), confirmed the trash listing returned that one resource, locked again. `GET /api/project/<id>/trash` then returned 401 `{"error":"Project \"…\" is encrypted and the workspace is locked. Unlock to continue."}`. In the browser, switching to Data and back to Trash rendered "Could not load Trash. Try again later." in the view and in an alert region. The text does not say the workspace is locked.
6. `GET /api/projects` while locked returned 200 with `[{"isEncrypted":true,"isLocked":true,"project":{"id":…,"createdAt":…},"resources":[],"folders":[]}]`: no name, empty resource and folder lists.
7. A 409 (`MissingProjectKeyError`) was not reproduced.

Not exercised: the resource tree refresh, the Data, Organizer, Timeline, Entities and Graph views, search, and the metadata sidebar while locked. So "no locked response renders as an empty list" is NOT established for the app as a whole; it was observed for the editor save and for the Trash view only.

### (2) Start page for a locked workspace, plain browser

Reloaded `http://127.0.0.1:4821/` with the workspace locked. Rendered:

- A project card: "Project · Locked", heading "Encrypted project", text "Unlock this workspace to see this project's name and open it." Counters read "1 active project, 0 writing assets, 0 folders organized".
- A dialog (role `dialog`, no `aria-modal` attribute): "Unlock your encrypted projects. One project in this workspace is encrypted. Enter your passphrase to open it." with a "Passphrase" password field, "Continue without unlocking" and "Unlock" (disabled until text is entered).
- Buttons in the page: "Start a New Project" and "App Settings". Both were present while locked. Neither was operated, and keyboard operation was not checked.

Entered the passphrase in that dialog and pressed Enter. Three seconds later `GET /api/encryption` returned `isUnlocked:true` and `GET /api/projects` returned the project with its name and `isLocked:false`. So a plain browser with no desktop bridge unlocked the workspace.

Also observed during setup: the "Project Encryption" tab and its "Encrypt this project…" control were present and worked in the plain browser.

### (4) Electron window: NOT RUN

Whether the Start page's "App Settings" button is reachable and keyboard-operable in the Electron window while the workspace is locked was not checked. It needs `pnpm electron:dev` and a person at the window.

### (5) Implication, per the spec

- OQ-10, unlock prompt: observed. A plain browser is shown the unlock dialog and can unlock; it can also enable encryption and, by a direct request, lock. Per the spec this is recorded for Feature 77 (blocking lock and unlock from a paired device), and FR-30's interim note covers it until then.
- OQ-10, empty list: not observed in the two places checked (editor save: "Autosave failed"; Trash: "Could not load Trash"). Not established elsewhere (see "Not exercised"). No extra task is added on this evidence; the gap in coverage is stated here rather than closed.
- Two observations outside this feature's scope, recorded and not investigated: a save against a locked project returned 404 where the spec's reading expected 401; and the project's folder name on disk (`a7605f9e-…`) differed from the `id` inside its `project.json` (`35986554-…`), with the API reporting the folder name as the id after encryption.

### Cleanup

Browser closed. The server (PID 57805) was killed; `kill` inside the sandbox failed with "operation not permitted", so that one `kill` was run with the sandbox disabled. `/tmp/claude-501/gw-exp-d` was removed. `git status --short` showed no change outside this file. `.playwright-mcp/` is gitignored.

## Addendum to B: the same build in the main checkout

Run 2026-10-09 by the pipeline lead: `cd frontend && pnpm build:native` in the main checkout on `feat/home-network-sharing`, inside the command sandbox, with no `proxy.ts`. It failed with the same error section B recorded in a worktree: `./stories/Start/CreateProjectModal.stories.tsx:6:8 Type error: Cannot find module '../../../frontend/components/Start/CreateProjectModal'`, then `[build-native-static] ERROR: next build exited with status 1`. So the failure is not specific to the worktree. Its cause was not established, and it was not run outside the sandbox or on `main` itself (the two trees have the same source).

## C: run (Task 4) and D part (4)

Run 2026-10-09 by the owner in the main checkout on `feat/home-network-sharing`, with `experiments/oq1-window-secret.patch` applied, an unpacked desktop build, a Windows PC (10.0.0.47) and a phone as second devices. Recorded here by the pipeline lead from the owner's pasted output and statements. No cause is named that the runs did not discriminate. The secret was never pasted.

### Run 1: loopback bind (default)

- The patched build started. After the cold load `wc -l` on the log printed 13, so the proxy ran in the packaged `standalone/frontend` layout and wrote its log (section A had not measured that layout).
- Actions: cold load, open a project, edit, switch views, App Settings, reload, quit; the owner also restarted and reopened a project several times while reproducing an unrelated bug (below).
- Step 7 summary, total 69 lines:

| `sec-fetch-dest` | `sec-fetch-mode` | count | header present / correct | cookie present / correct |
|---|---|---|---|---|
| `document` | `navigate` | 3 | yes / yes | yes / yes |
| `style` | `no-cors` | 1 | yes / yes | yes / yes |
| `script` | `no-cors` | 5 | yes / yes | yes / yes |
| `empty` | `cors` | 59 | yes / yes | yes / yes |
| (none) | (none) | 1 | no / no | no / no |

- "Neither header nor cookie": one request, `/`, with no `sec-fetch-dest` and no `sec-fetch-mode`. Which component sent it was not established; its position in the log was not recorded.
- No request with `sec-fetch-dest` `image` or `font` appeared, so those two kinds are unmeasured.
- The app log was not searched for `spike cookie set failed`. Every window request in the summary carried the correct cookie.

### Run 2: `SPIKE_HOSTNAME=0.0.0.0`

- The desktop window loaded and worked.
- From the PC, with `curl.exe`: the plain page request, the plain `/api/projects` request, the request with `X-Forwarded-For: 127.0.0.1` and the request with a made-up header and cookie all returned 200. The page request returned the Start page's markup and the API requests returned the expected API responses. (This patch adds no gate, so nothing was refused.)
- Proxy log lines that did not carry the correct secret, in log order (`grep -v '"headerMatches":true'`); every one had `sec-fetch-dest` and `sec-fetch-mode` null:

| # | path | `x-forwarded-for` seen | header present / correct | cookie present / correct |
|---|---|---|---|---|
| 1 | `/` | 127.0.0.1 | no / no | no / no |
| 2 | `/api/projects` | 10.0.0.163 | no / no | no / no |
| 3 | `/favicon.ico` | 10.0.0.163 | no / no | no / no |
| 4 | `/` | 10.0.0.47 | no / no | no / no |
| 5 | `/api/projects` | 10.0.0.47 | no / no | no / no |
| 6 | `/api/projects` | 127.0.0.1 | no / no | no / no |
| 7 | `/api/projects` | 10.0.0.47 | yes / no | yes / no |
| 8 | `/` | 127.0.0.1 | no / no | no / no |

- Reading the table against the requests sent: lines 4, 5 and 7 match the PC's plain and made-up-secret requests. Line 6 matches the PC's forged request: a request sent from 10.0.0.47 with `X-Forwarded-For: 127.0.0.1` was logged as `127.0.0.1`. The log itself does not carry the sender's real address, so the match is by path, order and the absence of any other `/api/projects` request claimed from the host.
- Lines 2 and 3 came from a third address, 10.0.0.163. The owner has not said which device that was.
- Lines 1 and 8 are requests for `/` from 127.0.0.1 with no secret and no fetch metadata. Line 8 was logged before the `curl -4` below was run. What sent lines 1 and 8 was not established.
- Summary of the window's own requests in this run was not pasted; the owner reported the window worked.
- From the host: `curl -4 ... http://localhost:3000/` printed `200`. `curl -6 ... http://localhost:3000/` printed `curl: (7) Failed to connect to localhost port 3000 after 0 ms: Couldn't connect to server` and `000`.

### Run 3: `HOSTNAME=0.0.0.0 pnpm dev`

The phone loaded `http://<lan-ip>:3000/api/auth-status` and received `{"hostedAuthActive": false}`. So with `HOSTNAME=0.0.0.0` the dev server accepted a connection on the LAN address. No control run without `HOSTNAME` was made, so this does not show whether `next dev` uses the variable or listens on all interfaces regardless.

### Reversal

The owner reversed the patch. `git status --short` run afterwards by the pipeline lead printed nothing.

### D part (4): Electron window, workspace locked

Owner, in the desktop app: created a project, encrypted it, locked the workspace, closed the project, then tried to reach the Start page's "App Settings" button by keyboard. With the unlock dialog open it could not be reached. After the dialog was closed it could. Whether it was then operated, and what App Settings showed, was not reported.

### Implication, per the spec (OQ-1)

- Header: every request kind observed from the window (document, style, script, in-app fetch) carried the correct header on a loopback bind, and no request from another device carried it, including one that tried a made-up value. By the spec's rule ("header covers all kinds, use the header") the header is supported on this evidence. The cookie was equally complete on the same evidence.
- Limits: image and font request kinds were not observed. The window's request summary under the non-loopback bind was not captured.
- Peer address: a forged `X-Forwarded-For` from a second device was logged as `127.0.0.1`. The address cannot identify the window.
- Requests with no secret also arrive from 127.0.0.1 (lines 1 and 8, and the one in run 1). Whatever sends them, a gate that refuses everything without the secret will refuse them too, so the gate design must account for the desktop app's own non-window requests.
- `localhost` did not connect over IPv6 under the `0.0.0.0` bind while IPv4 did, and the window still loaded.

### Unrelated observation

While running run 1 the owner found that closing a project with the Data view open leaves the Data view over the Start page until the window is refreshed. Filed as a POS note; not part of this feature.

## Owner confirmation

Recorded by the pipeline lead at the Task 6 stop, 2026-10-09, after the owner read the results above. Owner's words: "1-7 confirmed, 8a, 9a, I think 163 was my phone and I ran curl -4 before the paste".

1. Window recognition: the per-launch secret sent as a request header. Image and font request kinds remain unmeasured. The desktop app's own non-window requests arrive without the secret, so the gate tasks must handle them (for example the startup readiness check sends the secret).
2. Where the gate lives: a single `frontend/proxy.ts` in front of every route and page. Because a module-level value set in the proxy was not visible to route code (section A (7)), the gate task must measure whether a request header set by the proxy reaches route handlers, and route code must not rely on shared module state to learn the classification.
3. `/_next/static`: left ungated. Accepted cost: an unpaired device can tell GetWrite is running and see its build version.
4. Pairing code and credential store: the planned shape of Tasks 9 to 11 (main generates the code and writes a hashed pairing-state file in `userData`; the server verifies and counts attempts in that file under a lock; credentials in a separate `userData` file read by the server per request).
5. FR-29 same-origin check: compare `Origin` (falling back to `Referer`) against `Host`, never `X-Forwarded-Host`.
6. OQ-10: no task is added for locked-access responses rendering as an empty list. Observed: editor save and Trash view render an error. Not checked: the other views. Recorded as a known gap and an input to Feature 77.
7. The unrun items (image and font request kinds; the window's request summary under the non-loopback bind) do not block the plan. Task 24 can cover them.
8. Native export build: `pnpm build:native` already fails on this tree with a type error in `stories/Start/CreateProjectModal.stories.tsx` (section B and its addendum). Final verification checks that it fails the same way as this baseline and no worse; fixing the stories error is separate work, not part of this plan.
9. The unlock dialog blocks keyboard access to "App Settings" until it is dismissed (section C, D part (4)). Accepted; no work added.

Attribution supplied by the owner, as recalled and not verified from the log: 10.0.0.163 (run 2, lines 2 and 3) was the owner's phone; the owner ran the `curl -4` localhost check once before the pasted output, which would account for line 8. Line 1, and the one no-secret request in run 1, remain unattributed.

Plan consequence: the tasks after Task 6 stand as written for the primary candidates, with the additions in items 1, 2 and 8 folded into the task list before Task 7 starts.

## E: does a request header set by proxy.ts reach a route handler (Task 14, step 1)

Run 2026-10-09 (Fri Oct 9 13:31 MDT), macOS (Darwin 25.5.0), Next.js 16.2.6, inside the Claude Code OS sandbox, from `frontend/` of the worktree `getwrite-hns-w14`.

Throwaway files (deleted afterwards): `frontend/proxy.ts` (`export function proxy(request: NextRequest)`; copies `request.headers`, deletes `x-getwrite-classification`, sets it to `set-by-proxy`, returns `NextResponse.next({ request: { headers } })`, no matcher) and `frontend/app/api/spike-class-echo/route.ts` (GET, `force-dynamic`, returns `{ seen: request.headers.get("x-getwrite-classification") }`).

Build: the first `pnpm build` (13:31:13) failed with `Symlink [project]/frontend/node_modules is invalid, it points out of the filesystem root` (the worktree's `frontend/node_modules` is a symlink to the main checkout, outside the worktree, which is a sibling of the main checkout rather than nested in it as in sections A and B). To get a build, `frontend/next.config.mjs` was temporarily given `turbopack: { root: "/Users/jedaisaboteur/Repositories" }`, `pnpm build` was rerun (13:31:30, completed; the route table ended with `ƒ Proxy (Middleware)`), and `next.config.mjs` was restored with `git checkout -- frontend/next.config.mjs`. No other change to the build.

Server: standalone output was at `.next/standalone/getwrite-hns-w14/frontend/server.js`; `.next/static` copied to `.next/standalone/getwrite-hns-w14/frontend/.next/static`; started from that directory with `PORT=3457 HOSTNAME=127.0.0.1 node server.js`.

Commands and output:

```
curl -s http://127.0.0.1:3457/api/spike-class-echo
{"seen":"set-by-proxy"}
curl -s -H 'x-getwrite-classification: confirmed:forged' http://127.0.0.1:3457/api/spike-class-echo
{"seen":"set-by-proxy"}
```

Observation: a header set by the proxy on the forwarded request (`NextResponse.next({ request: { headers } })`) was visible to the route handler, and a client-sent value for the same header name, which the proxy deleted before setting its own, did not reach the route (the route saw `set-by-proxy`). Not measured: a pass-through that does NOT delete the client copy (the proxy here always replaced it); POST, page (non-route) requests, the packaged `standalone/frontend` layout, and behaviour under `next dev`.

Cleanup: throwaway files deleted; `git status --short` after the deletion showed only the new gate files from this task (no change outside `specs/` from the experiment). The server started for this run could not be stopped from inside the sandbox (`kill` returned `operation not permitted`, and the attempt to retry outside the sandbox was denied by the permission gate); it was still listening on `127.0.0.1:3457` (PID 67566) when this section was written.
