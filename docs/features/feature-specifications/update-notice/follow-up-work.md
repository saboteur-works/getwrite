# Follow-up Work: Update Notice

## 2026-06-15 — deferred items from initial implementation

The Update Notice feature (Tasks 1–8) is implemented and all tests pass. The
following were intentionally deferred:

1. **Open banner links in the OS browser from Electron.**
   `UpdateNoticeBanner` renders "View release notes" and "Download" as plain
   `<a target="_blank" rel="noopener noreferrer">` anchors. In the packaged
   Electron app these should open in the user's default browser, not in a new
   `BrowserWindow`. Configure `webContents.setWindowOpenHandler` in
   `electron/src/main.ts` to route external `https:` URLs through
   `shell.openExternal` and deny in-app navigation. Deferred because it is an
   Electron-shell concern independent of the notice logic and untestable from
   the Vitest/jsdom suite.

2. **Verify Task 1 env injection in a *packaged* build.**
   `GETWRITE_DESKTOP`, `GETWRITE_REPO`, and `GETWRITE_APP_VERSION` are injected
   in `startServer`. This was confirmed by reading the code and electron `tsc`,
   but `app.isPackaged` changes the spawn path, so it should be exercised via
   `pnpm electron:package` to confirm the spawned standalone server actually
   receives the vars and `/api/version-check` returns a real result. Deferred
   because it requires a full packaged build.

3. **Manual end-to-end check against a real newer release.**
   The version comparison and GitHub fetch are covered by unit tests with mocked
   payloads. A live check (current version < latest GitHub Release) would
   confirm the banner appears with the correct release-notes and installer-asset
   URLs for the running platform. Deferred until there is a published release
   newer than the installed build to test against.

### Notes for future implementation

- The platform→asset matching in `update-check.ts` (`PLATFORM_ASSET_PATTERNS`)
  assumes installer file names contain `.dmg`/`mac` (darwin), `.exe`/`.msi`/`win`
  (win32), or `.AppImage`/`.deb`/`.rpm`/`linux`. If `electron-builder.yml`
  output names diverge from this, update the patterns; the code already falls
  back to the release page URL when no asset matches.
