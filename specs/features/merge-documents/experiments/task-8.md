# Task 8: sample project, how a script can build through the real core functions

Test tooling only (POS `task_23e9c7df`). Every value below was observed by running the command beside it from the repository worktree root, with probes kept in the scratch directory (`$TMPDIR`, not committed) and every project written under `$TMPDIR`. No real project, `projects/` path, production file, `package.json` or lockfile was touched; `git status --short` was empty after the last probe.

Environment: Node v24.15.0 (`node --version`), pnpm 10.28.0. Probes ran inside the command sandbox.

## Candidate 1: plain `node` type stripping

| Probe | Command | Observed |
|---|---|---|
| Import a core module directly | `node a.mjs <abs path>/frontend/src/lib/models/project-crud-core.ts` (`a.mjs` is `await import(process.argv[2])`) | `ERR_MODULE_NOT_FOUND`: cannot find module `.../frontend/src/lib/models/io` imported from `project-crud-core.ts` |
| Import a leaf with no relative imports | same, with `frontend/src/lib/models/uuid.ts` | loads, exports `default, generateUUID, isValidUUID`; prints a `MODULE_TYPELESS_PACKAGE_JSON` warning |

Observed: the models import siblings without a file extension (`from "./io"`), and plain `node` did not resolve them. Only a module with no such imports loaded. Verdict: not usable for the core functions with no change to production files.

## Candidate 2: the CLI bundle of `cli/`

