# Task 28: build, install and inlining check (LEAD-RUN)

Run by the lead on 2026-11-11 from the main checkout, outside the sandbox, at commit `92230963` (branch `feat/claim-ledger`, Tasks 1-27 plus fixes A-E).

| Step | Command | Result (observed) |
|---|---|---|
| Native build | `pnpm build:native` in `frontend/` | Exit 0. 18.6 s wall clock. "Native static export produced at frontend/out (18 top-level entries)." |
| Inlining grep | `grep -rl NEXT_PUBLIC_GETWRITE_RUNTIME frontend/out/_next/static \| wc -l` | 0 files. |
| New client modules present | `grep -rl "Mark as claim" frontend/out/_next/static`; `grep -rl "Claims can't be changed" frontend/out/_next/static` | 1 file each, so the build contains the claim control and the claims refusal text. |
| Capacitor sync | `pnpm sync` in `android/` | Exit 0. |
| Gradle debug assemble | `./gradlew :app:assembleDebug -q` in `android/android/` (JAVA_HOME = Android Studio JBR) | Exit 0. `app-debug.apk` 11,186,279 bytes, 2026-11-11 10:55. |
| Install | `adb -s 192.168.4.27:42655 install -r app-debug.apk` | "Success". `lastUpdateTime=2026-11-11 11:21:31`. Device: Pixel 7 Pro (`cheetah`), Android 17, WebView 157.0.8103.50. |

## Observed along the way, cause not established

- Wireless adb to the Pixel first failed: the phone was announced over mDNS at `192.168.4.27:33541`, then `:42655` after a toggle, but `adb connect` and `nc -z` timed out from the lead's shell and from the owner's shell, while ARP resolved the phone on `en0`. At 11:21 the phone was listed as connected on `192.168.4.27:42655` without a further change by the lead. Which change made it reachable was not determined.
- The same APK is also installed on the `Medium_Phone_API_36.1` emulator for the emulator runs recorded in `task-29.md`.
