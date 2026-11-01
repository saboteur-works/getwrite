# Finish saves before the desktop window closes

Source: `task_ac8e036b`, handbook re-run observation O-3 (`specs/features/user-handbook/verification.md` section 26.8). Branch: `fix/window-close-save`. Measurements: `specs/features/window-close-save/experiments.md`.

## Overview

The editor saves about 2.5 seconds after typing stops. In the desktop app, closing the window or quitting during that wait lost the words typed since the last save: the page started the save as it went, and nothing waited for it. The desktop app now waits for the page's saves before the window closes and before the server stops.

## Goals

- Words typed before the desktop window closes or the app quits are saved.
- A save that can't finish is never lost silently. The writer is told, and chooses.
- A close with nothing to save behaves as it did.

## Non-goals

- Browser and paired-device behaviour. A reload keeps its `beforeunload` flush, and the server stays up.
- Android.
- Edits made while viewing a non-canonical revision, which aren't autosaved by design.
- Other writes in progress at close, such as a sidecar field or a named revision save. These were not measured.

## Requirements

- FR-1: When the window closes or the app quits, the main process MUST ask the page to finish its saves and hold the close until the page answers.
- FR-2: The saves covered MUST be: a rich-text save waiting out the autosave delay, a Markdown source edit waiting out its delay, a save already running, and an earlier failed save of the shown document, which is tried again.
- FR-3: A queued rich-text save MUST finish before a newer Markdown edit is sent.
- FR-4: The server MUST stop only after the window has closed (`will-quit`, not `before-quit`).
- FR-5: If a save fails, or the page doesn't answer within 5 seconds, the window MUST stay open and show "Your last edits weren't saved" with **Keep Editing** and **Close Anyway**. Owner decision, 2026-11-01. Keep Editing MUST cancel a held quit; the next close tries the saves again.
- FR-6: The close MUST NOT wait when the window isn't showing the app's own page, or its page has crashed.
- FR-7: With "Keep running" on, the window MUST close after the saves finish and the app and server MUST keep running.

## Open questions

- OQ-1: Why did the dev run save 5 of 5 on a quit event, when the packaged build lost 6 of 6? Not established. The dev run starts the server through `pnpm dev` in a shell. It no longer affects the fix, because the packaged build is what ships.
