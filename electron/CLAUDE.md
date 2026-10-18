# electron/ (getwrite-electron)

Paths are relative to `electron/` unless they start with `frontend/` or `docs/`. Desktop shell: spawns the Next.js standalone server and opens a `BrowserWindow`. Background: `docs/features/electron-desktop.md`, `docs/features/home-network-sharing.md`.

## Entry and build

- `src/main.ts` + `src/preload.ts`, compiled by `tsc` to `dist/`. Bridge types: `frontend/src/lib/desktop-bridge.ts`.
- `pnpm electron:build` = frontend `next build` -> electron `tsc` -> `build:worker` (esbuild). `pnpm electron:package` = electron-builder (`electron-builder.yml`). Unit tests: `tests/`, CI `.github/workflows/electron-checks.yml`.
- Production log: `app.getPath("logs")/getwrite.log`.

## Server launch

- Spawns `frontend/.next/standalone` (repo root, or `process.resourcesPath` when packaged) on the fixed port `PORT` in `src/server-config.ts` (7340; no override, no fallback). Bind env, window URL, readiness check, navigation guard, IPC sender check and displayed addresses all read it. Dev (`pnpm electron:dev`) uses it too; plain `pnpm dev` stays on 3000. Port blocks: ADR-023.
- Start-up order: `port-in-use.ts` `createPortGuard` probes `127.0.0.1`, `::1`, `0.0.0.0`, `::` -> if anything listens, fork nothing and show a `data:` page naming the port (a probe error also refuses) -> fork -> `sharing/server-readiness.ts` `waitForServer` (with `readiness-identity.ts`, `readiness-http.ts`, `server-launch.ts` `runLaunchSequence`) polls `GET /api/sharing/ready?challenge=...` with no window header and accepts only the HMAC proof under a per-launch `GETWRITE_READINESS_KEY` -> only then install the window secret and load the local origin.
- Env passed to the forked server: `GETWRITE_PROJECTS_DIR`, `HOSTNAME`/`GETWRITE_BIND`/`GETWRITE_SHARING` (from `buildServerBindEnv`), `GETWRITE_WINDOW_SECRET`, `GETWRITE_SHARING_DIR` (`userData`), `GETWRITE_READINESS_KEY` (server env only, separate from the window secret).

## Projects location (`src/projects-dir.ts`, unit-tested)

- Packaged: `resolveProjectsDir` = override in `userData/workspace.json` ?? `~/Documents/GetWrite`. Dev: the repo `projects/`. Never store projects inside the app bundle.
- `migrateLegacyProjectsDir` drains each `legacyProjectsDirs()` entry on every packaged launch; never overwrites, never deletes on failure.
- Changing the location needs a restart (`GETWRITE_PROJECTS_DIR` is fixed at fork).
- `writeWorkspaceConfig` writes via temp file + rename (fsync file then directory), keeps an existing file's mode. `noise-words-ipc.ts` handlers take `app.getPath("userData")` in both builds. `getwrite:global-noise-words-get`/`-set` IPC backs the desktop global noise-word list.

## Home-network sharing (`src/sharing/`; see docs/features/home-network-sharing.md)

- `sharing-mode.ts` `resolveSharingMode` is the one decision (setting + env; hosted auth configured means off). A non-loopback bind always comes with the gate on. Setting `sharingEnabled` lives in `workspace.json`; takes effect on restart (`getwrite:restart`).
- `window-secret.ts` (`createWindowSecret`, `installWindowSecret`: per-launch, never logged, never over IPC), `pairing-code.ts`/`pairing-session.ts` (6-digit `crypto.randomInt`, plain code in memory only, salted HMAC in `userData/pairing-state.json`), `addresses.ts`, `store-status.ts` (`ok`/`missing`/`corrupt`, exports `isDeviceRecord`), `sharing-status.ts`.
- Devices: `device-store-writer.ts` `updateDeviceStore` (read-modify-write of `device-credentials.json` under the server's `<store>.lock` protocol; unknown fields kept; unreadable store refused untouched), `device-management.ts`, `device-ipc.ts`. Limits: `limits-store.ts` (writes `sharing-limits.json`), `limits-ipc.ts`.
- IPC rule for the sharing channels (status, enable, pairing code, devices, limits): each handler checks the sender first (`navigation-guard.ts` `isTrustedSender`: frame must be on the local origin), then validates the payload. `getwrite:global-noise-words-get`/`-set` do neither (no sender check or payload validation in `noise-words-ipc.ts` or its `main.ts` registration; POS note `note_56d253e9`). Sharing channels: `getwrite:sharing-get-status|set-enabled|generate-code|get-code|list-devices|rename-device|revoke-device|get-limits|set-limit`. No HTTP route changes devices or limits. `will-navigate` compares parsed origins (`isLocalOriginUrl`).

## Import UIs (Scrivener, DOCX share one shape)

- Channels: `getwrite:scrivener-choose-source`, `getwrite:scrivener-start-import`; `getwrite:docx-choose-file`, `getwrite:docx-choose-folder`, `getwrite:docx-start-import`. Code in `src/scrivener-import/`, `src/docx-import/`.
- Pickers return an opaque selection handle + display name (`selection-handles.ts`); the source path never reaches the renderer. `import-guard.ts` allows one in-flight import.
- Start forks a `utilityProcess` running `worker/<kind>-import-worker.ts`, bundled by esbuild to `dist/<kind>-import-worker.cjs` and shipped via `extraResources` (a script inside `app.asar` cannot be forked). It runs `importScrivenerProject`/`importDocxProject` from `frontend/src/lib/models/` via the `@gw/core` alias; `handle-import-request.ts` + `await-worker-outcome.ts` return a discriminated outcome (4 Scrivener, 5 DOCX).
- DOCX fork options (`docx-import/fork-options.ts` `buildDocxWorkerForkOptions`): base env + `GETWRITE_PROJECT_TYPES_DIR` + `cwd: getRepoRoot()`; the Scrivener fork does not set them.
- UI: `frontend/components/Start/ImportScrivenerDialog.tsx`, `ImportDocxDialog.tsx`, opened from `StartPage.tsx` buttons rendered only when a desktop bridge exists.
