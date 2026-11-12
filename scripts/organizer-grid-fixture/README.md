# Organizer grid fixture generator

Writes a **generated** GetWrite project of N text resources for the Feature 109 (Organizer grid) card-count measurements (FR-1 (e), (h)). Every name, text and field value is synthetic; no real writing is used. Nothing is written under the repo's `projects/` unless you point `--out` there; use a scratch directory.

## Command

```bash
node scripts/organizer-grid-fixture/generate.mjs --count <N> --out <dir> [--seed <int>]
```

- `--count`: integer 1 to 100000 (the measurements use 100, 500 and 2000).
- `--out`: parent directory. The project is written to `<dir>/<projectId>/`, where the directory name is the project's UUID (as the loader expects). The script prints one JSON line with the path and counts.
- `--seed`: default 109. The same seed and count give the same project, including its ids, so use a different `--out` per count.

No dependencies; Node only. The script refuses a non-empty target directory.

## What it writes

- `project.json` (`projectType: "blank"`, `config.statuses`, `config.subtypes`, and a `config.metadataSchema` with the two fields below).
- Folders: about one per 25 cards (at least 4), nested up to depth 3, `folders/<path>/folder.json`; about 5% of cards sit at the project root. Each folder also has a folder sidecar `meta/folder-<id>.meta.json` carrying a subtype and values for `genre` and `notes`.
- Per card: sidecar `meta/resource-<id>.meta.json`, `resources/<id>/content.txt` and `content.tiptap.json` (20 to 79 generated words), and a canonical `revisions/<id>/v-1`.

## Field set

| Field    | Where stored                | Kind                             | Values                                                                     |
| -------- | --------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `genre`  | `userMetadata.genre`        | select (`config.metadataSchema`) | Fantasy, Mystery, Romance, Science fiction, Horror (every card)            |
| `themes` | `userMetadata.themes`       | multiselect                      | one or two of Loss, Betrayal, Home, Ambition, Memory, Justice (every card) |
| status   | `userMetadata.status`       | project statuses                 | Idea, Draft, Revising, Final; about 10% of cards have none                 |
| subtype  | top-level `resourceSubtype` | `config.subtypes`                | Scene, Character, Location, Research; about 10% of cards have none         |

`orderIndex` is sequential per parent folder (or root).
