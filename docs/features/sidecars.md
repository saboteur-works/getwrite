# Sidecar Metadata

**Purpose:** Sidecars are small JSON files that store metadata for resources (and other objects) separate from the primary content file. They let the system persist discovery and indexing metadata without modifying resource text files.

**Location & Naming**

- Sidecars live under a project's `meta/` directory by convention (e.g., `<projectRoot>/meta/resource-<id>.meta.json`).
- Naming convention: `resource-<uuid>.meta.json` for resource sidecars. Other sidecar types may use different prefixes (e.g., `folder-<id>.meta.json`).

**Primary Fields (recommended)**

- `id` (string): resource id (UUID) — canonical key.
- `name` (string): display name or title.
- `type` (string): resource type (e.g., `text`, `image`).
- `createdAt` / `modifiedAt` (ISO string): timestamps for lifecycle events.
- `folderId` (string): id of the containing folder.
- `tags` (array[string], optional): project-scoped tags.
- `resourceSubtype` (string, optional): the resource's single subtype label (Feature 72); see [resource-subtype.md](resource-subtype.md).
- `templateId` (string, optional): if resource came from a template, the originating template id.
- `metadata` (object, optional): system-managed or developer-extended fields (e.g., derived counts). Not directly editable by users through the UI.
- `userMetadata` (object): user-managed metadata fields edited through the Metadata sidebar. See [docs/features/data/metadata.md](data/metadata.md) for the full field listing.

**`metadata` vs `userMetadata`**

- `metadata` is written by the system or developer extensions. Users do not edit it directly.
- `userMetadata` is the primary container for user-controlled properties — notes, status, characters, locations, items, POV, timeframe, and `orderIndex`. The Metadata sidebar reads and writes this field.

## Example sidecar (`resource-<id>.meta.json`)

```json
{
  "id": "b19abcd4-81b2-44ef-b4b4-ba1310dbdf87",
  "name": "Title Page",
  "type": "text",
  "createdAt": "2026-02-21T07:17:41.691Z",
  "modifiedAt": "2026-02-21T07:17:41.691Z",
  "folderId": "folder-123",
  "tags": ["front-matter"],
  "preserve": true,
  "metadata": {},
  "userMetadata": {
    "orderIndex": 0,
    "status": "Draft",
    "notes": "Opening chapter — introduce setting before character.",
    "characters": ["Elena", "Marcus"],
    "pov": "Third person limited"
  }
}
```

## API & Helpers

- Read/write helpers live in `frontend/src/lib/models/sidecar.ts` and expose `readSidecar(projectRoot, resourceId)`, `writeSidecar(projectRoot, resourceId, meta)` and `mutateSidecar(projectRoot, resourceId, mutate, options?)`.
- **Writes (Feature 92).** A sidecar write runs under `withMetaLock(projectRoot)` and then the sidecar's per-file lock (`withFileLock`, `file-lock.ts`), with the read inside that lock, and is written atomically (temp file then rename). The sidecar lock is released before the `config.metadataRevision` bump takes the `project.json` file lock; the two file locks are never nested, and no lock is taken inside a file lock.
- `mutateSidecar` is the sink for a writer that derives the new value from the stored one: `mutate(current)` receives the value read inside the lock (`null` if absent) and returns the value to store, or `SIDECAR_UNCHANGED` to write and bump nothing. A read error, a locked-access error or a throw from `mutate` propagates and nothing is written. `options.isReadTolerant` makes an unparseable file read as `null` (as `writeSidecar` does); a locked-access error still propagates.
- `writeSidecar` stores the whole object it is given. Use it only for a first write of a new id. A caller must not build a whole object from an earlier read and pass it to `writeSidecar`: that value can be older than the stored one by the time it is written. Use `mutateSidecar`.
- The trash move of a sidecar and restore's write of the live sidecar (`trash.ts`) take the sidecar's file lock. A metadata save (`updateSidecarCore`) or noise-term dismissal (`setNoiseTermDismissedCore`) for a resource with no live sidecar is refused with `ResourceGoneError` (HTTP 404, `code: "resource-gone"`) instead of creating one; before this, a save arriving after a delete recreated the sidecar and the trashed resource reappeared in the tree with no content (POS note_131ecc62). Not covered by the lock: new-id creation (copy, duplicate, templates). `updateSidecarCore` merges a client-sent object, so a client holding stale data can still overwrite newer values; that contract is unchanged (OQ-9). The source scan test (`tests/unit/project-json-lock-scan.test.ts`) reads one file at a time and goes by names; it does not prove every writer is locked.
- When updating resource content, keep the sidecar in sync; tests rely on sidecar presence for indexing and pruning logic.

## Best Practices

- Keep sidecars small and focused: prefer scalar fields and shallow objects to reduce read/write churn.
- Use sidecars for derived, mutable, or indexable attributes (tags, previews, derived counts), not as canonical copies of resource content.
- Always write sidecars atomically when updating (write temp file and rename) to reduce risk of partial writes. `writeSidecar` and `mutateSidecar` do this.
- Change an existing sidecar with `mutateSidecar`, reading the current value inside the callback; do not read with `readSidecar`, edit, and write the result back.
- Do not call a lock (`withMetaLock`, `acquireLock`, `withFileLock`) or `writeSidecar` from inside a `mutate` callback.
- Add new fields to sidecars conservatively and document them in `docs/features/sidecars.md` to maintain interoperability.

## Troubleshooting

- If sidecar reads fail, check file permissions and path (`<projectRoot>/meta/resource-<id>.meta.json`).
- If tests fail due to missing fields, verify unit tests that create test projects are creating sidecars as expected.
