# Home-network sharing (developer)

Feature 75. Spec: [specs/features/home-network-sharing.md](../../specs/features/home-network-sharing.md). Measurements and verification runs: [specs/features/home-network-sharing/experiments.md](../../specs/features/home-network-sharing/experiments.md) (sections A to G). Task list: [specs/features/home-network-sharing/tasks.md](../../specs/features/home-network-sharing/tasks.md).

## Status

Implemented on branch `feat/home-network-sharing`. **Not merged, not released.** The owner holds the release until Features 76 (paired-device list, rename, revoke), 77 (capability limits for a paired device) and 80 (change of the desktop server's default port) are merged. Until then:

- A paired device has the full route set. It can lock and unlock the workspace and delete projects (the sharing copy says so: `INTERIM_EXPOSURE_NOTE` in `frontend/components/Sharing/sharing-copy.ts`, a separable constant for Feature 77 to remove).
- A paired device cannot be revoked from the app. No device list, rename or revoke UI exists (`grep -rniE "revoke|rename|device list|forget" frontend/components/Sharing` printed nothing, experiments section G).

What has not been done:

- Manual verification on real devices (Task 24). No request from a second device has been made against the finished gate. Every built-server check in experiments sections F and G was sent from the host machine, including the ones aimed at its own LAN address. An earlier experiment (section C, with a throwaway patch that had no gate) did reach the server from a PC and a phone; it measured how requests arrive, not whether the gate refuses.
- The Electron window under the finished code (the sharing controls, the restart, the displayed addresses) was not run in the experiments recorded. Behaviour described below for the desktop window is what the code is written to do.
- The owner has not reviewed the working copy strings. Strings in `sharing-copy.ts` are proposals, not confirmed copy.
- The native export (`pnpm build:native`) fails on this tree at a type error in `stories/Start/CreateProjectModal.stories.tsx` (`Cannot find module '../../../frontend/components/Start/CreateProjectModal'`). It fails the same way on the baseline without `proxy.ts` and without the sharing code (experiments sections B, F, G); the cause was not established. With `stories` excluded from the shadow root's `tsconfig.json` only (a manual procedure, not the script), the export built and its `out/` contained no `pair` page, none of the gate's strings and no proxy code (the only proxy-related file is an inert `_clientMiddlewareManifest.js`).

Out of scope, not built: TLS, headless / Docker / NAS delivery, the Android app as a client, and any statement or measurement of what happens when two devices save the same resource (Features 78 and 79).

## What it is

A writer can turn on one setting in the desktop app's App Settings and open their projects from another device's browser over the home network, with no account and no hosted service. Sharing is off by default. With it on, a device must be paired once by typing a short-lived, one-time code shown in the desktop window; the device then holds its own credential. The desktop window itself never needs pairing.

Sharing and hosted authentication are mutually exclusive. If sharing is on and both `DATABASE_URL` and `BETTER_AUTH_SECRET` are set, sharing is not started, the server stays on loopback, and the settings say so (`resolveSharingMode`, `electron/src/sharing/sharing-mode.ts`). The environment is not stripped.

## How a writer uses it

1. On the Start Page choose **App Settings**. Under "Home network sharing" turn on "Share my projects on this network". The setting is recorded at once, but the server's bind is fixed when it starts, so it takes effect on restart: "Restart now" restarts GetWrite (`getwrite:restart`, `app.relaunch(); app.quit()`). The restarting message is shown before the relaunch call. A pending workspace-folder change shares the same restart.
2. Once sharing is in effect, the settings show "Sharing is on", the addresses other devices open (`http://<ip>:<port>` for each private-range IPv4 address; "No network address found." when there is none), both plain-words statements (unencrypted HTTP; reachable only while GetWrite is open and awake on this computer and the device is on the same network) and the interim-exposure note. A "Sharing is on" indicator (`SharingStatus.tsx`) also shows at the top of the Start Page and of the project shell.
3. "Show a pairing code" generates a 6-digit code with a 5-minute countdown. "Generate a new code" replaces the previous one.
4. On the other device, open one of the displayed addresses. An unpaired browser is sent to the `/pair` page, which explains that the device is not paired and takes the code. On success it goes to `/`.

## What is refused

With sharing on, a request that is not the desktop window's is refused unless it carries a valid device cookie, with these exceptions: the `/pair` page, `POST /api/sharing/pair`, and `/_next/static/` assets.

- **No credential, unknown credential, or a damaged credential store:** an API request gets 401 JSON `{ "error": "not-paired", ... }` with header `x-getwrite-gate: not-paired`; a page request is redirected to `/pair`. A damaged store (`device-credentials.json` unreadable or invalid) refuses every non-window request, including the pairing page, and the settings say so.
- **A `Host` that does not name this machine:** 403 plain text, header `x-getwrite-gate: host-not-allowed`, never a redirect. The accepted `Host` is exactly `<name>:<port>` with `<name>` one of `localhost`, `127.0.0.1`, an IPv4 address of one of the machine's own interfaces, or `<hostname>.local`, read from `os.networkInterfaces()` / `os.hostname()` at request time (`host-allowlist.ts`). A missing `Host`, a missing port, a wrong port, an IPv6 literal or any other name is refused. This applies to the exempt requests too.
- **A cross-origin state-changing request** from a paired device (POST, PUT, PATCH, DELETE whose `Origin`, falling back to `Referer`, does not match `Host`, or where both are absent): 403 `cross-origin`. `X-Forwarded-Host` is never read.
- **A server told it is bound beyond loopback while the gate is not on** (`GETWRITE_BIND` not a loopback name, `GETWRITE_SHARING` not `1`): every request that is not the window's gets 403 `bind-without-gate`.
- **A pairing code that is wrong, expired, used, or dead** (5 wrong attempts, counted per code): `POST /api/sharing/pair` answers 400 with `{ ok: false, reason: "wrong" }` or `"unusable"`; the internal reason is not sent. The pairing screen shows the matching working copy.
- **A refused in-app fetch** from a device whose credential is no longer valid: `DeviceNotPairedGuard.tsx` (mounted in the root layout, not on native) wraps `window.fetch` and sends the browser to `/pair?reason=unpaired` on a 401 carrying `x-getwrite-gate: not-paired`. A 401 without that header (for example a locked workspace) is not intercepted.

With sharing off, `runGate` only forwards and `POST /api/sharing/pair` answers 404.

## Where state lives

All in Electron's `userData` directory, which is also the server's `GETWRITE_SHARING_DIR`; none of it is under the workspace or projects folder, and none of it changes when the workspace folder changes.

| What                          | Where                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The on/off setting            | `sharingEnabled` in `workspace.json` (`readSharingEnabled` / `writeSharingEnabled`, `electron/src/projects-dir.ts`). Absent, corrupt or non-boolean reads as off.                                                                                                                                       |
| The current pairing code      | Plain code in main-process memory only. `pairing-state.json` holds a salted HMAC-SHA256 of it plus `expiresAt`, `attempts`, `dead` and `used`. Main writes the file when generating a code; the server updates the counters under a lock file. After an app restart there is no in-memory code to show. |
| Paired devices                | `device-credentials.json`: device id, derived name (for example "Safari on iPad"), creation time and the SHA-256 hash of the credential. Written mode 0600. A missing file means no devices are paired.                                                                                                 |
| The credential in the browser | Cookie `getwrite_device`: HttpOnly, `SameSite=Strict`, `Path=/`, `Max-Age=31536000` (365 days, a working value pending owner confirmation, spec OQ-13). Not `Secure`, because the connection is HTTP. Re-issued with a fresh `Max-Age` on every confirmed request.                                      |

Turning sharing off stops other devices reaching the server and does not delete paired-device credentials.

## How the gate works

- `frontend/proxy.ts` (Next 16's proxy convention; the repo has no `middleware.ts`) calls `runGate` (`frontend/src/lib/sharing/gate.ts`) for every request. It is the single interception layer; the logic is in `frontend/src/lib/sharing/`.
- The desktop window is recognised by the per-launch secret in the `x-getwrite-window` request header. Main generates the secret (`createWindowSecret`, 32 random bytes as hex), passes it to the server as `GETWRITE_WINDOW_SECRET`, and adds the header to every request the window's session makes to the local origin (`installWindowSecret`, `session.webRequest.onBeforeSendHeaders`). The readiness poll sets the header itself (`server-readiness.ts`). The secret is not logged, not sent over IPC and not exposed on the bridge. Peer address and `X-Forwarded-For` are not used: a forged `X-Forwarded-For: 127.0.0.1` from another device reached the server unchanged (experiments section A (5), section C run 2).
- The gate reports its classification to route code in the `x-getwrite-classification` request header (`off`, `window`, `confirmed:<id>`, `not-confirmed:<reason>`) after deleting any client copy. A header set by the proxy reached a route and a client-sent copy did not, measured on a standalone build from loopback (section E). Module state set in the proxy was not visible to routes (section A (7)), so none is used.
- `next.config.mjs` sets `experimental.proxyClientMaxBodySize` to the media cap plus 1 MiB, because adding `proxy.ts` brought in Next's default 10485760-byte limit, under which a 12 MB upload returned 500 (security review). After the change, 12 MiB and 98 MiB audio uploads returned 200 with sharing off and with sharing on plus the window header (section G (c)); with sharing off, a file of 100 MiB plus one byte was refused by the media validation with 400 (not run with sharing on).
- `frontend/scripts/sharing-refusal-smoke.mjs` (`pnpm test:sharing-smoke`, from `frontend/`) starts a built standalone server (default `.next/standalone/frontend/server.js`; run `pnpm build` and copy `.next/static` first) with sharing on, walks `app/` for every `route.ts` and `page.tsx`, and checks that each is refused unconfirmed. Last recorded run: 90 enumerated entries, 24 checks, 0 failures, from the host to itself (loopback and its own LAN address).

## Desktop wiring

- `electron/src/server-config.ts` holds `PORT`; the bind env, the window load URL, the readiness check, the navigation guard, the IPC sender check and the displayed addresses read it. Feature 80 will change the value; nothing here depends on it.
- The bind: `resolveSharingMode(...).effective` is the one value. `buildServerBindEnv` derives `HOSTNAME` (`0.0.0.0` when effective, `127.0.0.1` otherwise), `GETWRITE_BIND` and `GETWRITE_SHARING` (`1` / `0`) from it, so a non-loopback bind always comes with the gate on.
- Sharing IPC channels, registered in `electron/src/main.ts` and exposed on the bridge (`preload.ts`, `frontend/src/lib/desktop-bridge.ts`): `getwrite:sharing-get-status` (`getSharingStatus`), `getwrite:sharing-set-enabled` (`setSharingEnabled`), `getwrite:sharing-generate-code` (`generatePairingCode`), `getwrite:sharing-get-code` (`getPairingCode`). Each handler refuses a call whose `event.senderFrame?.url` is not on the local origin (`isTrustedSender`, `electron/src/navigation-guard.ts`), including a `null` sender. No HTTP route exposes any of this.
- The window may navigate only to the exact local origin (`isLocalOriginUrl` compares parsed origins; the previous `startsWith` test let `http://localhost:3000@evil.example/` and `http://localhost:30001/` through when evaluated in Node).
- `frontend/components/Sharing/` holds `SharingSettings.tsx` (App Settings section; renders nothing without the desktop bridge), `SharingStatus.tsx`, `PairingScreen.tsx` (the `/pair` page, `frontend/app/pair/page.tsx`), `DeviceNotPairedGuard.tsx` and `sharing-copy.ts`. The `pair` directory is excluded from the native export (`EXCLUDED_APP_SUBPATHS` in `frontend/scripts/build-native-static.mjs`).

## Environment variables the desktop app sets

`GETWRITE_SHARING`, `GETWRITE_SHARING_DIR`, `GETWRITE_BIND` and `GETWRITE_WINDOW_SECRET` are set by the Electron main process for its own server. They are not meant to be set by hand. Only `GETWRITE_SHARING=1` turns the gate on in the server (`readSharingEnv`); any other value, or unset, leaves it off. `GETWRITE_BIND` unset means undeclared, so `pnpm dev`, hosted deployments and tests are unaffected.

## Accepted limits

Recorded by the owner on 2026-10-09 after the security review; no work is added for them in this feature.

- The connection is plain HTTP. A device cookie captured on the network works until revoke exists (Feature 76).
- Any device on the network can make the current pairing code unusable with five submissions, including malformed ones. The attempt limit itself held under 200 parallel guesses (measured at gate level).
- The cookie is scoped to the host it was set on and is not port-scoped. If the desktop's address changes, the device must be opened at the new address and paired again. A router address reservation is the dependable remedy.
- `<hostname>.local` is accepted by the gate but is not displayed in the window. Whether it resolves on a given phone, and whether `os.hostname()` returns the name a device resolves, is not measured. A name supplied by a router or reverse proxy (for example `nas.lan`) is refused.
- IPv6 is not in scope. Under a `0.0.0.0` bind, `curl -6 http://localhost:3000/` did not connect while `curl -4` did (cause not established).
- Uploads pass through the proxy, which buffers request bodies in memory up to the configured limit. The memory cost was not measured.
- A leftover lock file younger than 30 seconds delays pairing (measured). The pairing-state file is written by main without the lock, so a new code can be overwritten by a simultaneous wrong guess and stop working (reading, not run). There is no minimum secret length server-side, and the window header is forwarded to routes.

## Not verified

- Whether a device credential survives an app upgrade.
- Whether a given phone's browser keeps the cookie across a browser restart (the `Max-Age` header was observed in a response; a browser's own cap was not checked).
- Image and font request kinds from the window under the finished gate (none appeared in the experiment-C log), and the window's own request summary under a `0.0.0.0` bind.
- `next dev`: a dev server with `HOSTNAME=0.0.0.0` accepted a connection from a phone, but no run without the variable was made, so it is not known whether the dev server uses it. The gate under `next dev` was not tested. WebSocket upgrades were not covered by the security review.
- Locked workspace: a plain browser was shown the unlock dialog and unlocked the workspace; it could also enable encryption and lock by a direct request (experiments section D). That is Feature 77's scope. Whether other locked-access responses render as an empty list was not checked beyond the editor save and the Trash view. The unlock dialog blocks keyboard access to "App Settings" until it is dismissed (accepted by the owner).
- Storybook story tests for `Sharing/*` were not run.
- Final verification found knip reporting 11 more unused exports/types than the `main` baseline (section G), so Task 23 is not ticked.
