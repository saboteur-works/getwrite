# Sample project generator

Writes a **generated** GetWrite project for manual testing, built for Feature 121 (merge documents) and general enough for other checks (POS `task_23e9c7df`). Every name, text and field value is synthetic; no real writing is used. This is test tooling, not part of the product. **Never point it at, copy from, or load a real project.** Nothing is written under the repo's `projects/` unless you point `--out` there; use a scratch directory.

## Command

```bash
node scripts/sample-project/generate.mjs --out <dir> [--seed <int>] [--encrypted <passphrase-file>]
```

- `--out` (required): parent directory. The project is written to `<dir>/<projectId>/`, the directory name being the project's UUID (as the loader expects). The script refuses a project directory that already holds files, before any write, and prints one JSON line: `path`, `projectId`, `seed`, `counts`, `merge` (ids of the arranged documents, below) and, with `--encrypted`, `encrypted`.
- `--seed` (default 121, the feature number): an integer. The same seed gives the same project id, resource ids and text. Timestamps come from the clock, so files are not byte-identical between runs.
- `--encrypted <passphrase-file>`: also writes an encrypted copy of the same project (same seed, same ids and text) to `<dir>-encrypted/<projectId>/`. The passphrase is read from the file (one line; a trailing newline is dropped) and is never taken from the command line or printed. Create the file outside the repository; never commit a passphrase. The JSON line then gains `encrypted: { path, projectId, keyringFile }`. The copy has its own workspace root because the keyring file `.getwrite-keyring.json` is written in the root. Without the option no second directory is written and the line has no `encrypted` key. Encryption is refused in hosted mode; this script is not run in that mode.

The script bundles `driver.ts` with the `cli` workspace's esbuild into an OS temp directory, runs it with plain Node and removes the temp directory. The driver calls the real core functions, so the output follows the app's schemas as they change. Run `pnpm install` first so the `cli` esbuild exists. In the command sandbox the driver prints `ignored a file-watch error: EMFILE` to stderr; the run still completes.

## What it contains

General coverage (default seed: 16 folders, 72 resources: 69 text, 1 Source, 1 image, 1 audio; 9 annotations):

- Folders nested to depth 4 (`Manuscript > Part One > Chapter One > Scenes`), `Story Elements`, `Research`, and the Inbox with one captured item.
- Text documents with status, subtype and custom fields `genre` (select) and `themes` (multiselect); a table, a code block and an image shown in text.
- A Source "Field notes" with an image and an audio attachment; an entity "Mara Venn" with aliases "Mara" and "the cartographer".
- Annotations: a note, a text excerpt, an attachment excerpt, a citation and two claims (one with a Source link).
- A smart folder "Drafts" (status is Draft). The sources, claims, citations and folklore modules are on. No Narrative folder or Variant Source is written.

Merge-specific coverage sits under the top-level folder "Merge checks". The JSON line's `merge` object names each document by id:

| `merge.<key>`             | Document(s)                                                                                                                                              | Check it serves                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `crossFolder`             | "Cross A document", "Cross B document", "Cross C document" in sibling folders Cross A/B/C; `selection` is C, A, B and `treeOrder` is A, B, C             | A selection across folders whose first selected document is not first in tree order |
| `absorbedWithAnnotations` | "Absorbed with notes" (a note, a citation with a Source target, a claim) and its target "Absorb target"                                                  | Annotations carried from an absorbed document                                       |
| `metadataDiffers`         | "Metadata one", "Metadata two", "Metadata three"                                                                                                         | Status, select and multiselect values that differ between documents                 |
| `emptyDocument`           | "Empty document" (one empty paragraph, no annotations)                                                                                                   | A fully empty document                                                              |
| `excludedTarget`          | "Target left out of compile" (in `config.compileDefaults.excludedResourceIds`)                                                                           | A target excluded from compile                                                      |
| `inboxTarget`             | "Target in the Inbox"                                                                                                                                    | A target inside the Inbox                                                           |
| `refusals`                | `source` "Field notes", `entity` "Mara Venn", `folder` "Scenes", `image` "Sample figure", `audio` "Sample recording", `marked` "Already merged document" | Items a merge selection must refuse                                                 |
| `markedDocument`          | "Already merged document" and the target it names, "Mark target"                                                                                         | A document already marked as merged                                                 |
| `timing`                  | Folder "Timing 50" with `fifty` (50 text documents, about 5000 words each); `ten` and `two` are the first 10 and first 2                                 | Merges of 2, 10 and 50 documents                                                    |

### The merged mark is hand-written

"Already merged document" carries a `mergedMark` written directly with the real mark store (`writeMergedMark`). No merge ran when the generator was written (no merge core existed). Its snapshot revision id is the target's existing `v-1` revision id, so it is not a "Before merge" revision. To get a real mark, merge two documents in the app once the merge feature has shipped (Feature 121, Task 25 onward) and use the document that merge marks.

## Loading it

Copy only the generated project directory (`<dir>/<projectId>/`), never a real project.

- **Desktop:** copy `<dir>/<projectId>/` into the desktop app's projects directory under the userData folder. On macOS that is under `~/Library/Application Support/getwrite-electron/`; look for the existing project folders there. Restart or reopen the app so it lists the project.
- **Hosted:** copy it under `GETWRITE_DATA_ROOT`, into the tenant's own project directory (the signed-in tenant's folder, beside that tenant's other projects), so the tenant sees only its own copy.
- **Encrypted copy:** point the app's projects directory at `<dir>-encrypted/` (it holds the keyring file and the project), then unlock the workspace with the passphrase from the file you gave `--encrypted`.

None of these loads has been run by the author of this file; loading into a running app is the owner's step in Tasks 44 and 45 of Feature 121. See `specs/features/merge-documents/experiments/task-12.md` for what was run.

## Tests

```bash
pnpm --filter getwrite-frontend exec vitest run tests/unit/sample-project-generator.test.ts tests/unit/sample-project-encrypted.test.ts
```
