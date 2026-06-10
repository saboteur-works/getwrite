# Showcase Image Capture

The showcase pipeline boots the GetWrite app against a local fixture project and captures defined application states as PNG screenshots in light and dark themes. Output is used for marketing, docs, and feature previews.

## Quick start

```bash
# 1. Seed the fixture from any local GetWrite project
pnpm showcase:seed --project projects/<uuid>

# 2. Capture all scenes
pnpm showcase
```

Screenshots are written to `showcase-out/` (gitignored).

## Seeding the fixture

The app boots against `scripts/showcase/fixture/projects/` (gitignored). You populate it by pointing `showcase:seed` at any project directory on disk:

```bash
# By project directory
pnpm showcase:seed --project projects/c02957ec-8ad1-480f-a5e9-62017ad1f525

# By project.json file
pnpm showcase:seed --project /some/path/project.json

# Short flag
pnpm showcase:seed -p projects/c02957ec-8ad1-480f-a5e9-62017ad1f525
```

The script:
- Clears any existing fixture content
- Copies the project (excluding `.trash/`)
- Strips `metadata.userPreferences.colorMode` from `project.json` so the runner controls theming
- Prints the project name and all resource names — copy these into `scenes.mts`

Re-seed any time you want to capture a different project or refresh content from your working copy.

## Running the runner

```bash
pnpm showcase                        # all scenes, both themes
pnpm showcase --scene editor         # one scene, both themes
pnpm showcase --scene editor --scene data   # multiple scenes
pnpm showcase --out ./my-out         # custom output directory
pnpm showcase --port 4000            # custom dev server port
```

Output files are named `<scene-id>--<theme>.png` (e.g. `editor--dark.png`).

## Adding scenes

Scenes are declared in `scripts/showcase/scenes.mts`. Each entry describes the app state to capture:

```ts
{
  id: "my-scene",          // used in the output filename
  route: "/",              // relative URL (the SPA lives entirely at "/")
  steps: [                 // setup interactions run before capture
    { step: "selectProject", projectName: "My Project" },
    { step: "openResource", title: "Chapter 1" },
    { step: "click", selector: '[role="tab"][data-value="data"]' },
    { step: "wait", ms: 400 },
    { step: "hideCursor" },
  ],
  themes: ["dark"],        // omit to capture both light and dark
}
```

No changes to the runner are required as long as the scene only uses existing step primitives.

### Available steps

| Step | Fields | What it does |
|------|--------|-------------|
| `selectProject` | `projectName` | Clicks "Open \<name\>" on the start page and waits for the resource tree |
| `openResource` | `title` | Finds a button containing the title text (Recent Files panel or resource tree) and waits for the editor shell |
| `click` | `selector` | Waits for the selector to be visible, then clicks it |
| `waitFor` | `selector` | Waits for the selector to be visible |
| `wait` | `ms` | Pauses for the given number of milliseconds |
| `hideCursor` | — | Moves the mouse off-screen so it doesn't appear in the screenshot |

### Adding a new step primitive

Add the new step variant to the `SceneStep` union in `scripts/showcase/types.mts`, then implement it in the `switch` in `scripts/showcase/steps.mts`. The exhaustive `never` check will surface any unhandled case at compile time.

## Theming

The runner seeds `localStorage` with the appearance preference before each page load via `context.addInitScript`. The fixture's `project.json` must not set `metadata.userPreferences.colorMode` — `showcase:seed` removes it automatically, but if you edit `project.json` manually, keep that field absent.

The app has two theme layers:
- **`AppearanceRuntime`** applies `gw-theme-dark`/`gw-theme-light` to `<html>` from localStorage — controls Radix portals
- **`AppShell`** applies `.appshell-theme-dark` from `resolvePreferredColorMode()`, which checks project metadata first then falls back to the global localStorage preference

Both layers are controlled by the localStorage seed when the project has no `colorMode` override.

## File map

```
scripts/showcase/
  run.mts          — main runner (boot → capture → teardown)
  boot.mts         — Next.js dev server lifecycle
  scenes.mts       — scene manifest (edit this to add/change scenes)
  steps.mts        — step primitive implementations
  seed-fixture.mts — fixture seeding CLI
  types.mts        — shared types (Scene, SceneStep, Theme, Viewport)
  fixture/         — gitignored; populated by showcase:seed
```
