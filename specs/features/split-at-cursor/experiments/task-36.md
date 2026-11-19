# Task 36: hosted web run (LEAD-RUN)

Run on 2026-11-18 and 2026-11-19 (UTC). The owner drove the browser steps and the lead recorded them. The lead checked tenant A's files on disk and ran the second-tenant probe.

No hosted deployment exists to run against. As in Feature 116's Task 53, this used the hosted-auth setup of `scripts/hosted-smoke/` on the owner's machine: a production build, a throwaway PostgreSQL and a local SMTP catcher (Mailpit). It is the deployment artifact in hosted mode, not a deployed service. The claim below is stated under one writer instance per tenant: one server process, one browser session for tenant A.

## Build and environment

- Commit `5e0adfc1` (it includes the three fixes made during Task 35: `4a138565`, `a2faec93`, `ccb04277`).
- `pnpm build` (`output: "standalone"`) ran from `frontend/` in the main checkout, outside the command sandbox, from 23:16:40 to 23:17:04 UTC on 2026-11-18, exit 0. `.next/standalone` was cleared first, then `.next/static` and `public` were copied into the standalone folder.
- The server was `node .next/standalone/frontend/server.js` on port 3000.
- Hosted auth was active: `DATABASE_URL` and `BETTER_AUTH_SECRET` were set, with a sign-up allowlist of `@allowed.test`. The schema was created with `better-auth migrate`. `GETWRITE_DATA_ROOT` was a new, empty, throwaway folder.
- Start-up output: the two warnings Task 53 recorded (no `AUTH_TRUSTED_PROXIES` / `AUTH_IP_ADDRESS_HEADERS`; `BETTER_AUTH_URL` not https), the line `Couldn't load zlib`, and a new line `Couldn't load fs`. The source of the last two was not looked into.
- Smoke checks by the lead: `GET /login` returned 200; an anonymous `GET /api/project/split/latest` returned 401.
- Interruption: the server process was stopped once while the session was idle, when the machine ran low on memory, and the machine then appears to have restarted. The Docker containers had stopped but kept the database, so tenant A's account survived. The tenant data folder, in the session scratchpad, was cleared. The server was restarted on the same build with a new, empty data folder, and the owner made the test project again. Every step below ran after the restart.
- Platform: macOS 26.5.1 (25F80), arm64. Browser: Chrome 157.0.8103.79 (Official Build), arm64.

## Steps, as observed (tenant A)

The owner signed in as tenant A (an `@allowed.test` account verified through Mailpit) and made a project with text documents, notes, a citation, a claim and a custom field.

1. **Split with annotations:** one split with a note, a citation and a claim before the cursor and one of each after it. It worked as expected.
2. **Annotation across the cursor and carry-over:**
   - A note whose passage spanned the cursor was listed under "Stay with the original", with no checkbox, and stayed with the original.
   - The owner ticked a custom field, and the new document got its value.
   - Unticking a note in the moving text was not tried here, because no note was in the moving text.
3. **Palette and shortcut:** both "Split at cursor" in the palette and Cmd+Shift+Enter opened the dialog in Chrome.
4. **Cancel and Escape:** worked as expected.
5. **Refusals:** worked as expected (the same list as Task 35).
6. **Reload, edit, Undo:** worked as expected.
7. **Locked encrypted project:** not applicable. Encryption is not offered on hosted (`encryption-availability.ts`), and the owner saw no encryption option.

On disk, after the run:

- Three lineage entries, with split dates 03:48:08, 03:51:55 and 04:00:33 UTC (2026-11-19).
- Each original has a "Before split 2026-11-19" revision. The Undo's original also has "Before undo split 2026-11-19" (04:00:57).
- `meta/latest-operation.json` is absent, and the split-off document is under `.trash/resources/`.
- The writing log has 8 entries. None is at a split time or the Undo time. The one entry between the last split and the Undo is a 2-word edit at 04:00:48, the owner's edit before the Undo.

## Second tenant (measured by the lead)

The probe script was in the session scratchpad and is not committed. It ran with Node against the same server.

1. It signed up a second `@allowed.test` account, verified it through Mailpit's API (verify 302) and signed in (200). This is tenant B. `GET /api/projects` as B returned 200 `[]`.
2. B sent each new route tenant A's project id, the id of a live text document in it, that document's canonical revision id, and the SHA-256 of that revision's stored content. It then sent the same request with made-up UUIDs. The offset was 5.

| Request as tenant B | With A's ids | With made-up ids |
|---|---|---|
| `GET /api/project/split/latest` | 200 `{"outcome":"none"}` | identical |
| `POST /api/project/split/preview` | 200 `{"outcome":"failed","cause":"resource-not-found"}` | identical |
| `POST /api/project/split` | 200 `{"outcome":"failed","failedStep":"lock-original","remainingState":"original-restored","cause":"resource-not-found"}` | identical |
| `POST /api/project/split/undo` | 200 `{"outcome":"nothing-to-undo"}` | identical |

- The status and body were identical for A's ids and for made-up ids on every route, so B learns nothing about whether A's project exists.
- The SHA-256 of all 79 files in tenant A's project was the same before and after the probe.
- Tenant B's own tenant folder was empty after the probe.
- These routes answer 200 with a typed result where the Feature 116 citations routes answered 404. Both give the same answer for another tenant's ids and for made-up ids.

## Not verified

- A hosted deployment of several server instances.
- A deployed hosted service, behind a real proxy, over https.
- Browsers other than Chrome.
- Unticking a note in the moving text on hosted (run on desktop, Task 35).
- A positive control for tenant A through the API. Tenant A's routes were seen working only in the owner's browser run.
- A locked or encrypted project (not offered on hosted).
- A merged-document refusal (Feature 121).
- Android, a paired device, screen-reader use, a document of hundreds of thousands of words.
- What `Couldn't load fs` and `Couldn't load zlib` mean.
- Every path not named above.
