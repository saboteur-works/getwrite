# Feature Spec: Share projects on the home network, gated by device pairing

> **Scope note:** this is larger than the 500-word guideline for a feature
> spec. It is one slice by decision (Owner decision, Gate 2, 2026-10-09): the
> sharing toggle and the access gate ship together, with the gate built and
> tested before the bind change inside the feature, because a toggle without
> the gate is exactly the forbidden state (see FR-1). Source: Feature 75 in
> `specs/product/getwrite.features.md`; US-27, FR-66 to FR-68 and the
> resolved OQ-67 to OQ-75 in `specs/product/getwrite.md`. Where this document
> and the feature list's Feature 75 entry differ, this document is the later
> authority (the brief for this spec amends the list).
>
> Provenance is marked. **Owner decision, Gate 3, 2026-10-09** is used only
> for the three things the owner answered explicitly (OQ-3, OQ-11, and the
> experiments-first ordering). **Recommended default from triage, approved by
> the owner at Gate 3, 2026-10-09 as part of approving the spec** marks
> defaults that were presented and approved with the spec as a whole; they were
> not answered individually, so they are NOT recorded as explicit owner
> decisions. **To be settled by experiment (plan task), result reported to the
> owner before dependent work** marks questions that an experiment must
> answer. **Read** means read in code or a file, cited, **not run**.
> **Unverified** means not established; the experiment that would settle it is
> named. Nothing in this document was run. A measurement is a fact; where a
> cause or runtime behaviour has not been observed it is stated as unverified
> and not as a cause. Values shown as "working copy" are proposals, not
> confirmed copy.
>
> **Release hold (Owner decisions, 2026-10-09):** Feature 75 MAY merge to
> main before Features 76, 77 and 80, but its release is held until Features
> 76, 77 AND 80 are all merged (that is, 76, 77 and 80 are merged before any
> release containing 75); the owner merges the release PR by hand.
> Feature 80 (change the desktop server's default port; value undecided)
> does not have to precede Feature 75's build, because this spec reads the
> port from a single source (FR-25) and does not depend on its value; it
> must be merged before any release containing Feature 75, because a paired
> device saves the desktop's address (host and port). Until 77 lands a
> paired device has the full route set (including lock, unlock and project
> deletion).
>
> **Experiments first (Owner decision, Gate 3, 2026-10-09):** the owner agreed
> that the experiments named under OQ-1, OQ-2 and OQ-10 are the first tasks of
> the plan, followed by a stop: their results are reported to the owner before
> any task that depends on them starts. This is a requirement on the task list
> (FR-28).

## Overview

A writer who works in the GetWrite desktop app can turn on one setting and
open their projects, from their own tablet or second computer, in that
device's browser over the home network, with no account and no hosted
service. Today the desktop app's bundled server is bound to the loopback
address only, so no other device can reach it (Read: `electron/src/main.ts`
sets `HOSTNAME: "127.0.0.1"`). Making it reachable is only safe if nobody on
the network who has not been confirmed by the writer can read or change
anything, so the setting and the access gate are one feature. A device is
confirmed once, by typing a short-lived, one-time pairing code that the
desktop window shows; the device then holds its own credential. The desktop
app's own window never needs pairing. The setting is off by default, and
while it is on the app says so, says what address other devices use, and
states plainly what the writer is and is not getting (unencrypted HTTP, for
networks they trust; reachable only while the desktop app is open, awake and
on the same network).

## Goals

- With sharing off, which is the state after a fresh install, no other
  device can reach the desktop app's server at all.
- With sharing on, a device the writer has not paired is refused on every API
  route and every page, and sees why and how to pair; a device the writer has
  paired by code can use the app in its browser.
- The desktop window works exactly as before with sharing on or off, with no
  pairing, and with no network and no account.
- The writer can always tell, from the desktop window, whether sharing is on,
  at what address, and what the two plain-words statements say.
- There is no commit that merges in which the server is reachable from
  another device without the gate enforced on every route and page.

## Non-goals

- The paired-device list, rename and revoke interface (Feature 76). This
  feature mints and stores credentials and names devices automatically; it
  does not give the writer a way to list, rename or revoke them.
- Capability limits on a paired device: no changing sharing, pairing or lock
  state, and project deletion only with the desktop-side opt-in (Feature 77).
  Under this feature alone a paired device has the full route set.
- The two-client save measurement (Feature 78) and the in-app "last save
  wins" statement (Feature 79). This feature makes no promise about two
  devices saving the same resource.
- Changing the desktop server's default port (Feature 80). This feature
  fixes no port value (see FR-25).
- TLS or any encryption of the connection; headless, Docker or NAS delivery;
  the native Android app as a client; hosted authentication, accounts,
  Postgres or SMTP; collaboration or per-person permissions; any change to
  encryption at rest (ADR-022).
- Any availability promise beyond "open, awake and on the same network".

## User stories

- US-1: As a writer on deadline who writes on the GetWrite desktop app, I want to turn on sharing and pair my own other devices with a short code, so that I can open my projects in their browsers over my home network without an account or a hosted service, while nobody else on the network can read or change them. (Product US-27.)
- US-2: As a writer on deadline, I want to have sharing off until I turn it on and see clearly whenever it is on, so that I never expose my projects to my network without knowing it.
- US-3: As a writer on deadline, I want to have an unpaired device told plainly why it is refused and how to pair, so that I can tell a pairing problem from a broken app.

## Functional requirements

FR-1: There MUST be no state, in any commit that merges to the main branch, in which the desktop server is reachable from a device other than the machine it runs on while the access gate (FR-8 to FR-12) is not enforced on every API route and every page. Within this feature the gate and its tests MUST be built and passing before any change that makes the server listen on a non-loopback address. [US-1]

FR-2: The desktop app MUST have a single on/off sharing setting, reachable only from the desktop window (not through any route a browser can call). Its value MUST be absent or off by default, and MUST be off after a fresh install. [US-2]

FR-3: With sharing off, the server MUST NOT accept connections from another device: it MUST listen on the loopback address only, as it does today. [US-2]

FR-4: With sharing on, the server MUST listen on all interfaces (Owner decision, Gate 3, 2026-10-09, OQ-3). The accepted consequence is that the server is then also bound on non-LAN adapters (for example VPN and virtual adapters); the access gate (FR-8 to FR-12) is the control. A change to the sharing setting MUST take effect by restarting the server (the bind is fixed when the server starts). The desktop window MUST tell the writer that a restart is happening, and that message MUST be shown before the relaunch call is made, because no window exists after the app quits (Read, not run: `getwrite:restart` is `app.relaunch(); app.quit()`, `electron/src/main.ts` ~245-249). The window MUST NOT leave an unexplained blank window while it restarts. A sharing change and a workspace-folder change MUST share one restart (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-9). Whether `next dev` (the unpackaged path) honours `HOSTNAME` is unverified; the experiment is to run it with a non-loopback `HOSTNAME` and connect from another device, and it is a task in the plan. [US-1]

FR-5: The sharing setting MUST persist across desktop app restarts, and it belongs to the install, not to the workspace folder: it MUST NOT change when the writer changes the workspace folder (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-4 and OQ-9). A writer who turned sharing on and quits the app MUST find it on at the next launch, with the gate in force. [US-2]

FR-6: While sharing is on, the desktop window MUST show, at launch and whenever the main view is shown, a clear "sharing is on" state and every candidate address other devices could use, each as a URL with host and port (private-range / LAN addresses; Owner decision, Gate 3, 2026-10-09, OQ-3). When the machine has no such address, the window MUST say so plainly in text and MUST NOT show a blank address. Working copy for that case: "No network address found." The state MUST be conveyed by text and not by colour alone, and MUST NOT use the red token (red is reserved in this codebase for position and canonical state). [US-2]

FR-7: With sharing on, the desktop window MUST show both plain-words statements: (a) the connection is unencrypted HTTP, meant for networks the writer trusts; (b) other devices can reach the writer's projects only while the desktop app is open, awake and on the same network. The two statements MUST be visible together with the sharing control (not only in documentation) and MUST be shown in non-alert styling. Proposed working copy, pending owner confirmation: (a) "Sharing uses unencrypted HTTP. Turn it on only on a network you trust."; (b) "Your other devices can reach your projects only while GetWrite is open and awake on this computer, and the device is on the same network." [US-1]

FR-8: With sharing on, every request from anything other than the desktop app's own window MUST be classified, before any route handler or page renders, as confirmed (carries a valid paired-device credential) or not confirmed (no credential, a malformed credential, or an unknown or revoked credential). A request that is not confirmed MUST be refused, except for the pairing exceptions in FR-11. Where the classification is made (one interception layer or per-route and per-layout) is settled by the OQ-2 experiments. A state-changing request (POST, PUT, PATCH, DELETE) in sharing mode MUST additionally pass the same-origin check in FR-29. [US-1]

FR-9: The refusal in FR-8 MUST apply to every API route and every page the server answers. Acceptance MUST enumerate them from the source tree and not from a sample: every `route.ts` under `frontend/app/api` (including routes not wrapped by `withStorageContext`, such as `version-check`, and the auth routes `auth-status` and `auth/[...all]`) and every `page.tsx` under `frontend/app` (including those outside the `(app)` group: `login`, `preferences`, `project-types`, `reset-password`, `verify-email`). The enumeration MUST be produced by a test that walks the tree, so a route or page added later is covered automatically, and the test MUST fail if any enumerated route or page answers an unconfirmed request with project data or an application page. FR-9 stands whichever way OQ-2 resolves. The disposition of `/_next` static assets is OQ-2: the suggested disposition, to be confirmed with the experiment report and not decided, is to leave `/_next/static` assets open (public build output, and the pairing page needs its chunks); the cost is that an unpaired device can tell GetWrite is running and see its build version. [US-1]

FR-10: A route that is not wrapped by `withStorageContext` MUST NOT be a way around the gate. In particular, an unconfirmed device MUST NOT be able to cause the host to call an outside service (`version-check` calls GitHub when `GETWRITE_DESKTOP=1`; Read, not run). [US-1]

FR-11: The only requests an unconfirmed device MAY have answered are the browser pairing screen, the assets that screen needs, and the code-entry endpoint that mints a credential (FR-17 to FR-20). The code-entry endpoint MUST answer nothing about any project, and MUST NOT reveal whether a code exists, is expired or is used other than as FR-19 requires. [US-1] [US-3]

FR-12: The desktop app's own window MUST be exempt from pairing: it MUST work with no pairing step, with sharing on and with sharing off. The mechanism that tells the window from every other client is OQ-1 (experiment pending); whatever it is, a request from another device MUST NOT be able to present itself as the window by any header, cookie or address value the client controls, and the classification MUST be available to route code so that Feature 77 can build on it. Peer address alone is not an acceptable mechanism on the read evidence (see OQ-1). [US-1]

FR-13: The desktop window MUST be able to display a one-time pairing code and to generate a new one. Only the most recently generated code MAY be valid; generating a new code MUST replace and invalidate the previous one. A code MUST be 6 decimal digits generated with a cryptographically secure random source (`crypto.randomInt`; `Math.random` MUST NOT be used) and MUST NOT be derivable from the time, the machine or earlier codes (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-5). Which process generates and holds the code, and how the window obtains it, is tied to OQ-1 (see the coupling note there). [US-1]

FR-14: A pairing code MUST expire 5 minutes after it is generated (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-5; within the owner's range of 2 to 5 minutes). The desktop window MUST show the time remaining or the expiry, and MUST show that a code has expired. An expired code MUST NOT confirm any device. [US-1]

FR-15: A pairing code MUST be single-use: once a device has been confirmed with it, it MUST NOT confirm another. [US-1]

FR-16: A pairing code MUST stop working after 5 wrong attempts, counted per code and not per device (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-5; within the owner's range of 3 to 5). After the limit the code is dead: it MUST NOT confirm any device, even if the correct value is then submitted, and a new code MUST be generated. There is no separate lockout on the code-entry endpoint. The attempt counter MUST be held by the server side of the gate and not by the browser. [US-1]

FR-17: A device that submits a valid, unexpired, unused code within its attempt limit MUST be given its own credential, which the browser then presents on later requests. The credential MUST be high-entropy and opaque, generated with a cryptographically secure random source (no hand-rolled primitive, per `docs/standards/security.md` section 5), MUST be shown to the browser only at pairing, and MUST be stored on the desktop side only as a hash (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-4 and OQ-6). The browser MUST hold it as an HttpOnly, `SameSite=Strict` cookie. The cookie cannot be `Secure`, because the connection is HTTP (FR-7a); this is a known limitation of this feature, not an oversight. The credential is not an account and MUST NOT identify a person. The credential has no expiry until revoked (revocation is Feature 76; Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-8). Whether a credential survives an app upgrade is unverified and is a manual check listed under FR-26. [US-1]

FR-18: At pairing, the device MUST be given a name derived automatically from its browser and device information (for example "Safari on iPad"), stored with the credential. The name MUST NOT be requested from the writer on the pairing screen. Renaming is Feature 76. [US-1]

FR-19: A refused pairing attempt (wrong, expired, used, or over-limit code) MUST show the browser a plain explanation and what to do next, in text, and MUST NOT show an empty or broken app. Proposed working copy, pending owner confirmation: wrong code "That code is not right. Check the code on your computer and try again."; expired, used or over-limit "That code can no longer be used. Show a new code on your computer and try again." [US-3]

FR-20: Every page or fetch refused under FR-8 MUST be visible to the person using the device. A page load MUST end on the pairing screen, which states that this device is not paired with the writer's GetWrite and how to pair it (open GetWrite on the computer, turn on sharing, enter the code shown there). A refused in-app fetch from a device whose credential is no longer valid MUST NOT surface as an empty list or an empty project (`docs/standards/failure-visibility.md`): the app MUST show that the device is not paired and offer the pairing screen. The same applies to the existing locked-access responses (401/409) if the OQ-10 experiment shows that they render as an empty list. Proposed working copy, pending owner confirmation: "This device is not paired. On your computer, open GetWrite, turn on sharing, and enter the code shown there." [US-3]

FR-21: The browser pairing screen MUST be usable by keyboard alone and by a screen reader (WCAG 2.1 AA, `docs/standards/accessibility.md`): a labelled code input; a visible, programmatically associated error message announced to assistive technology when a code is refused; focus moved to the error or the input after a refused attempt; visible focus; text contrast meeting AA; and no use of red as the only or the alert styling. [US-3]

FR-22: The desktop sharing controls MUST meet the same accessibility standard: the on/off control is a labelled switch or checkbox with its state exposed to assistive technology; the sharing-on state, address, code, expiry and both statements are text readable by a screen reader; a generated or expired code is announced via a polite live region; and every control is reachable and operable by keyboard. The sharing controls MUST also be reachable while the workspace is locked (to be confirmed by the OQ-10 experiment). [US-2]

FR-23: With sharing off, no network and no account, the desktop app MUST remain fully functional: opening, editing and saving projects behaves as it does before this feature. Turning sharing off MUST stop other devices from reaching the server (FR-3) and MUST NOT delete paired-device credentials. With sharing off the local path is unchanged. [US-2]

FR-24: Sharing MUST NOT require hosted authentication, a database or an email service, and MUST NOT change encryption at rest: a workspace unlock or lock at the desktop applies to the single server process and therefore to paired devices (FR-68 of the product spec); this feature adds no unlock or lock path. Sharing and hosted authentication are mutually exclusive (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-7): if sharing is on and both `DATABASE_URL` and `BETTER_AUTH_SECRET` are present in the server's environment, the app MUST NOT start with sharing on; it MUST stay on loopback and MUST say so in the desktop window. Environment variables MUST NOT be stripped when sharing is off. The restated invariant is: with sharing off, the local path is unchanged; sharing and hosted auth never run together. [US-1]

FR-25: The server port MUST have a single source that the server's bind, the desktop window's load URL and navigation guard, and the displayed address all read. No requirement or test in this feature MAY depend on the port having any particular value. (Read: `electron/src/main.ts` today holds `PORT = 3000` and the load URL and `will-navigate` guard use `http://localhost:${PORT}`; choosing a new value is Feature 80.) [US-1]

FR-26: The gate MUST be tested before the bind change lands, and the tests MUST include: sharing off means a connection from a non-loopback address is not accepted; unknown credential, no credential, malformed credential and a credential for a different install each refuse every enumerated route and page (FR-9); an expired code, a used code and an over-limit code confirm nothing; a forged client-supplied address or header does not make a request pass as the window; the window works with no pairing; the setting survives restart; a corrupt credential store refuses every non-window request (FR-27); sharing on with both hosted-auth variables present does not start sharing (FR-24); a cross-origin state-changing request is refused (FR-29). Tests that cannot run in CI (a second real device) MUST be listed as manual checks with the exact steps. The manual checks MUST include whether a paired credential survives an app upgrade (unverified; pair, upgrade, reopen). [US-1]

FR-27: Device credentials (hashes only) MUST be held in a separate file in the app's `userData` directory, created with restrictive permissions (mode 0600), and MUST NOT be stored under the workspace or projects folder; pairings belong to the install and not to the workspace folder (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-4 and OQ-9). A missing file means no devices are paired. A corrupt or unreadable file means every non-window request MUST be refused (fail closed) and the desktop window MUST say so; it MUST NOT be treated silently as "no pairings, carry on". How the server process obtains the file's contents (read per request from disk, or fed by the main process) is left to the plan's design task, which is tied to the OQ-1 experiment and to the question of which process owns the code and the attempt counter (FR-13). [US-1]

FR-28: The plan's task list MUST put the experiments named under OQ-1, OQ-2 and OQ-10 as its first tasks, followed by an explicit stop task: the results are reported to the owner before any task that depends on them (the identification mechanism, the gate's location and coverage, the refusal handling) starts. (Owner decision, Gate 3, 2026-10-09.) [US-1]

FR-29: In sharing mode, every state-changing request (POST, PUT, PATCH, DELETE) MUST pass a same-origin check that compares the request's `Origin` header (falling back to `Referer`) to the request's own `Host`, with no configured canonical URL; if both `Origin` and `Referer` are absent the request MUST be refused (fail closed) (Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec, OQ-6). Which header a route handler sees as the original host is unverified (Read, not run: Next sets `x-forwarded-host ??= host`, `frontend/node_modules/next/dist/server/base-server.js:574`); the check MUST be written against the header the plan's design task has confirmed. Optional hardening, recorded as a suggestion and not a requirement: also require the `Host` to be a loopback address, a private-range IP or a `.local` name. [US-1]

FR-30: Until Feature 77 lands, the sharing control MUST be visible in every build from main, and the sharing copy MUST carry a note of the interim exposure: until Feature 77, a paired device can lock, unlock and delete projects (Owner decision, Gate 3, 2026-10-09, OQ-11). Proposed working copy, pending owner confirmation: "For now, a paired device can also lock, unlock and delete your projects." The note MUST be a separable piece of copy so that it can be removed when Feature 77 ships. The release hold (76, 77 and 80 merged before any release containing 75) is unchanged. [US-2]

FR-31: With sharing on, a request from any client other than the desktop window MUST be refused unless its `Host` header names this machine, compared case-insensitively, as `<name>:<port>` where `<port>` is the server's port (FR-25) and `<name>` is one of: `localhost`; `127.0.0.1`; an IPv4 address currently assigned to one of the machine's own network interfaces; or `<hostname>.local`, where `<hostname>` is the machine's hostname lowercased with a trailing `.local` removed. A missing `Host`, a `Host` without the port, a wrong port, an IPv6 literal, and any other name MUST be refused. The check applies to every request that is not the window's, including the exempt requests (the `/pair` page, `POST /api/sharing/pair`) and `/_next/static` assets: the gap measured by the security review was a request with `Host` and `Origin` both `evil.example:3000` passing `isSameOrigin` in the gate and in the pair route (review L1, measured at gate level; this is the DNS-rebinding shape: a page on a foreign name reaching the pairing endpoint). A refusal MUST be visible, in text, saying that the address does not name the computer running GetWrite and to open the address shown in the GetWrite window (working copy, pending owner confirmation: "This address does not name the computer running GetWrite. Open the address shown in the GetWrite window on that computer."); it MUST NOT redirect to the pairing screen, because that same request would also be refused there. Design (Owner decision, 2026-10-09, "Both confirmed, go ahead"): the allowed set is computed by the server process itself, from `os.networkInterfaces()` and `os.hostname()`, at request time (or cached for a bounded short time), not fixed at launch, so an address change needs no restart. The addresses the desktop window displays (FR-6) and the set this check accepts MUST come from one rule: both start from the machine's non-internal IPv4 interface addresses; the window shows the private-range subset, as FR-6 says, and every address the window shows MUST be accepted by this check. The window shows the IP-address URLs first. Consequences, stated plainly: (a) a paired device's cookie belongs to the host it was set on (general browser behaviour, not tested here), so if the desktop's address changes the device must be opened at the new address and paired again; (b) a `<hostname>.local` name avoids that where the device can resolve it, which is not assured on every Android version (not measured here), and whether the `<hostname>` that `os.hostname()` returns is the name the device resolves is also not measured on any platform; (c) a router address reservation is the dependable remedy for a changing address; (d) a name the writer's router or a reverse proxy supplies (for example `nas.lan`) is refused. IPv6 addresses are not in scope: nothing in this feature listens on IPv6 (Measured in the experiments, `experiments.md` section C run 2, and recorded in Task 24 item 14: `localhost` over IPv6 did not connect under a `0.0.0.0` bind while IPv4 did; cause not established). Provenance: Security review finding, 2026-10-09; owner decision to fix, 2026-10-09. [US-1]

FR-32: This feature MUST NOT lower the size of request body the app accepts. The media cap (`MAX_MEDIA_FILE_BYTES`, 100 MB, `frontend/src/lib/models/media-validation.ts`) MUST remain reachable, with sharing off and with sharing on. Measured (security review, same Next version 16.2.6): adding `frontend/proxy.ts` brought in Next's default `proxyClientMaxBodySize` of 10485760 bytes (Read: `frontend/node_modules/next/dist/server/config-shared.js:260`); a 9 MB upload to `/api/resource/upload` returned 200 and a 12 MB upload returned 500 "Failed to parse body as FormData", in every mode including sharing off. The bundled docs (`frontend/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md`) mark the key as experimental, place it under `experimental` in the Next config, say the body is buffered in memory up to the limit and, past it, only the partial body reaches the route; that is consistent with the measured 500, and no experiment here discriminated the cause of that error message. Provenance: Security review finding (M2), 2026-10-09; owner decision to fix, 2026-10-09. [US-1]

FR-33: The device credential cookie (FR-17) MUST persist across browser restarts: it MUST carry an explicit long lifetime (`Max-Age`), and a confirmed request MUST renew it (sliding), consistent with "no expiry until revoked" (resolved OQ-8). This corrects FR-17 as approved, which did not state a lifetime, and the code, which set a session cookie (`frontend/app/api/sharing/pair/route.ts` comment: "Session cookie: no Max-Age or Expires"), so a device could lose its pairing when the browser closed. Browsers may cap a cookie's lifetime; the cap of any browser is not stated here and was not verified (nothing in the repository establishes it). Whether a given phone's browser keeps the cookie across a restart is unverified; the manual check is in Task 24. Provenance: Security review finding (H1 detail), 2026-10-09; owner decision to fix, 2026-10-09. [US-1]

FR-34: The listen address and the gate-on signal MUST be derived from the one `resolveSharingMode(...).effective` value, and a test MUST fail if a non-loopback bind can be produced without the gate being on. The server side MUST also fail closed: if it finds itself told it is bound beyond loopback while sharing is not on, it MUST refuse every request that is not the desktop window's. Measured at the review: `readSharingEnv` treats only `GETWRITE_SHARING === "1"` as on, and any other value forwards every request (review M3). The mechanism is the task's design and not a spec decision (see Task 22). Provenance: Security review finding (M3), 2026-10-09; owner decision to fix, 2026-10-09. [US-2]

FR-35: The window MUST be navigable only to the local origin: a navigation MUST be allowed only when the parsed URL's origin equals the local origin exactly. The sharing IPC handlers (`getwrite:sharing-get-status`, `-set-enabled`, `-generate-code`, `-get-code`) MUST refuse a call whose sender frame's origin is not the local origin. Evaluated in Node, not tested in Electron: the current `will-navigate` handler uses `url.startsWith(localOrigin(PORT))`, and `http://localhost:3000@evil.example/` and `http://localhost:30001/` both pass that prefix test while their parsed origins are `http://evil.example` and `http://localhost:30001`; the prefix test predates this branch. The bridge on this branch exposes `generatePairingCode`, `getPairingCode`, `setSharingEnabled` and `restart`, and the IPC handlers do not check the sender (Read, `electron/src/main.ts`). What was not tested: any behaviour in a running Electron (what `senderFrame` holds for the window, and that it can be `null`: Read, typings, `senderFrame` is `WebFrameMain | null`, so a `null` sender MUST be refused). Provenance: Security review finding (M4), 2026-10-09; owner decision to fix, 2026-10-09. [US-2]

## Open questions

Still open at the end of Gate 3. Each is an experiment or a design point, and none has been answered here.

- OQ-1 (experiment pending; To be settled by experiment (plan task), result reported to the owner before dependent work): How does the server tell the desktop app's own window from a paired or unpaired device? Impact: FR-12, FR-1, FR-8, FR-13, FR-26, FR-27, and Feature 77 (not buildable if the route code cannot make this distinction). Evidence so far (Read, not run): peer address alone is rejected as a mechanism, because `frontend/node_modules/next/dist/server/base-server.js:577` does `req.headers['x-forwarded-for'] ??= originalRequest.socket.remoteAddress`, so a client-supplied header is kept and a LAN device could claim 127.0.0.1. Keep a confirming experiment: send a forged `X-Forwarded-For: 127.0.0.1` from another device and log what a route sees; unverified whether the packaged standalone `server.js` runs the same code. Candidate: a per-launch random secret generated in the main process and passed to the server through its environment (main already sets the server env, `electron/src/main.ts` lines ~147-159), attached to the window's requests through `session.webRequest.onBeforeSendHeaders` and/or a cookie on the window's session (both exist in the Electron 34.5.8 typings; coverage of request kinds is undocumented). Experiment, in a packaged build: log which request kinds (navigation, fetch, `/_next` assets) carry the header and which carry the cookie. If the header misses some kinds, use the cookie. If neither covers every kind, stop and report; the named fallbacks, not chosen, are a thin launcher that overwrites the address header from the real socket, and a second loopback listener (a second process with its own module state, including the module-level keyring variable in `frontend/src/lib/models/crypto/keyring-session.ts`, so it risks splitting unlock state). Coupling to settle in the same task: the pairing code is displayed in the main process's window while the code-entry endpoint and the attempt counter live in the server process, so who generates and holds the code, and how the window obtains it, must be decided together with the mechanism.
- OQ-2 (experiment pending; To be settled by experiment (plan task), result reported to the owner before dependent work): What must the gate cover, and where does it live? Impact: FR-8, FR-9, FR-10, FR-11, FR-26. Facts read, not run: pages exist outside the `(app)` group (`login`, `preferences`, `project-types`, `reset-password`, `verify-email`); `frontend/app/api/version-check/route.ts` is not wrapped by `withStorageContext` and, with `GETWRITE_DESKTOP=1`, calls GitHub from the host; `/api/auth-status` and `/api/auth/[...all]` have no stated disposition; there is no `middleware.ts` or `proxy.ts`. Candidate: a root `proxy.ts` (Next 16.2.6; the bundled docs, `frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, say Node runtime, regex matcher, static export unsupported, "do not rely on shared modules or globals"; `output: "standalone"` is not named). Experiments: (1) a logging `proxy.ts` in a packaged standalone build: does it run for an API route, a page, and a `/_next/static` asset; (2) the native export build (`pnpm build:native`) with `proxy.ts` present: does it break or leak. If (1) works and (2) is clean or the file can be excluded, use one interception layer; otherwise use a per-route and per-layout gate with FR-9's tree-walking test as the net. Either way FR-9 stands. The `/_next/static` disposition is suggested (leave static assets open, FR-9) and to be confirmed with the experiment report, not decided. The no-middleware comment in `with-storage-context.ts` (~lines 12-14) MUST be amended if a proxy is added.
- OQ-3 (resolved at Gate 3, 2026-10-09; see Resolved questions) Remaining unverified fact: whether `next dev` honours `HOSTNAME` (FR-4); experiment named there. Also not tested: whether the window's `http://localhost:${PORT}` load URL (Read, `main.ts` lines ~578-604) stays correct under a non-loopback bind, and whether `localhost` can resolve to the IPv6 loopback.
- OQ-4 (resolved at Gate 3, 2026-10-09; see Resolved questions) Left to the plan's design task: how the server process obtains the credential store's contents (per request from disk, or fed by the main process), tied to OQ-1 (FR-27). Not answered here.
- OQ-5 (resolved at Gate 3, 2026-10-09; see Resolved questions)
- OQ-6 (resolved at Gate 3, 2026-10-09; see Resolved questions) Remaining unverified fact: which header a route handler sees as the original host (FR-29).
- OQ-7 (resolved at Gate 3, 2026-10-09; see Resolved questions)
- OQ-8 (resolved at Gate 3, 2026-10-09; see Resolved questions) Remaining unverified fact, manual check: whether a credential survives an app upgrade (FR-17, FR-26).
- OQ-9 (resolved at Gate 3, 2026-10-09; see Resolved questions)
- OQ-10 (experiment pending; To be settled by experiment (plan task), result reported to the owner before dependent work): What does a non-desktop browser see when the workspace is locked? Impact: FR-20, FR-22, FR-30, Feature 77. Read finding, not run: `frontend/components/Start/StartPage.tsx:414` shows the unlock prompt when the workspace is locked and an unlock handler is passed, and `frontend/app/(app)/page.tsx` ~986-994 passes it unconditionally, so a plain browser may see the unlock prompt and be able to call the encryption route. Experiment (runnable without sharing): open a locked encrypted workspace in an ordinary browser on localhost and record what is shown, then what an in-app fetch returning 401 or 409 renders. Outcomes: an empty list means a failure-visibility defect to fix in this feature's refusal handling (FR-20); the unlock prompt means the finding is recorded for Feature 77 (blocking unlock from a paired device is Feature 77's scope, covered by the release hold), with FR-30's interim copy covering it. In the same experiment confirm that the desktop sharing controls are reachable while the workspace is locked (FR-22).
- OQ-11 (resolved at Gate 3, 2026-10-09; see Resolved questions)
- OQ-12 (design point, open): Does the desktop window also show the `http://<hostname>.local:<port>` URL after the IP-address URLs (FR-31)? Not decided; the IP URLs are shown first either way. Task 24 records whether the name resolves on the owner's phone.
- OQ-13 (design point, open): The cookie lifetime value (FR-33). Task 27 uses 31536000 seconds (365 days) as a working value, pending owner confirmation.

## Resolved questions (Gate 3, 2026-10-09)

Format follows `specs/features/resource-subtype.md`. The three provenance labels are kept distinct: the owner explicitly answered only OQ-3, OQ-11 and the experiments-first ordering; the others are triage defaults that were presented and approved by the owner as part of approving the spec, not answered individually.

- OQ-3 (resolved): Which interface does the server listen on, and what does the address display show? Resolution: all interfaces; the desktop window shows every candidate (private-range / LAN) address and states "no network address found" (working copy) when there is none. Accepted consequence: the server is also bound on non-LAN adapters; the gate is the control. The `next dev` `HOSTNAME` sub-point stays an unverified fact with its experiment named (OQ-3a). Evidence: Owner decision, Gate 3, 2026-10-09, option (a). Impact: FR-4, FR-6, FR-25.
- OQ-4 (resolved): Where are credentials and the sharing setting stored? Resolution: credentials in a separate `userData` file holding hashes only, mode 0600, never under the workspace folder; missing file means no pairings; corrupt or unreadable file refuses every non-window request and the window says so; pairings and the sharing setting belong to the install. How the server reads the file is left to the plan (OQ-4a). Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-5, FR-17, FR-27.
- OQ-5 (resolved): Pairing-code parameters? Resolution: 6 decimal digits from `crypto.randomInt`; 5-minute lifetime; 5 wrong attempts counted per code; after the limit the code is dead and a new one is needed; no separate lockout; a new code replaces the old one. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-13, FR-14, FR-15, FR-16.
- OQ-6 (resolved): Cross-site protection for a paired browser? Resolution: HttpOnly, `SameSite=Strict` cookie (not `Secure`, because the connection is HTTP), opaque high-entropy, stored as a hash; plus a same-origin check on state-changing methods comparing `Origin` (falling back to `Referer`, fail closed if both absent) to the request's own `Host`, with no configured canonical URL. Which header carries the original host is unverified (OQ-6a). The Host-is-loopback/private-range/`.local` check is a suggestion only. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-8, FR-17, FR-26, FR-29.
- OQ-7 (resolved): Sharing versus hosted auth? Resolution: mutually exclusive; with both `DATABASE_URL` and `BETTER_AUTH_SECRET` present the app does not start with sharing on, stays on loopback, and says so in the window; env is not stripped when sharing is off; invariant restated as "with sharing off, the local path is unchanged; sharing and hosted auth never run together". Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-23, FR-24, FR-26.
- OQ-8 (resolved): Credential lifetime? Resolution: no expiry until revoked (revoke UI is Feature 76). Survival across an app upgrade is unverified and kept as a manual check (OQ-8a). Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec. Impact: FR-17, FR-26.
- OQ-9 (resolved): Sharing setting versus workspace-folder change? Resolution: pairings and the setting belong to the install; a sharing change and a folder change share one restart; the "restarting" message is shown before the relaunch call. Evidence: Recommended default from triage, approved by the owner at Gate 3, 2026-10-09 as part of approving the spec; the relaunch ordering is Read, not run (`electron/src/main.ts` ~245-249). Impact: FR-4, FR-5.
- OQ-11 (resolved): Is the interim exposure acceptable on main? Resolution: the sharing control is always visible in builds from main before Feature 77 lands, with the interim exposure noted in the sharing copy (working copy in FR-30), removable when Feature 77 ships. The release hold is unchanged. Evidence: Owner decision, Gate 3, 2026-10-09, option (a). Impact: FR-1, FR-30.

## Security review (2026-10-09)

An independent security review of the gate ran on 2026-10-09, before the bind change (Task 22). It found no way for an unconfirmed client to read or change project data or to pass as the window. It found defects, recorded as FR-31 to FR-35 (fix) and below (accepted). Gate-level findings were measured by the reviewer at gate level; findings marked reading were read in code and not run.

Accepted as known by the owner (2026-10-09); no work added:

- H1: the transport is cleartext HTTP, so a captured device cookie works until Feature 76 provides revoke. Follows from the HTTP-only and release-hold decisions.
- M1: any device on the network can make a pairing code unusable with five submissions, including malformed ones. Follows from per-code counting (FR-16); the limit held under 200 parallel guesses (measured, gate level).
- L2: the cookie is not port-scoped.
- L3: a leftover lock file younger than 30 seconds delays pairing (measured); a stat-then-unlink race is possible (reading).
- L4: main writes the pairing-state file without the lock, so a new code can be overwritten by a simultaneous wrong guess and stop working (reading).
- L5: there is no minimum secret length server-side, and the window header is forwarded to routes.

What the review did NOT cover: the gate was not run end to end on a build of HEAD; Electron runtime behaviour; `next dev`; WebSocket upgrades.

## Out of scope (deferred)

- Paired-device list, rename and revoke in the desktop app (Feature 76).
- Capability limits for a paired device and the "Allow deletion from paired devices" setting (Feature 77).
- The two-client save measurement (Feature 78) and the in-app "last save wins" statement (Feature 79).
- Changing the desktop server's default port (Feature 80).
- TLS for the home-network connection, and headless, Docker or NAS delivery.
- The native Android app as a client of the desktop's shared projects (a stated priority, not a schedule).
- Hosted multi-device sync (FR-30 of the product spec), which is unchanged and not replaced.
