# Task 29: device runs (LEAD-RUN)

Run on 2026-11-11 by the lead with the owner. Driving method per run is stated. Observed values only; where a cause is given it says what established it.

## Runs

| Run | Device / client | Build | Driven by |
|---|---|---|---|
| P1 | Pixel 7 Pro (`cheetah`), Android 17, WebView 157.0.8103.50 | debug APK from `92230963` (built 10:55) | owner by hand; lead read stored files with `adb run-as` |
| P2 | same | debug APK from `16b4dbd1` (fixes D1, D2, D6, Open opens the panel) | owner by hand |
| P3 | same | debug APK from `bbe01407` (keep your place at phone width) | owner by hand; lead hooked console and paste events over WebView DevTools |
| E1 | Emulator `Medium_Phone_API_36.1`, Android 16, WebView 134.0.6998.135 | debug APK from `92230963` | agent, CDP DOM scripting (an emulator run, not a device run) |
| D1 | Paired device: the Pixel's browser paired to a **packaged** desktop app (`pnpm electron:package` from `feat/claim-ledger` at `310e2c84`), home-network sharing on, throwaway project in the packaged app's Documents workspace | packaged build | owner by hand |

## Results

| Item (FR-24) | Result | Run |
|---|---|---|
| Module off by default, switched on: Claims tab appears; off: tab gone | PASS. Stored `config.modules` became `{ claims: true }` | P1, E1 |
| Mark as claim, statement, starts Unverified with a date | PASS. Stored `claim: { status: "unverified", statusChangedAt: "2026-11-11T18:36:43.517Z" }`, `target: null`, equal to `createdAt` | P1, E1 |
| Claim controls reachable on a phone | FAIL on P1 (D6: the Cite selection and Mark as claim forms filled the screen, the Annotations panel started at the bottom edge and the region did not scroll; screenshot by owner). PASS on P2 after `16b4dbd1` (collapsed disclosures, shell scrolls) | P1, P2 |
| Link a Source, change status, status date | PASS. Status Verified, "Status changed 2026-11-11", "Source: Baz". On E1 linking left `statusChangedAt` unchanged and Verified changed it | P2, E1 |
| Claims tab, filters, Open at passage | PASS. Open also opens the Annotations panel at the claim (P2). Known limit: on the phone the passage ends a little above the visible area after Open; the owner scrolled up | P2, E1 |
| Source moved to Trash, then restored | PASS. Panel "(removed)", tab "(in Trash)", status kept; plain name after restore | P3, E1 |
| Passage text deleted | PASS. Kept under Detached with Re-attach; the Claims tab marks it detached; Open says the passage is missing; Re-attach works with status and date kept | P3 (tab marking after `16b4dbd1`), E1 (panel only; tab gap D2 seen there before the fix) |
| Copy and paste of a claim | PASS on E1 (synthetic clipboard events: new id, same status, date and Source). **Not carried on Android (P3)**: the context-menu Paste does nothing, and a paste from the keyboard clipboard inserts plain text. Measured over DevTools: `navigator.clipboard.readText()` rejects with `NotAllowedError: Read permission denied`, `clipboard-read` permission state `denied`, and no `paste` event was recorded for either paste. Predates this feature (note_db4eb79f) | P3, E1 |
| Revision restore | PASS on E1 (Roll Back rejoined the claim with fields unchanged). Not run on the Pixel | E1 |
| Search for the statement | PASS. "Note:" hit | P3, E1 |
| Module off: claim shown as a plain note, Source line hidden | PASS on P3 (after D1 fix). FAIL on E1 before the fix (Source line shown, D1) | P3, E1 |
| Keep your place (Feature 100) at phone width | FAIL on P2 (after D6 the restore went to the top). PASS on P3 after `bbe01407` within a session. A full close of the app returns to the first character, which is Feature 100's documented scope (session memory, never persisted) | P2, P3 |
| Paired device: claim write, note write, status change, link change | First attempt against the desktop failed with "The claim could not be saved. crypto.randomUUID is not a function"; browsers expose `crypto.randomUUID` only in secure contexts and a paired device is plain HTTP. Fixed in `310e2c84` (`generateUUID`). PASS on D1 for Mark as claim, Add note, status Disputed and Link Source | D1 |
| Paired device: delete refused under `permanentDeletion` | PASS | D1 |
| Paired device: changes shown in the desktop window | PASS | D1 |
| Project type declaring Claims on starts a new project with it on | NOT RUN on Android: saving project types is off there (banner, Save disabled, modules read-only; seen on E1). Run on desktop in Stage 6.5 | E1 |
| Encrypted-marked project refused on Android | NOT RUN | — |

## Observed along the way

- Pairing against `pnpm electron:dev` failed: the pairing form reloaded with `?` appended. Measured: in dev mode the server is `next dev` (Turbopack) and some chunk paths contain `%5Bturbopack%5D`; the sharing gate refuses a `/_next/static/` path containing `%` (`gate.ts`), returning 307 to `/pair` for those chunks while a chunk without `%` returned 200. The packaged build paired. Also seen: after the Electron dev window exited, its `pnpm dev` / `next dev` / `next-server` kept running (parent PID 1) and held port 7340. Both predate this feature.
- Wireless adb timeouts before the first install are recorded in `task-28.md`.

## Not verified

- Other Android devices or versions on hardware (E1 is an emulator); `getwrite_min_api24` was not run.
- Claims on an encrypted-marked project on Android.
- Revision restore and document duplicate with claims on the Pixel.
- Tab load time on a large project (E1: 102 ms for two claims in one document).
- Accessibility on Android (TalkBack).
- A pasted claim on Android (not carried; see above).
