# Annotations (developer)

Feature 101, Part 2. Spec: [specs/features/compile-defaults-annotations-native-pdf.md](../../specs/features/compile-defaults-annotations-native-pdf.md) (FR-7 to FR-23). Measurements: [experiments.md](../../specs/features/compile-defaults-annotations-native-pdf/experiments.md), Part 2.

An annotation is a note on a passage of a text resource: a body stored in the resource's sidecar, and an `annotation` mark (attr `id`) in the document that locates the passage.

## Storage

- Sidecar `annotations` array (`Annotation` in `types.ts`: `id`, `body`, `quote`, `createdAt`, `updatedAt`), written only by `annotations-core.ts` through `mutateSidecar`. Because the sidecar is the store, an encrypted project's bodies are stored encrypted, a locked project refuses annotation reads and writes, and Trash and restore keep them (tested; see `sidecars.md`).
- The mark: `components/Editor/Extensions/AnnotationMarkExtension.ts`, registered in `baseSchemaExtensions` so the editor and the headless Markdown serializer share it. `AnnotationHighlightExtension.ts` is the view-only highlight decoration (active passage, caret flag).
- Detached is derived, not stored: an annotation with no mark carrying its id in the open document is detached. Its `quote` is the passage as it was when added or last re-attached.

## Core, validation, routes

- `annotation-validation.ts`: `ANNOTATION_LIMITS` (body 1 to 5000 characters, quote at most 500, at most 500 per resource; UTF-16 code units) and pure validators. An unknown key is refused. A value over a limit is refused with a message, never truncated.
- `annotations-core.ts`: `listAnnotationsCore`, `addAnnotationCore`, `updateAnnotationCore` (body only), `reattachAnnotationCore` (quote only), `deleteAnnotationCore`. Text resources only. Validation runs before any lock or write. Locked-access errors propagate unchanged.
- Route `app/api/annotations/route.ts`, wrapped in `withStorageContext`: `GET ?projectId=&resourceId=`, `POST` (`annotation: { id, body, quote }`), `PUT` (`annotationId`, `body`), `PATCH` (`annotationId`, `quote`; re-attach), `DELETE`. Invalid ids, an invalid body or a non-text resource map to 400; a missing resource or annotation to 404; locked and other errors go to `withStorageContext` (401/409/500). No path is accepted and nothing stored is logged.
- Client: `lib/api/annotations.ts` (HTTP on web and desktop; rejects on a network error, a non-2xx status or a malformed body; `listAnnotations` never resolves an empty list for a failed read). Native: `store/transport/native-annotations-backend.ts` + `.web-stub.ts`, running the same core.
- Paired devices: the route sits behind the same pairing gate as other `/api` routes. No paired-device limit switch was added and no sharing code references it; a run from a paired device was not recorded.

## Editor and panel

`hooks/useAnnotations.ts` (read state; explicit, non-optimistic add, update, delete and re-attach; a locked-access error is rethrown during render), `lib/annotation-flows.ts` (`addAnnotationFlow`, `reattachAnnotationFlow`, `removeAnnotationFlow`: the mark and the stored body are written as a pair, and a failure after the body is stored leaves the note stored and listed as detached), `components/Editor/Annotations/AnnotationsPanel.tsx` (with `useAnnotationsPanel.ts`, `annotation-doc.ts`, `update-kind.ts`), `components/Editor/MenuBar/AnnotationsToolbarButton.tsx` (panel toggle and Add note). The panel opens from the toolbar at every width and renders below the editor body, because the metadata sidebar is a drawer at phone width. Bodies and quotes render as text, never HTML. An annotation-only change is saved by autosave but is not counted as unsaved text work (`update-kind.ts`).

## Copy, duplicate, template, restore

- `copyResourceCore` and `duplicateResource` give every annotation a new id in both the sidecar array and the copy's document marks (`annotation-remap.ts` `remapAnnotationIds`, `annotation-copy.ts` `remapCopiedAnnotations`). A template carries no annotations (tested).
- Revision restore: `setCanonicalRevision` in `revision-core.ts` first removes marks with no sidecar body from the target revision (`annotation-mark-strip.ts`). It never writes the sidecar. Web, desktop and native share that function.

## Paste

`annotation-clipboard.ts` records the last cut or copy (kind, annotation ids, source resource id) from the editor's DOM handlers; `annotation-paste.ts` decides on paste. A same-resource cut-paste keeps the id and writes nothing. A copy, a partial cut, a second paste of one cut, and a cut-paste across resources write a new annotation with a new id and the source body and quote. Pasted text from outside the app, a stale record, or an editor with no resource id keeps the text and drops the mark. The body is read from the source sidecar, never from pasted HTML. On a failed write the new mark is removed and a toast shows the message.

## Search

Bodies are indexed in `indexer-queue.ts` `runTask` into `meta/index/annotations.json` (same shape as `inverted.json`; see [indexing.md](./indexing.md)). An annotation write enqueues an index task, and `reindex` keeps the terms. `execute-search.ts` takes candidates from `search()` plus `searchAnnotationBodies()` (prose hits first, annotation-only ids after, de-duplicated) and sets `snippetKind: "note"` on a body snippet, which `SearchBar.tsx` renders with the text "Note: ". Annotation matching is AND within bodies and prose matching is AND within prose, so a multi-term query whose terms split between the two matches neither (a known limitation).

## Compile and export

Annotations are not compiled or exported. Measured (`compile-annotation-marks.test.ts`): for four annotated-document cases, TXT, Markdown (compile and export), PDF extracted text, the DOCX body and the Markdown warnings were equal to the same document without marks, both with the mark unregistered and after it was registered in the editor. No serializer change was made.

## Not measured or not demonstrated

From experiments.md: a real browser or WebView clipboard (a native `ClipboardEvent`, keyboard or context-menu cut and copy); a paste through the mounted `TipTapEditor`; paste through the HTTP route or native backend; the panel at a 375px viewport in a real browser; the HTTP restore route; the CLI `reindex` run end to end; copy of a resource inside an encrypted project; folder-cascade trash of annotated resources; multi-resource compile, `includeHeaders` off and the native PDF path for the annotation-compile comparison.
