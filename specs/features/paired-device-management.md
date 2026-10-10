# Feature Spec: See, rename and revoke paired devices

> **Scope note:** this is larger than the 500-word guideline for a feature
> spec, as the Feature 75 spec it builds on is. Source: Feature 76 in
> `specs/product/getwrite.features.md`; US-27, FR-66 to FR-68 and the resolved
> OQ-67 to OQ-75 in `specs/product/getwrite.md`; the shipped Feature 75 code
> and `specs/features/home-network-sharing.md`. Feature 75 is merged to main
> and not released.
>
> **Release hold (Owner decisions, 2026-10-09):** nothing containing Feature
> 75 is released until Features 76, 77 and 80 are all merged. This feature is
> one of the three. Until it merges, a writer who shares has no way from the
> desktop app to cut a paired device off (Feature 75 accepted limit H1: a
> cookie captured on the network works until revoke exists).
>
> **Provenance labels.** **Owner decision, 2026-10-09** is used for the points
> the owner decided in the product spec (OQ-69 to OQ-75, FR-67) and in the
> Feature 75 run. **Read, not run** means read in code or a file, cited, and not
> executed. **Measured** means a recorded run, cited to
> `specs/features/home-network-sharing/experiments.md` (cited as "experiments
> section X"). **Unverified** means not established; the experiment that would
> settle it is named. **Working copy** is wording this spec proposes and the
> owner confirms at the exercise stage. A measurement is a fact; a cause is a
> hypothesis, and where a cause is not established it is not stated. Nothing in
> this document was run by its author.
>
> **Gate 3 (2026-10-09).** The owner approved this spec ("1a, 2a, 3a, 4a,
> approved"). Four open questions were answered individually and are labelled
> **Owner decision, Gate 3, 2026-10-09** (OQ-1, OQ-2, OQ-8, OQ-9). Seven were
> triage defaults presented with the spec and approved with it, not answered
> one by one, and are labelled **Recommended default from triage, approved by
> the owner at Gate 3, 2026-10-09 as part of approving the spec** (OQ-3 to
> OQ-7, OQ-10 to OQ-12). One was settled by reading and is labelled
> **Resolved from evidence (triage, read not run)** (OQ-13). Three facts are
> not established and are labelled **To be settled by experiment (plan task)**
> (OQ-14 to OQ-16). See "Resolved questions" below.

## Overview

A writer who has turned on home-network sharing (Feature 75) and paired some of
their own devices has, today, no way to see which devices are paired, to give
them names they recognise, or to cut one off, for example a lost tablet. The
only remedy is to delete the credential file from the app's data folder by
hand, which removes every pairing at once (experiments section J, found during
the run). This feature adds, in the desktop app only, a list of paired devices,
a way to rename a device, and a way to revoke one device, after which that
device is refused on its next request and until it is paired again with a new
code. A paired device cannot see or change any of this.

## Goals

- The writer can open the desktop app and see every device that is currently
  paired, each with a name and the date it was paired, and can tell a missing
  or unreadable list from an empty one.
- The writer can rename a paired device, and the new name is still there after
  the app restarts.
- The writer can revoke one paired device; that device is refused on its next
  request, with no restart, and sees the pairing screen; other paired devices
  are unaffected.
- Nothing outside the desktop window can list, rename or revoke a device.
- A failed rename or revoke is reported as failed, and the list never shows a
  state that is not the stored one.

## Non-goals

- Limits on what a paired device can do, and the project-deletion opt-in
  (Feature 77). Under this feature alone a paired device still has the full
  route set, including lock and unlock; the Feature 75 interim exposure note
  stays until Feature 77 removes it.
- Any device management from a paired browser. A paired device MUST NOT be
  able to list, rename or revoke devices (Owner decision, 2026-10-09, product
  OQ-73).
- The two-client save measurement and the "last save wins" statement
  (Features 78 and 79); the port change (Feature 80).
- TLS, headless or NAS delivery, the native Android app as a client, accounts,
  and collaboration or per-person permissions. A device credential is not an
  account (Owner decision, 2026-10-09, OQ-69), and a device name does not
  identify a person.
- Any change to pairing codes, the gate's classification rules, the Host
  allowlist, the same-origin check, or encryption at rest.
- An expiry for credentials. They have no expiry until revoked (Owner
  decision, 2026-10-09, OQ-8 of Feature 75).
- A history or audit log of pairings and revocations: revoke deletes the
  device record and keeps no revoke history (Owner decision, Gate 3,
  2026-10-09, OQ-1).
- "Revoke all" (Owner decision, Gate 3, 2026-10-09, OQ-8).
- Repair of a corrupt or unreadable credential store from the UI (Owner
  decision, Gate 3, 2026-10-09, OQ-9).
- A "last used" time or any new stored field on a device record (OQ-3, OQ-12).

## User stories

- US-1: As a writer on deadline who has paired my own devices, I want to see a list of them in the desktop app so that I know what can currently reach my projects.
- US-2: As a writer on deadline, I want to rename a paired device so that I can tell my iPad from my phone when the automatic name is the same for both.
- US-3: As a writer on deadline, I want to revoke one paired device from the desktop app so that a lost or borrowed device is refused immediately, without turning sharing off for my other devices.
- US-4: As a writer on deadline, I want to have a revoked device told plainly that it is not paired, and be able to pair it again with a new code, so that I can tell a revoked device from a broken app and take it back deliberately.
- US-5: As a writer on deadline, I want to manage devices only in the desktop app, so that a device I have paired cannot see, rename or revoke my other devices.

## Functional requirements

FR-1: The desktop app MUST show a list of the paired devices in the install's credential store, each with its name and the date and time it was paired (the stored `createdAt`). The list MUST be obtained through the desktop bridge. It MUST show nothing for a device other than what is stored; in particular it MUST NOT claim a "last used" time, because none is stored (Read, not run: a device record holds `id`, `name`, `createdAt` and `credentialHash`, `frontend/src/lib/sharing/credential-store.ts`). The list shows name and paired date only; no new stored field is added (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-3). [US-1]

FR-2: A credential, a credential hash, the device cookie value and the window secret MUST NOT be sent to the renderer, shown, or written to any log, by the list, rename or revoke paths. What crosses the bridge for a device MUST be its `id`, `name` and `createdAt`, and nothing else. The list result MAY also carry the store directory path (FR-18), which is not a secret. A test MUST fail if a list response contains a `credentialHash` key or any 64-character hexadecimal string. [US-1]

FR-3: Listing, renaming and revoking devices MUST be reachable only from the desktop window, by new desktop bridge channels registered in the Electron main process, each of which MUST apply the same sender check as the four sharing channels (`assertTrustedSender`, which refuses a call whose `event.senderFrame?.url` is not on the local origin, including a `null` sender; Read, not run: `electron/src/main.ts`). No HTTP route MAY return the device list, rename a device or revoke one (Owner decision, Gate 3, 2026-10-09, OQ-2a). [US-5]

FR-4: This feature MUST NOT add an HTTP route (Owner decision, Gate 3, 2026-10-09, OQ-2a: the Electron main process writes the store directly, so there is no route to protect). The reason this matters is that the gate passes a `confirmed` device to every route and per-route capability limits do not exist until Feature 77 (Read, not run: `gate.ts` forwards a `confirmed` request after the same-origin check only), so any route added for this would be reachable by a paired device. FR-5(c) proves the absence. [US-5]

FR-5: There MUST be automated tests, written before the feature is considered done, that show the exclusivity at each place it can fail: (a) the new channel names appear on the preload bridge and on `ipcMain.handle`, each handler's body begins with the sender check, and no channel is registered without it (extending `electron/tests/sharing-ipc-surface.test.ts`); (b) a handler called with a `null` sender, a foreign-origin sender and a lookalike origin (`http://localhost:30001/`) throws and changes nothing; (c) a walk of every `route.ts` under `frontend/app/api` finds no route that reads or writes the credential store other than `POST /api/sharing/pair`; (d) with sharing on and a paired credential, a `confirmed` request to a path that would plausibly serve device management (for example `/api/sharing/devices`) is not served by any device-management handler (it is refused by the gate or answers 404, whichever is true, recorded as observed); (e) the desktop bridge is absent in a browser, so the device-management UI renders nothing there (Read, not run: `SharingSettings.tsx` returns `null` without `getDesktopBridge()`). What these tests do not prove, and nothing in this feature proves, is the behaviour of a running Electron renderer when a foreign page is loaded into it; the navigation guard (Feature 75, FR-35) is the control and was not exercised in a running Electron (experiments section J, item 18). [US-5]

FR-6: A writer MUST be able to rename a paired device from the list. The new name MUST be stored in the credential store against that device's `id`, MUST survive an app restart, and MUST NOT change the device's `id`, `createdAt` or credential, so the device stays paired and its cookie keeps working. The rename MUST take effect in the stored record without a server restart. [US-2]

FR-7: The rename MUST be validated on the main-process side, not only in the form: a submitted name is trimmed; it MUST be refused if it is not a string, is empty after trimming, or is longer than 64 characters after trimming; control characters MUST be refused; two devices MAY share a name (the automatic naming already gives "Chrome on Mac" to two Macs). An empty name MUST be refused with a visible message; it MUST NOT revert to the automatic name, which is not kept once overwritten. The 64-character limit MUST be applied in the main process, and the implementing task MUST state, and test, whether 64 counts UTF-16 code units or code points; this spec does not choose. A refused name MUST leave the stored record unchanged and MUST be explained to the writer in text. The name is displayed only as text and MUST never be inserted as markup. (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-5.) [US-2]

FR-8: A writer MUST be able to revoke one paired device from the list. Revoking MUST make that device's credential stop confirming: the device's next request, of any kind, MUST be classified `not-confirmed` with no restart of the server or the app, and no other device's credential MAY be affected. (Read, not run: the server reads the store from disk on every non-window request, `findDeviceByToken` and `loadStore` in `gate.ts`; the store is not cached in module state. Measured in experiments section I: with `device-credentials.json` moved away, typing in a paired browser's open editor led, within six seconds, to `/pair?reason=unpaired`; that was a hand-started server and a moved file, not a revoke performed by this feature, so FR-9 requires the same to be measured for a real revoke.) [US-3]

FR-9: Verification MUST include a built-server check, run with the real revoke path, that after revoking device A (a) A's next page request is redirected to `/pair`, (b) A's next API request is answered 401 with `x-getwrite-gate: not-paired`, (c) A's open editor leaves for the pairing screen through `DeviceNotPairedGuard` and the unsaved text is not reported as saved, and (d) a second paired device B, paired before the revoke, still has every one of those requests answered normally. Every route and page in the enumeration used by `frontend/tests/unit/sharing-gate-enumeration.test.ts` and `frontend/scripts/sharing-refusal-smoke.mjs` MUST be refused for A's old credential, not only a sample. [US-3] [US-4]

FR-10: A revoked device that is still open MUST see why, in text: its page load ends on the pairing screen, which says the device is not paired and how to pair, and its in-app fetch is not shown as an empty list (`docs/standards/failure-visibility.md`). This is Feature 75's existing behaviour for an unknown credential (Read, not run: `classifyRequest` returns `not-confirmed: unknown-credential` for a cookie that matches no stored hash, and `refuseNotPaired` redirects pages and answers 401 JSON for API requests); this feature MUST NOT change the gate's classification rules, only add a way to make a credential unknown. Revoke deletes the device's record (Owner decision, Gate 3, 2026-10-09, OQ-1a), so the gate, `classifyRequest` and every reader are unchanged and a revoked credential is simply unknown. A revoked device therefore sees the existing "not paired" behaviour, because after a delete nothing distinguishes a revoked credential from one never paired (Resolved from evidence, triage, read not run, OQ-13). The existing text of the pairing screen MUST NOT be changed to name revocation. [US-4]

FR-11: A revoked device MUST be able to pair again with a fresh code, and the result MUST be a new credential, a new device record with a new `id`, and a new cookie that replaces the old one. The old credential MUST NOT work again, including after the re-pair. The re-pair MUST be tested through the real pair route, with the revoked browser still holding its old cookie. (Read, not run: the pair route is reachable by a request carrying an unknown cookie because the pairing exception is applied to any `not-confirmed` request whose store is usable, `gate.ts`; the response sets the cookie with the same name and path, which in a browser replaces the old value. The browser replacement is Unverified; the check is to revoke, re-pair in the same browser profile and read which cookie the next request carries.) [US-4]

FR-12: Revoking MUST NOT depend on the device cookie being removed from the device, and MUST NOT try to remove it. The cookie is HttpOnly with a 365-day sliding `Max-Age`, renewed by the gate only for a `confirmed` request (Read, not run: `renewDeviceCookie` is called only in the `confirmed` case), so a revoked device's cookie is never renewed and is not refused for being old; it is refused because its hash is not in the store. The stale cookie stays in the revoked browser until the browser drops it or a re-pair replaces it, and it identifies nothing once its hash is gone. A test MUST show that presenting a revoked device's cookie never returns it to `confirmed`. [US-3] [US-4]

FR-13: Revoking MUST ask for confirmation first. The confirmation MUST name the device being revoked, say plainly what happens (that device is refused from now on, it can pair again with a new code, other devices are not affected), offer a cancel that is the default focus, and MUST NOT use the red token; danger is conveyed by label and the dialog only (`CLAUDE.md`, Styling). The repo's confirmation component is `frontend/components/common/ConfirmDialog.tsx` (Read, not run: props `title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`). Rename needs no confirmation (it is reversible). The confirmation uses the existing `ConfirmDialog`; the sentence "Unsaved edits on that device will be lost." is added to its description only if experiment OQ-15 shows that outcome with a real revoke (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-4). Working copy: title "Revoke this device?"; description "{name} will be refused from now on. It can pair again with a new code. Your other devices are not affected."; confirm "Revoke {name}"; cancel "Keep {name}". [US-3]

FR-14: Every write to the credential store by this feature MUST be serialised against every other writer of the same file with the same exclusive lock-file protocol the server uses (`file-lock.ts`: lock file `device-credentials.json.lock` created with `wx`, mode 0600, retried 200 times at 25 ms, a lock older than 30 s treated as stale, and the file replaced by a 0600 temp file, fsync and rename). The server's pairing path appends a device under that lock (`addDevice`). The Electron main process writes the store directly for rename and revoke, through IPC handlers with the existing sender check (Owner decision, Gate 3, 2026-10-09, OQ-2a), so it is a second writer and MUST implement the lock protocol of `file-lock.ts` faithfully: lock file `device-credentials.json.lock` opened with `wx`, mode 0600; retry on `EEXIST` only, up to 200 times at 25 ms; a lock older than 30 s by mtime is removed; the lock is released in a `finally`; the file is replaced through a `wx` 0600 temp file, written, synced, `chmod` 0600, then renamed, and the temp file is removed on failure. The implementor MUST open `file-lock.ts` and copy these facts from it rather than from this summary. The main process MUST NOT copy `writePairingState` in `electron/src/sharing/pairing-code.ts`, which writes without the lock (Feature 75 security review L4, accepted as known); that accepted limit MUST NOT be reused as a precedent here. The read-modify-write MUST re-read the store inside the lock. It MUST never overwrite a corrupt or unreadable store (FR-16). A rename or revoke MUST preserve every other record, and every field of every record, exactly as stored: main MUST keep records as parsed JSON and not as a narrowed type, because the server's schema strips unknown fields on read and main's writer MUST NOT (OQ-12). Revoke deletes the record for the device's `id`. [US-3] [US-2]

FR-15: The concurrency tests MUST include, against the real lock files and the real file, at least: (a) pairing a new device while a revoke of another device is in flight, repeated enough times to be meaningful (the count is a plan decision), ends with the new device present and the revoked device absent, and no device lost or resurrected; (b) a rename and a revoke of different devices in flight together both persist; (c) two renames of one device end with one of the two names, never a corrupted file; (d) a lock held by a live holder delays the write and a failure to acquire it is reported as a failure (FR-17), not as success; (e) the file parses with the server's reader after every interleaving. The main process is the writer, so it MUST have a contract test over `frontend/tests/fixtures/sharing/` (as `store-status.test.ts` has) so the two implementations of the file format and the lock protocol cannot drift apart: `electron/` and `frontend/` cannot import each other in the build (`electron/tsconfig.json` `rootDir`), so the format is duplicated. Whether the interleaving tests can exercise both real implementations depends on experiment OQ-14: if a frontend vitest test can import an `electron/src/sharing` module by relative path and run it against the server's real `addDevice`, items (a) to (e) MUST run against both real implementations; if it cannot, the two are kept in step by shared JSON fixtures plus per-side lock tests, and the drift risk between them is higher than in the first case and MUST be stated in the experiment record. [US-3] [US-2]

FR-16: A write to the store MUST refuse (and report) when the existing file is corrupt or unreadable, and MUST NOT overwrite it, as `addDevice` already throws "refusing to overwrite" (Read, not run). Rename and revoke on an unreadable store MUST therefore fail visibly. The UI does not repair a corrupt store (Owner decision, Gate 3, 2026-10-09, OQ-9a); FR-18 says what it shows instead. [US-3]

FR-17: A failed rename or revoke (store unreadable, lock not acquired, write failed, device no longer in the store) MUST say so in text, in the desktop window, and MUST NOT look like success. After any rename or revoke attempt, successful or not, the list MUST be re-read from the store and shown as stored; the interface MUST NOT show an optimistic state that the store does not hold. If the device named in the action is no longer in the store (for example revoked a moment earlier), the window MUST say it was already removed and refresh the list. [US-3] [US-2]

FR-18: An unreadable or corrupt store MUST NOT be shown as "no paired devices". The list area MUST say the list cannot be read, using or extending Feature 75's existing store-corrupt message (`SHARING_STORE_CORRUPT`), and a missing store file MUST be shown as no paired devices (a missing file means none are paired; `readCredentialStore` returns `empty` only for `ENOENT`). For a corrupt store the UI MUST offer no repair action (Owner decision, Gate 3, 2026-10-09, OQ-9a); it MUST name the location of the file so the writer can act by hand. That location is the app's `userData` folder, which for the unpacked or packaged macOS build the owner reports is `~/Library/Application Support/getwrite-electron/` (owner-supplied, experiments section J). The UI MUST show the actual path obtained from the app at runtime (the main process's `app.getPath("userData")`, carried in the list result), and MUST NOT hard-code a path. [US-1]

FR-19: The list MUST be refreshed when the device list is opened, and after each rename or revoke, and MUST also refresh by a short poll while the list is visible, so a device that pairs while the writer is looking appears. The poll interval is chosen by the implementing task and recorded there; the poll MUST stop when the list is not visible. A list that has not been refreshed MUST NOT claim to be current. (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-6.) [US-1]

FR-20: The list MUST be shown whenever sharing is enabled or in effect, or the store holds at least one device, so revoke works with sharing off (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-7). Revoking while sharing is off or pending restart MUST be recorded in the store and MUST apply on the first request after sharing is next in effect, because credentials are kept when sharing is turned off (Feature 75, FR-23). [US-3]

FR-21: The list lives in its own component with its own heading inside the "Home network sharing" section of App Settings, and its device region MUST scroll when there are many devices (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-10). The list and its actions MUST meet the accessibility standard (WCAG 2.1 AA, `docs/standards/accessibility.md`): the list is a semantic list or table with a heading; every action button's accessible name includes the device name (for example "Rename Safari on iPad", "Revoke Safari on iPad"), so two devices with the same automatic name are distinguishable by something other than position, which is why the paired date MUST be in the accessible name or description when names collide; everything is operable by keyboard; focus is returned to a sensible place after a revoke (the next device, or the list heading when none remain) and after a cancelled rename or dialog; the result of a rename or revoke and any error is announced through a polite live region or an `alert`; the rename field has a visible label; text meets AA contrast; and no state is conveyed by colour alone. An axe test in the pattern of `frontend/tests/a11y/sharing-settings.a11y.test.tsx` MUST cover the list in the states: empty, several devices, store unreadable, a rename error, and the revoke dialog open. The accessibility checks MUST include that focus returns to a sensible place when the nested confirmation dialog closes (OQ-10). [US-1] [US-2] [US-3]

FR-22: The interface text MUST be plain words, MUST NOT use the red token or alert styling for these states, and MUST be kept in one copy module (`sharing-copy.ts`) as the existing sharing copy is. All strings this spec proposes are working copy, confirmed by the owner at the exercise stage. Working copy: heading "Paired devices"; empty "No devices are paired."; unreadable "The list of paired devices cannot be read, so every other device is refused until it is repaired." followed by the location of the file, "The file is in {path}." with the path taken at runtime (FR-18); row action "Rename" and "Revoke"; rename error "Could not rename this device."; revoke error "Could not revoke this device. It is still paired."; already gone "This device was already removed." [US-1] [US-2] [US-3]

FR-23: With sharing off, no network and no account, the desktop app MUST behave as it does before this feature; the new bridge channels MUST be inert unless called; revoking a device MUST NOT touch a live pairing code or `pairing-state.json` (OQ-11); a web or hosted build has no desktop bridge and MUST show none of this. Nothing in this feature MAY alter the gate's classification, the Host allowlist, the same-origin check, the pairing code logic or the cookie attributes. [US-5]

FR-24: The existing automated checks MUST still pass unchanged in meaning: `pnpm test:sharing-smoke` (the refusal smoke script, last recorded run: 90 enumerated entries, 24 checks, 0 failures, from the host to itself; experiments section F) and `frontend/tests/unit/sharing-gate-enumeration.test.ts`. Verification MUST also include loading the built app in a browser: Feature 75's run found a defect that only loading the page in a browser caught (experiments section I, first run: a chunk with `..` in its name was refused so the pairing page did not hydrate). The built-server and browser checks MUST run in the main checkout and not in a git worktree, because builds did not work in the implementors' worktrees (experiments section F; cause not established). [US-3] [US-4]

FR-25: Manual verification on real hardware MUST be listed with exact steps and a recorded result, because no request from a second device has been made against the finished gate and the Electron window's sharing controls were exercised only by the owner's report (experiments section J). The steps MUST include: pair a phone and a second browser profile; rename the phone; quit and reopen the app and see the name; revoke the phone from the desktop; on the phone, reload and see the pairing screen, and see an in-app action end at it; confirm the second profile still works; pair the phone again with a new code. A step that is not run MUST be recorded as not run. [US-3] [US-4]

FR-26: The developer documentation MUST be updated in the same change: `docs/features/home-network-sharing.md` states "No device list, rename or revoke UI exists" and the Feature 75 "Accepted limits" cite revoke as pending; `CLAUDE.md`'s sharing descriptions, if they say the same, MUST be corrected; and `specs/product/getwrite.features.md` Feature 76's status is updated by the owner's process, not by this feature's implementer. [US-3]

## Open questions

Questions OQ-1 to OQ-13 were resolved at Gate 3 (2026-10-09); each is kept as a pointer so the identifiers stay contiguous, and the full text is under "Resolved questions". OQ-14 to OQ-16 are facts not yet established; each names the experiment that settles it.

- OQ-1 (resolved at Gate 3, 2026-10-09; see Resolved questions) Revoke deletes the device record.
- OQ-2 (resolved at Gate 3, 2026-10-09; see Resolved questions) The Electron main process writes the store.
- OQ-3 (resolved at Gate 3, 2026-10-09; see Resolved questions) Name and paired date only.
- OQ-4 (resolved at Gate 3, 2026-10-09; see Resolved questions) Confirmation dialog for revoke; warning sentence depends on OQ-15.
- OQ-5 (resolved at Gate 3, 2026-10-09; see Resolved questions) Rename rules.
- OQ-6 (resolved at Gate 3, 2026-10-09; see Resolved questions) Refresh on open, after actions, and a short poll.
- OQ-7 (resolved at Gate 3, 2026-10-09; see Resolved questions) List shown with sharing off when it matters.
- OQ-8 (resolved at Gate 3, 2026-10-09; see Resolved questions) Revoke all is out of scope.
- OQ-9 (resolved at Gate 3, 2026-10-09; see Resolved questions) No UI repair of a corrupt store.
- OQ-10 (resolved at Gate 3, 2026-10-09; see Resolved questions) Own component inside the sharing section.
- OQ-11 (resolved at Gate 3, 2026-10-09; see Resolved questions) Revoke does not touch a live pairing code.
- OQ-12 (resolved at Gate 3, 2026-10-09; see Resolved questions) No format change; raw records preserved.
- OQ-13 (resolved; see Resolved questions) A revoked device sees the existing "not paired" behaviour.
- OQ-14 (To be settled by experiment (plan task), result recorded before dependent work): Can a frontend vitest test import an `electron/src/sharing` module by relative path and run it against the server's real `addDevice`? Impact: FR-15. Experiment: write the import in a throwaway test under `frontend/tests/` and run it with `pnpm exec vitest run`; record the outcome and remove the throwaway.
- OQ-15 (To be settled by experiment (plan task), result recorded before dependent work): What happens to unsaved text in an open editor on a device that is revoked through the real path against a built server? Impact: FR-13 (whether the dialog gains the sentence "Unsaved edits on that device will be lost."), FR-9(c). Experiment: build, start the standalone server with two paired browsers, type in A's editor, revoke A through the main-side writer, and record what A shows and whether the typed text is saved anywhere. Not yet run with a real revoke; experiments section I used a moved file and a hand-started server.
- OQ-16 (To be settled by experiment (plan task), result recorded before dependent work): Does pairing again in the same browser profile replace the old cookie? Impact: FR-11. Experiment: revoke, re-pair in the same Playwright Chromium profile, and read which cookie the next request carries.

## Resolved questions (Gate 3, 2026-10-09)

Format follows `specs/features/home-network-sharing.md`. Four provenance labels are kept distinct: the owner answered OQ-1, OQ-2, OQ-8 and OQ-9 individually ("1a, 2a, 3a, 4a, approved"); OQ-3 to OQ-7 and OQ-10 to OQ-12 are triage defaults that were presented and approved by the owner as part of approving the spec; OQ-13 was settled by reading.

- OQ-1 (resolved): Does revoking delete the device's record, or keep it marked as revoked? Resolution: (a) revoke DELETES the device record. The gate, `classifyRequest` and every reader are unchanged; a revoked credential is simply unknown. No revoke history is kept. Evidence: Owner decision, Gate 3, 2026-10-09, option (a). Impact: FR-8, FR-10, FR-11, FR-14, Non-goals.
- OQ-2 (resolved): Which process writes the store for rename and revoke? Resolution: (a) the Electron main process writes `device-credentials.json` directly, through IPC handlers with the existing sender check. No new HTTP route. Main implements the lock protocol of `file-lock.ts` faithfully (FR-14), re-reads the store inside the lock, never overwrites a corrupt or unreadable store, and preserves every other record as parsed JSON. It must not copy `writePairingState`, which writes without the lock (accepted limit L4). Evidence: Owner decision, Gate 3, 2026-10-09, option (a). Impact: FR-3, FR-4, FR-5, FR-14, FR-15, FR-16.
- OQ-3 (resolved): What does the list show beyond the name? Resolution: name and paired date only; no new stored field; no "last used". Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-1, FR-2.
- OQ-4 (resolved): Confirmation. Resolution: the existing `ConfirmDialog` for revoke; none for rename; the sentence "Unsaved edits on that device will be lost." is added to the dialog only if the experiment OQ-15 shows that outcome with a real revoke. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-13.
- OQ-5 (resolved): Rename rules. Resolution: name trimmed, 1 to 64 characters, control characters refused, duplicates allowed, an empty name refused with a visible message, validated in the main process; whether 64 counts UTF-16 code units or code points is left to the task, which must state and test it. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-6, FR-7, FR-21.
- OQ-6 (resolved): Does the list update while open? Resolution: refresh on open and after every action, plus a short poll while the list is visible; the interval is chosen by the task and recorded. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-19.
- OQ-7 (resolved): Is the list available when sharing is off or pending? Resolution: the list is shown whenever sharing is enabled or in effect, or the store holds at least one device, so revoke works with sharing off. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-20.
- OQ-8 (resolved): "Revoke all". Resolution: (a) out of scope. Evidence: Owner decision, Gate 3, 2026-10-09, option (a). Impact: Non-goals, FR-13.
- OQ-9 (resolved): Corrupt store repair. Resolution: (a) no repair from the UI; show the existing corrupt-store message and name the file's location so the writer can act by hand. The location is the `userData` folder (for the unpacked or packaged macOS build the owner reports `~/Library/Application Support/getwrite-electron/`); the UI shows the actual path obtained from the app at runtime and does not hard-code one. Evidence: Owner decision, Gate 3, 2026-10-09, option (a). Impact: FR-16, FR-18.
- OQ-10 (resolved): Where does the list live? Resolution: its own component with its own heading inside the sharing section of App Settings; a scrolling list region for many devices; the nested confirmation dialog's focus return is an accessibility check to include. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-21.
- OQ-11 (resolved): Does revoking affect a live pairing code? Resolution: no; revoke does not touch a live pairing code or `pairing-state.json`. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-14, FR-23.
- OQ-12 (resolved): Format versioning. Resolution: no format change and no version bump; main preserves other records as raw JSON. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-14, FR-15.
- OQ-13 (resolved): Does the revoked device's view say "revoked"? Resolution: no; a revoked device sees the existing "not paired" behaviour, since after a delete nothing distinguishes revoked from never paired. Evidence: Resolved from evidence (triage, read not run). Impact: FR-10.

## Decided and not reopened

- A writer can see their paired devices in the desktop app and revoke any one; a revoked device is refused until paired again; devices are named automatically at pairing and renamable; management is in the desktop app only; a credential is not an account; credentials have no expiry until revoked (Owner decision, 2026-10-09; product FR-67, OQ-69, OQ-72, OQ-73).
- Device credentials are held in `device-credentials.json` in `userData`, hashes only, mode 0600, atomic writes under a lock file; the server reads the store from disk on every request with no cache (Read, not run: `credential-store.ts`; Measured, experiments section I: moving the file away sent a paired browser to the pairing screen within six seconds, against a hand-started server). A corrupt store refuses every non-window request and the desktop says so. The packaged-unpacked `userData` on the owner's machine is `~/Library/Application Support/getwrite-electron/` (owner-supplied, experiments section J).
- The 365-day sliding cookie exists (`DEVICE_COOKIE_MAX_AGE_SECONDS`, 31536000; the value is Feature 75's OQ-13, still pending owner confirmation). Revoke does not depend on it (FR-12).
- Release hold: 76, 77 and 80 merged before any release containing 75.

## Out of scope (deferred)

- Capability limits for a paired device and the project-deletion setting (Feature 77), including removal of the interim exposure note.
- The two-client save measurement (Feature 78) and the "last save wins" statement (Feature 79).
- Changing the desktop server's default port (Feature 80).
- TLS, headless or NAS delivery, and the native Android app as a client.
- A "last used" time, a pairing history, revoke all, and repair of a corrupt store from the UI (OQ-3, OQ-1, OQ-8, OQ-9).
- Device management from anywhere other than the desktop window.