| Probe | Command | Observed |
|---|---|---|
| Build the bundle to scratch | `cd cli && node_modules/.bin/esbuild src/getwrite-cli.ts --bundle --platform=node --target=node16 --outfile=$TMPDIR/probe8/cli/getwrite-cli.cjs --format=cjs --tsconfig=tsconfig.json --external:playwright --external:playwright-core --external:chromium-bidi` (the flags of `cli`'s `build` script, output moved out of `cli/dist`) | built, 2.4 MB; one `import.meta` warning about the CJS format |
| Run it from scratch | `node $TMPDIR/probe8/cli/getwrite-cli.cjs --help` | `Cannot find module 'playwright'` (it is external and the bundle sat outside the repo) |
| Run it with the CLI's modules on the path | `NODE_PATH=cli/node_modules node $TMPDIR/probe8/cli/getwrite-cli.cjs --help` | runs; commands: `prune`, `templates`, `screenshots`, `project`, `reindex`, `doctor`, `repair-revisions`, `qa` |
| Create a project | `... project create $TMPDIR/probe8/cliproj -t blank -n CliProbe` | `Folders: 1, Resources: 0`; wrote `folders/`, `project.json`, `resources/` |
| Templates surface | `... templates --help` | `save`, `save-from-resource`, `create`, `duplicate`, `list` |

Reach, from the command list and the help text read: project creation from a type (so `createProjectFromType`), a resource from a template, `reindex`, `doctor`, `repair-revisions`, and the importers. The CLI has no command for folder creation, sidecar write, annotation add, claim add, Source attachment add, entity declaration, Inbox capture, smart-folder save, rich content (table, code block, image) or a module switch. The bundle needs a built file (`cli/dist` is produced by `pnpm cli:build`) and `playwright` resolvable at run time. Verdict: reaches `createProjectFromType` only; not enough on its own.

## Candidate 3: a TypeScript runner already installed in the workspace (jiti)

`tsx`, `ts-node` and `vite-node` are absent from `frontend/node_modules/.bin`; `jiti`, `esbuild` and `vitest` are present there (`ls frontend/node_modules/.bin`). `grep -n '"jiti"' frontend/package.json cli/package.json package.json electron/package.json` printed nothing: jiti is not a declared dependency of any workspace package; `pnpm-lock.yaml` lists `jiti@2.7.0` only inside the peer lists of `vite` and `eslint`.

| Probe | Command | Observed |
|---|---|---|
| Import a core | `frontend/node_modules/.bin/jiti b.ts` (imports `project-creator`) | prints `function` |
| Full run (`c.ts`) | `GETWRITE_PROJECTS_DIR=` set in the script; `frontend/node_modules/.bin/jiti c.ts <out dir> <abs>/frontend/src/lib/models` | see the table below |
| Encrypted-copy run (`e.ts`) | `JITI_ALIAS='{"server-only":"<empty.cjs>"}' frontend/node_modules/.bin/jiti e.ts ...` | see the encryption section; without the alias it ended with `This module cannot be imported from a Client Component module` (the `server-only` package, imported through `encryption-availability.ts` and `auth-config.ts`); `NODE_OPTIONS=--conditions=react-server` did not remove that error under jiti |

Two behaviours seen in every full run, recorded as observations:

- `createProjectCore` printed a `project.id` different from the directory name it wrote to (`project.json` `id` vs the UUID basename of `project.rootPath`). The other cores take the directory basename as `projectId`; passing `project.id` gave `ResourceProjectNotFoundError`.
- Creating a text resource ended the process with an unhandled `EMFILE: too many open files, watch` error from an `FSWatcher` (`ulimit -n` was 1048576, and also after `ulimit -n 10240`). With a `process.on("uncaughtException")` handler that ignores errors whose `syscall` is `watch`, every later step ran. `backlinks-watcher.ts` is the one file in `lib/models` that calls `fs.watch`; which code started the watcher in this run, and whether the error appears outside the command sandbox, was not established (not run outside it). The same calls under vitest (candidate 5) and in the esbuild bundle (candidate 4) printed no such error, with no handler installed in the vitest run and one installed in the bundle run.

Reach, observed with the jiti run (`c.ts`, blank project type, `GETWRITE_PROJECTS_DIR` pointing at scratch):

| Capability | Function called | Observed |
|---|---|---|
| Project creation | `createProjectCore(name, "blank", false)` (calls `createProjectFromType`) | OK |
| Folder, nested folder | `createResourceCore(pid, { type: "folder", folderId })` | OK; loaded project reported 4 folders (1 from the type, 2 made, 1 Inbox) |
| Text resource with `userMetadata` | `createResourceCore(... text: { plainText }, userMetadata)` | OK, `v-1` written (`revisions/<id>/v-1`) |
| Table, code block, image in text | `createResourceCore(... text: { tiptap })` with `table`, `codeBlock` and `image` (data URI) nodes | OK; `content.tiptap.json` on disk contained all three node names. An image node with an uploaded image resource was not probed |
| Sidecar write: entity, aliases, subtype, status | `updateSidecarCore(pid, id, { entityKind, aliases, resourceSubtype, userMetadata })` | OK; sidecar read back with `userMetadata.status`, `entityKind`, `aliases`, `resourceSubtype` |
| Annotation add (a note) | `addAnnotationCore` | OK. An annotation with a `target` (citation, excerpt) was not probed |
| Claim add | `addClaimCore` | OK |
| Source and image attachment | `createResourceCore(type: "source")`, `addAttachmentCore` | OK |
| Audio attachment | `addAttachmentCore` | first try with 64 zero bytes: `AttachmentValidationError` (contents do not match the type). With a leading `ID3` header and an MP3 frame header: OK |
| Inbox capture | `captureToInboxCore` | `status: "created"` |
| Smart folder | `dispatchSavedQueryAction(projectRoot, { action: "write", query })` | first try with a wrong key (`query`): `InvalidSavedQueryError`; with `definition: { op, field, value }`: OK, file under `meta/queries/` |
| Module switch | `setModuleEnabledCore({ projectId, moduleId: "claims", enabled: true })` | `{"modules":{"claims":true}}` |
| Load | `loadProjectCore(pid)` | OK; keys `project, folders, resources`; 4 folders, 4 resources; `config.modules` `{"claims":true}` |

`updateSidecarCore` accepts only five client keys; a merged-away key or other sidecar keys would need `mutateSidecar` (`sidecar.ts`), also reachable by import but not probed.

## Candidate 4: esbuild bundle of a driver script

`cli/package.json` declares `esbuild` 0.28.0 as a devDependency (the `frontend` copy in `.bin` is transitive; `grep -n '"esbuild"' frontend/package.json` printed nothing). A driver (`d.ts`) importing `project-crud-core`, `resource-crud-core` and `crypto/enable-encryption` by absolute path:

- Build: `cd cli && node_modules/.bin/esbuild $TMPDIR/probe8/d.ts --bundle --platform=node --target=node20 --format=cjs --tsconfig=tsconfig.json --alias:server-only=$TMPDIR/probe8/empty.cjs --external:playwright --outfile=$TMPDIR/probe8/d.cjs` produced a 0.95 MB file with no error and no warning.
- Run: `node $TMPDIR/probe8/d.cjs $TMPDIR/probe8/esbproj` printed `esbuild-bundle run OK resources 1 enc fn function`, i.e. a plain `node` invocation of the bundle created a project, a text resource, loaded it through `loadProjectCore` and imported the encryption module.

This is the method `cli`'s own `build` script already uses. It adds no dependency and needs no change to a production file. The `server-only` alias is needed for the encryption path (see below); the create-and-load path ran in candidate 3 without it.

## Candidate 5: vitest-driven

A scratch test file (created in `frontend/tests/unit/`, deleted after the run; `git status --short` empty) called `createProjectCore`, `createResourceCore` and `loadProjectCore` with `GETWRITE_PROJECTS_DIR` read from the environment.

- Command: `PROBE_OUT=$TMPDIR/probe8/vtout pnpm --filter getwrite-frontend exec vitest run tests/unit/zz-task8-probe.test.ts`
- Observed: `Test Files 1 passed`, `Tests 1 passed`, duration 544 ms; `project.json` and the `resources/`, `meta/`, `revisions/` directories existed under the out directory. No watcher error was printed. The test's `console.log` line was not shown in the output, so the printed counts were not captured.
- A vitest file runs only under `vitest run` (a plain `node scripts/...mjs` invocation cannot start it except by spawning vitest), and `frontend/vitest.config.ts` includes `**/*.test.ts` under `frontend/`, so a generator in `scripts/` would have to be a test file or be spawned by one. `tests/setup.ts` mocks `server-only` globally, which is why the encryption path needs no alias here.

## What reaches what (summary)

| | plain node | CLI bundle | jiti | esbuild bundle | vitest |
|---|---|---|---|---|---|
| runs from a plain `node` invocation, no dependency added | no | yes (needs built file, playwright on path) | yes, through an undeclared transitive binary | yes, through the declared `cli` devDependency | no (needs the test runner) |
| `createProjectFromType` | no | yes | yes | yes | yes |
| folders, text, tiptap table/code/image, sidecar, annotation (note), claim, Source attachments, Inbox, smart folder, module switch | no | no | yes | same functions imported; run with create, text resource, load only | create, text resource, load only |
| project loads through `loadProjectCore` | n/a | not run (blank project only) | yes | yes | yes |

For the esbuild and vitest columns only the calls named in their sections were run; they import the same functions the jiti run called.

## Encryption layer

`frontend/src/lib/api/encryption.ts` is the browser fetch client (it exports `fetchEncryptionStatus`, `unlockWorkspaceRequest`, `enableProjectEncryptionRequest` and the like, all HTTP requests); it is not driven from a script. The server side, `frontend/src/lib/models/crypto/enable-encryption.ts` (`enableProjectEncryption`), `keyring-session.ts` and `adapter-selection.ts` (`runInProjectContext`), was driven from a script (`e.ts`, jiti with the `server-only` alias) against a project made in scratch:

| Step | Observed |
|---|---|
| `enableProjectEncryption({ projectId, projectName, passphrase })` | `{"filesConverted":12,"filesSkipped":0,"tempsRemoved":0}` |
| Files on disk | `.encrypted.json` marker present in the project; `.getwrite-keyring.json` present in the workspace root (the directory holding the project, not inside it); `content.txt` no longer contained the plaintext |
| Read with no key: `runInProjectContext(root, null, () => fetchResourceContentCore(...))` | `ProjectLockedError` ("encrypted and the workspace is locked"); no empty result |
| Read with the session keyring | content returned |
| After `lockSession()` the read | `ProjectLockedError` |
| `unlockSession(passphrase)` then read | content returned |

Observations that shape Task 11: the keyring is per workspace root, so an encrypted copy needs a workspace directory of its own (a second project in the same root would be sealed under the same keyring, and the unencrypted project would then sit beside a keyring in that root); the passphrase is a function argument, so it can be read from a file; `assertEncryptionAvailable` reads `isHostedAuthActive()`, and the default key-derivation parameters were used (the run was not timed). In-app steps are not needed on the evidence of this run; it was not run in the packaged app or hosted mode (hosted refuses encryption by design, `EncryptionUnavailableError`).

## Decision for Task 9 (and 10 to 12)

Chosen approach: `scripts/sample-project/generate.mjs` is a thin Node wrapper that bundles a TypeScript driver with the declared `cli` devDependency esbuild (`cli/node_modules/.bin/esbuild`, the same flags as `cli`'s `build` script, output to an OS temp directory, `--alias:server-only` pointed at an empty module for Task 11), then runs the bundle with plain `node`. The driver imports the real core functions (`createProjectCore` or `createProjectFromType`, `createResourceCore`, `updateSidecarCore`, `addAnnotationCore`, `addClaimCore`, `addAttachmentCore`, `captureToInboxCore`, `dispatchSavedQueryAction`, `setModuleEnabledCore`, and for Task 11 `enableProjectEncryption`), so the output stays schema-valid as the app changes. The wrapper and driver follow the `--out <dir>`, `--seed`, one JSON line, refuse-non-empty-target and `rootPath` pattern of `scripts/organizer-grid-fixture/generate.mjs`.

Reasons, each from an observation above: plain node cannot import the models; the CLI reaches only project creation and templates; jiti works but is not a declared dependency of any package (its path is a transitive install and could vanish with a lockfile change); vitest cannot be run as `node scripts/sample-project/generate.mjs`; the esbuild bundle ran under plain `node`, created and loaded a project, imported the encryption module, and uses a dependency the repository already declares and a build step the repository already uses.

Points Task 9 must handle, from this record:

- Pass the directory basename, not `project.json` `id`, as `projectId` to the cores.
- Install an `uncaughtException` handler that ignores `syscall === "watch"` errors, or establish what starts the watcher; the `EMFILE` was seen in the sandbox and its cause was not established.
- Determinism: the cores generate ids with `generateUUID` and timestamps from the clock, and `createProjectCore` picks a random directory id. The probes did not test seeding these. If seeded ids are required (Task 9 asks for the same ids and text from the same seed), the driver must pass ids it controls where the cores accept them (`addAnnotationCore` and `addClaimCore` take an `id`; `createProjectFromType` takes a `projectRoot` the driver can name) or rename afterwards; `createResourceCore` ids were not shown to be settable and need a probe in Task 9's first test.
- Not probed here and left to Task 9's tests: citation and excerpt annotations (`target`), an image resource referenced from text, the folder sidecar, the writing-log entries a real session would add.
- The audio attachment needs bytes that pass the magic-byte check.

If the esbuild step proves unreliable in Task 9, the fallback named in the task list (hand-written JSON with a `loadProjectCore` and Zod-schema test, as in `scripts/organizer-grid-fixture/generate.mjs`) stays available; nothing observed here requires it.
