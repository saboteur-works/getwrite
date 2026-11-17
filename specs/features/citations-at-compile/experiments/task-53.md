# Task 53: hosted web run (LEAD-RUN)

Run on 2026-11-16. The owner drove the browser steps and the lead recorded them. The lead ran the second-tenant check. No hosted deployment exists to run against. This run used the hosted-auth setup of `scripts/hosted-smoke/` on the owner's machine instead: a production build, a throwaway PostgreSQL and a local SMTP catcher (Mailpit). It is the deployment artifact in hosted mode, not a deployed service.

## Build and environment

- Commit `bd812696`. `pnpm build` (`output: "standalone"`) ran from `frontend/` in the main checkout, outside the command sandbox. It started at 22:34:13 UTC and exited 0 by 22:34:53 UTC. `.next/standalone` was cleared first.
- `.next/static` was copied into the standalone folder, as the desktop build does. The server was then started with `node .next/standalone/frontend/server.js` on port 3000.
- Hosted auth was active: `DATABASE_URL` and `BETTER_AUTH_SECRET` were set, with a sign-up allowlist of `@allowed.test`. The schema was created with `better-auth migrate`. `GETWRITE_DATA_ROOT` was a new, empty, throwaway folder.
- The server printed three things at start-up:
  - A warning that neither `AUTH_TRUSTED_PROXIES` nor `AUTH_IP_ADDRESS_HEADERS` is set.
  - A warning that `BETTER_AUTH_URL` is not https.
  - The line `Couldn't load zlib`. Its source was not looked into.
- Smoke checks by the lead before the owner's run:
  - `GET /login` returned 200.
  - An anonymous `GET /api/citations/fields` returned 401.
- Browser: Chrome 157.0.8103.52 (Official Build), arm64, on macOS 26.5.1.
- Sign-in: the owner created a new account with an `@allowed.test` address, verified it through the mailed link and signed in. This is tenant A.

## Steps, as observed (tenant A)

The owner reported: "Same outcome as local on each point, no errors run into." "Local" means the Task 52 desktop run (`task-52.md`). The steps given to the owner were:

- Switch the Citations module on.
- Fill in a Source of each of the four types, one with a missing detail.
- Make citations with locators across two documents.
- In the Compile dialog, check the Citations switch and the style.
- Run the pre-run warning, then Cancel and Proceed.
- Compile to PDF and to DOCX, and open both.
- Switch the module off and compile again.

The owner did not report the steps one by one.

## Second tenant (measured by the lead)

The probe script was in the session scratchpad and was not committed. It ran with Node against the same server.

1. It signed up a second `@allowed.test` account and verified it through Mailpit's API (verify 302). It signed in with status 200; this is tenant B.
2. The server made a separate tenant folder for B, next to A's.
3. B sent requests using tenant A's project id and two of A's Source ids, both of which hold `citationFields`. Each was compared with the same request using made-up ids:

| Request as tenant B | With A's ids | With made-up ids |
|---|---|---|
| `GET /api/citations/fields` | 404 `{"error":"The resource was not found."}` | 404, same body |
| `PUT /api/citations/fields` (a book title) | 404 `{"error":"The resource was not found."}` | not sent |
| `POST /api/citations/check` | 404 `{"error":"The project was not found."}` | 404, same body |
| `GET /api/projects` | 200 `[]` | n/a |

- The SHA-256 of both of tenant A's Source sidecars was the same before and after the probe.
- The responses to A's ids and to made-up ids were identical, so B learns nothing about whether A's project exists.
- `GET /api/projects` returning 200 shows B's session was authenticated when the other requests were refused.

## Not verified

- A deployed hosted service, behind a real proxy, over https.
- Browsers other than Chrome.
- Each step's detail beyond the owner's summary: note text and page numbers, pre-run warning wording, bibliography entries, and which application opened the DOCX.
- A positive control for tenant A through the API. Tenant A's reads and check were seen only in the owner's browser run.
- Cross-tenant access to the compile routes (`/api/compile/pdf`, `/api/compile/docx`) with the citations option.
- Locked or encrypted projects in hosted mode.
- What `Couldn't load zlib` means, and whether it affects anything.
- Every path not named above.
