# Showcase Images

## Overview

GetWrite has no repeatable way to produce polished, on-brand screenshots of the
running application for marketing pages, documentation, and release notes.
Capturing visuals by hand is slow, inconsistent, and goes stale every time the
UI changes. This feature provides a single command that boots the app against a
curated fixture project and uses Playwright to capture a defined set of
application states as image files, so promotional and illustrative visuals can
be regenerated on demand.

## Goals

- A single command produces a complete set of showcase images from a clean
  checkout with no manual setup.
- The set of captured states is defined declaratively and is cheap to extend.
- Each scene is captured in both light and dark themes at a desktop viewport.
- Output is deterministic: the same checkout and fixture produce the same
  images.
- Captured images reflect the real running app, not mocked or Storybook-only
  composition.

## Non-goals

- Visual-regression diffing or pass/fail assertions on captured images.
- Replacing the existing Storybook `screenshots capture` command.
- Automatic publishing of images to a website, CDN, or marketing surface.
- Mobile, tablet, or arbitrary-viewport capture in this iteration.

## User stories

- As a maintainer, I want to regenerate all showcase images with one command so
  that marketing visuals stay current after UI changes.
- As a maintainer, I want to add a new captured state by editing a manifest so
  that I do not have to write bespoke browser code per scene.
- As a marketer, I want both light and dark versions of each scene so that I can
  match assets to a given channel.

## Functional requirements

1. The system MUST provide a single repo-root command (e.g. `pnpm showcase`)
   that runs the full capture end to end.
2. The command MUST boot the application against the committed fixture project
   under `scripts/showcase/fixture/` and tear it down when capture completes.
3. Scenes MUST be defined in a declarative manifest, each entry specifying at
   least an id, a target route, optional setup steps, theme, and viewport.
4. The runner MUST iterate the manifest and capture each scene using Playwright.
5. Each scene MUST be captured in both light and dark themes at a desktop
   viewport.
6. Output files MUST be written to a configurable output directory and named
   deterministically from the scene id and theme.
7. The command MUST exit non-zero if the app fails to boot or any scene fails to
   capture, logging which scene failed.
8. Setup steps SHOULD be reusable primitives (e.g. open resource, hide cursor)
   shared across scenes.
9. The command SHOULD allow filtering to a subset of scenes by id.

## Open questions

None identified.

## Out of scope (deferred)

- Mobile and tablet viewport capture.
- Animated captures (GIF/video) of interactions.
- Visual-regression comparison against a baseline.
- Automated upload/publishing of generated images.
- Per-scene annotation or compositing (frames, captions, device bezels).
