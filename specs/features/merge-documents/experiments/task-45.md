# Task 45: hosted web run (lead-run)

Run on 2026-11-20 (UTC). The owner drove the browser steps. The lead set up the server, loaded the sample project, checked tenant A's files on disk and ran the second-tenant probe.

No hosted deployment exists to run against. As in Feature 120's Task 36, this run used the hosted-auth setup of `scripts/hosted-smoke/` on the owner's machine: a production build, a throwaway PostgreSQL and a local SMTP catcher (Mailpit). It is the deployment artifact in hosted mode, not a deployed service. The claim below is stated under one writer instance per tenant: one server process, and one browser session for tenant A.

## Build and environment

- Commit `b0c3d831` on `feat/merge-documents`.
- `pnpm build` (`output: "standalone"`) ran from `frontend/` in the main checkout, outside the command sandbox, from 06:50:51Z to 06:51:14Z, exit 0. `.next/standalone` was cleared first, then `.next/static` and `public` were copied into the standalone folder.
- Server: `node .next/standalone/frontend/server.js` on port 3000, Node v24.15.0.
- Hosted auth was active: `DATABASE_URL` and `BETTER_AUTH_SECRET` were set, with the sign-up allowlist `@allowed.test`. The containers were new, and the schema was created with `better-auth migrate`. `GETWRITE_DATA_ROOT` was a new, empty, throwaway folder in the session scratchpad.
- Start-up output: `Ready`, then `Couldn't load fs` and `Couldn't load zlib`, the same two lines as Feature 120's Task 36. Their source was not looked into.
- Lead smoke checks: `GET /login` returned 200; an anonymous `GET /api/project/split/latest` returned 401.
- Platform: macOS 26.5.1 (25F80), arm64. The browser and its version were not recorded.

## Sample project (tenant A)

The owner signed up as tenant A (an `@allowed.test` account, verified through Mailpit) and signed in. The lead then copied a fresh copy of the generated sample project (`scripts/sample-project/`, seed 121, project `0fc44049-…`, 380 files, no `meta/latest-operation.json`) into tenant A's folder under `GETWRITE_DATA_ROOT`. The owner reloaded and opened it.

## Steps, as observed (tenant A)

The owner ran the Task 44 checklist on hosted web and reported that everything worked the same as on desktop (`task-44.md`). The checklist covered:

- the merges;
- the refusals;
- Cancel and Escape;
- the carry-over choices;
- reload and the mark after reopening;
- the compile, export, search, goal, Goal filter, Data view, status roll-up and tree surfaces;
- Trash and restore;
- one merge, edits to both documents, a reload and Undo merge;
- 2-, 10- and 25-document merges.

The locked encrypted project does not apply: encryption is not offered on hosted (`encryption-availability.ts`).

The findings already recorded in `task-44.md` apply here unchanged. They are the follow-up on older merges' marks (POS `task_f8423a8d`) and the citation checkbox issue (POS `task_3032a6f2`).

## Second tenant (measured by the lead)

The probe was a Node script in the session scratchpad, run against the same server, and is not committed. Each run signed up a new `@allowed.test` account, verified it through Mailpit's API (verify 302) and signed in (200). That account is tenant B. `GET /api/projects` as tenant B returned 200 `[]`.

Tenant B sent each route tenant A's project id, plus two live, unmarked text documents of tenant A: "Timing 07" and "Timing 14", with their canonical revision ids and the SHA-256 of each revision's stored content. It then sent the same requests with a made-up project id and made-up document ids, revision ids and hashes. The merge request carried an empty carry-over.

The probe ran twice:

1. After the owner's run. Tenant A's last action had been an Undo, so A's project had no `meta/latest-operation.json`.
2. After the owner made one merge (two documents, record dated 07:06:38Z), so A's project held a live merge record.

Both runs gave the same results:

| Request as tenant B | With A's ids | With made-up ids |
|---|---|---|
| `GET /api/project/split/latest` | 200 `{"outcome":"none"}` | identical |
| `POST /api/project/merge/preview` | 200 `{"outcome":"refused","reason":"missing-document","documentId":<first id sent>,"message":"A document in the selection can no longer be found."}` | identical apart from `documentId` |
| `POST /api/project/merge` | 200 `{"outcome":"refused","reason":"missing-document","documentId":<first id sent>}` | identical apart from `documentId` |
| `POST /api/project/split/undo` | 200 `{"outcome":"nothing-to-undo"}` | identical |

- For preview and merge, the only difference between the two bodies is `documentId`, which repeats the first document id that tenant B itself sent.
- In run 2, tenant A's project held a live merge record. Tenant B still got `none` from the latest-operation read and `nothing-to-undo` from Undo, so neither answer reflects A's record.
- The SHA-256 of every file in tenant A's project was the same before and after each run: 417 files in run 1 and 422 files in run 2, with no differing lines. That includes A's `meta/latest-operation.json` in run 2.
- Both tenant B folders were empty after the probes.

## Not verified

- A hosted deployment of several server instances.
- A deployed hosted service, behind a real proxy, over https.
- The browser's name and version, and any browser other than the one the owner used.
- A positive control for tenant A through the API. Tenant A's routes were seen working only in the owner's browser run.
- A locked or encrypted project (not offered on hosted).
- Tenant B sending a merge with a non-empty carry-over, or the documents named in A's live record.
- Android, a paired device, screen-reader use.
- What `Couldn't load fs` and `Couldn't load zlib` mean.
- Every path not named above.
