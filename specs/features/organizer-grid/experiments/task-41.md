# Task 41: build, install and inlining check (LEAD-RUN)

Run by the lead from the main checkout, outside the command sandbox. Written at close-out (2026-11-12): the build and install were done on 2026-11-11 for the Pixel run, the inlining grep against the `build:native` output of the Task 44 CI run.

| Step | Command | Result (observed) |
|---|---|---|
| Native build (for the device) | `pnpm build:native` in `frontend/`, at `457b2e68` | Exit 0. "Native static export produced at frontend/out (18 top-level entries)." |
| Capacitor sync | `pnpm sync` in `android/` | Exit 0. |
| Gradle debug assemble | `./gradlew :app:assembleDebug -q` in `android/android/` (JAVA_HOME = Android Studio JBR) | Exit 0. `app-debug.apk` 11,209,541 bytes, 2026-11-11 22:53. |
| Install | `adb -s 192.168.4.27:42655 install -r app-debug.apk` | "Success". Package `works.saboteur.getwrite`. Device and versions: see `task-42.md`. |
| Native build (for the grep) | `pnpm build:native` in `frontend/`, at `3b17f82f`, in the Task 44 CI run | Exit 0, 18 s. `frontend/out/index.html` 2026-11-12 15:30. |
| Inlining grep | `grep -rl NEXT_PUBLIC_GETWRITE_RUNTIME frontend/out/_next/static \| wc -l` | 0 files. |
| New client modules present | `grep -rl "<text>" frontend/out/_next/static \| wc -l` for "Save current arrangement", "not shown. Narrow the source", "Loading the smart folder", "Other values" | 1 file each. |
| Storybook build and `pnpm test:e2e` (includes Task 39's `e2e/organizer-grid-phone.e2e.spec.ts`) | `pnpm test:e2e` in `frontend/`, at `3b17f82f`, Task 44 CI run | Exit 0, 254 passed. The phone spec's four cases passed (groups at 360px and 767px with no grid and no horizontal scroll, grid at 768px, the first-paint case at 360px). What the first-paint case recorded was not read out of the run. |

The un-export commit `2cd2d11b` came after the grep build; it changes only `export` keywords and deletes two unused type aliases.
