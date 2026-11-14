# Task 27: build and inlining check (FR-1 h)

Run by the lead on 2026-11-13 (23:06 UTC) from the main checkout, outside the command sandbox, at commit `0d0f22c4` on `feat/folklore-variants`.

| Check | Command | Result |
|---|---|---|
| Web build | `pnpm build` (frontend, `next build`) | exit 0, about 24 s wall clock; the route list includes `ƒ /api/folklore/variant-text` |
| Native static export | `pnpm build:native` | exit 0, about 18 s wall clock; "Native static export produced at frontend/out (18 top-level entries)" |
| Runtime variable inlined | `grep -rl 'NEXT_PUBLIC_GETWRITE_RUNTIME' frontend/out/_next/static \| wc -l` | 0 files (same as recorded for Features 105 and 107) |
| New client code present in the export | `grep -rl 'Narratives' frontend/out/_next/static \| wc -l`; same for `variant-text` | 7 files; 1 file |

What this shows: both builds succeed with the Feature 110 code, the native export contains the Narratives client code, and no client chunk carries the unreplaced `NEXT_PUBLIC_GETWRITE_RUNTIME` name.

What it does not show: that the native backend runs on a device, or that the tab renders in a WebView (Task 30).
