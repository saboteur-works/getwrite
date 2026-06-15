# Feature Spec: Update Notice

## Overview

GetWrite ships as an installed Electron desktop app whose binary can fall behind the project's latest release. Users have no in-app signal that a newer version exists, so they stay on stale builds and miss fixes and features. The Update Notice informs desktop users, on app open, when a newer version has been published — using the latest GitHub Release as the source of truth — so they can choose to read about it and update.

## Goals

- Desktop users learn within one app launch that a newer version is available.
- The latest GitHub Release for `saboteur-works/getwrite` is the single source of truth for "what is current."
- Users can act on the notice (read release notes, get the installer) or set it aside without interruption to writing.
- A version a user has skipped or dismissed does not nag them again until a newer version ships.
- A failed or offline version check never blocks app startup or degrades the writing experience.

## Non-goals

- Automatically downloading, installing, or applying updates (no auto-update).
- Showing the notice in the hosted web app (it always serves the latest deployed build).
- Notifying about pre-release, draft, or non-GitHub-Release versions.

## User stories

- As a desktop user, I want to be told when a newer GetWrite version exists so that I don't unknowingly run an outdated build.
- As a desktop user, I want to read the release notes for the new version so that I can decide whether to update.
- As a desktop user, I want a direct link to the installer so that updating is one click away.
- As a desktop user, I want to dismiss or skip a version's notice so that I'm not repeatedly interrupted.

## Functional requirements

1. The notice **must** appear only in the Electron desktop build, never in the hosted web app.
2. On app open, the app **must** query the latest published GitHub Release for `saboteur-works/getwrite` and compare its version (semver) against the running app's version.
3. If the latest release version is strictly greater than the running version, the app **must** display a dismissible banner in the app shell; otherwise it **must** display nothing.
4. The banner **must** offer a "View release notes" action linking to the latest GitHub Release page.
5. The banner **must** offer a "Download" action linking to the latest desktop installer asset.
6. The banner **must** offer "Dismiss" (hide until a newer version appears) and "Skip this version" (permanently suppress the notice for that specific version).
7. A dismissed or skipped version **must not** re-trigger the banner unless a version newer than the dismissed/skipped one is published.
8. If the version check fails (offline, timeout, non-200, unparseable response), the app **must** start normally and show no notice or error.
9. The version check **should** be throttled so it runs at most once per app open and not more than once per 24h.

## Open questions

None identified.

## Out of scope (deferred)

- Automatic / silent update download and install.
- In-app rendering of full changelogs (beyond linking out).
- Notifying about beta or pre-release channels.
- Web app "refresh to update" prompts.
