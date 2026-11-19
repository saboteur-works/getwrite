# Task 6: FR-1 (e), appended node ids, the 500-annotation limit and mark stripping

Measurement only. No production file, `package.json` or lockfile was edited. Two throwaway vitest probes (jsdom) were copied into `frontend/tests/unit/` for the run, executed with `pnpm exec vitest run <file> --silent=false --reporter=verbose` from `frontend/`, and deleted afterwards (`git status --short` empty after deletion). The probe sources stay in the scratchpad and are not committed. Environment: node v24.15.0, pnpm 10.28.0, `@tiptap/core` and `@tiptap/extension-unique-id` 3.26.1, vitest 4.1.6, base commit `ce509a98`.

Schema for the editor probes: `baseSchemaExtensions` from `frontend/components/Editor/editorExtensions.ts` plus `CustomHeading`, as in the F120 `task-6.md`. Each editor was read after a 30 ms wait, because that record measured that `UniqueID` assigns ids after a timer and not at construction. The limit and strip probes used a real temporary project directory (`createProject`, `writeSidecar`, the real `addAnnotationCore`, `updateAnnotationCore`, `deleteAnnotationCore`, `listAnnotationsCore`, `persistResourceContent`), removed at the end of the run. Synthetic text only.

Documents used: a target with paragraphs `T1` (carrying a mark `tA`) and `T2`; an absorbed document with heading `A1`, paragraphs `A2`, `A3`, `A4` carrying marks `aNote`, `aCite`, `aClaim` (standing for a note, a citation and a claim), blockquote `A5` holding paragraph `A6`, code block `A7`, and a bullet list holding paragraph `A8`. Nine nodes in the absorbed document bear an id type (the five types `UniqueID` is configured for: paragraph, heading, blockquote, codeBlock, table); the list, list item and image carry none.

## Contradicts the spec

Nothing read in the spec was contradicted by these probes. The F120 observation, that `UniqueID` does not refresh an id a node already has, held again for appended nodes (rows I1 to I3). Whether FR-3 and the merge core need fresh ids is a decision for Tasks 18 and 25; this record only states what each way of appending produced.

## Appended node ids (observed)

Ids are `attrs.id` of the five id-bearing types, in document order. "Appended" is the absorbed document's nodes placed after the target's two paragraphs.

| Row | Probe | Observed |
|---|---|---|
| I1 | Plain JSON concat of the target content and the absorbed content, loaded into a new editor, read after 30 ms | Target ids `T1`, `T2`, then `A1`..`A8` identical to the absorbed document's ids, then one more paragraph with a generated id (a trailing empty paragraph the loaded document added after a last node that is not a paragraph; F120 `task-6.md` recorded the same). So the appended nodes' ids are shared with the absorbed document, not fresh. |
| I2 | Live editor holding the target; `commands.insertContentAt(doc.content.size, absorbedJson.content)`; read after 30 ms | Same result as I1: `A1`..`A8` kept, plus one generated trailing paragraph. Shared, not fresh. |
| I3 | Live editor holding the target; nodes built with that editor's own schema (`schema.nodeFromJSON`) and inserted with `tr.insert(doc.content.size, nodes)`; read after 30 ms | `T1`, `T2`, `A1`..`A8` kept, plus one generated trailing paragraph. Shared, not fresh. |
| I4 | The same append with `attrs.id` removed from every absorbed node before appending, loaded into a new editor | The nine appended id-bearing nodes all got a generated id; 0 of them occur among the absorbed document's ids; no null ids anywhere. The target's `T1`, `T2` were unchanged. So `UniqueID` gives fresh ids to appended nodes only when their `attrs.id` is missing. |
| I5 | A target `T1`, `T2` and an absorbed document that also carries paragraph ids `T1`, `T2` (as a document copied from the target would), concatenated and loaded | Result `T1 | T2 | T1 | T2`. A duplicate id inside one document was left as it was (no repair at load), as F120 `task-6.md` U2 measured for a single document. |
| I6 | Plain JSON concat, no editor | The ids are exactly those of the inputs; nothing generates or removes an id outside an editor. |
| I7 | Annotation marks `tA`, `aNote`, `aCite`, `aClaim` in the concat of I1, read back from the editor's JSON | All four mark ids present. Appending kept the absorbed document's marks with their ids. |

A first run of I3 built the inserted nodes from a second editor's document (a different schema instance) and the transaction left the target at 2 children with no error; the row above is the rerun with nodes built from the target editor's own schema. No cause for the first result was tested; the experiment that would settle it is to repeat I3 with nodes from a second editor and log the transaction's `docChanged` and steps.

The ids a merge would append are thus shared with the absorbed document in all three append forms, and the target and absorbed document hold the same ids afterwards if the absorbed document stays on disk. Which of "keep" or "strip then let the editor generate" a merge uses is not decided here.

## 500-annotation limit (observed)

`ANNOTATION_LIMITS.maxPerResource` is 500 (`frontend/src/lib/models/annotation-validation.ts`).

| Row | Probe | Observed |
|---|---|---|
| L1 | `validateNewAnnotation` with 498, 499, 500 and 501 existing annotations | ok at 498 and 499; at 500 and at 501 refused with "A resource can't have more than 500 annotations." |
| L2 | A target sidecar written through `writeSidecar` with 498 + 3 = 501 annotations (a list built by concatenation, standing for a merge past the limit), then read | The write succeeded. `readSidecar` and `listAnnotationsCore` returned all 501. Nothing in the write path refused a list over 500. |
| L2 | `addAnnotationCore` on that 501 sidecar | Refused with "A resource can't have more than 500 annotations." |
| L2 | `updateAnnotationCore` on one of the 501 | Accepted; body changed. |
| L2 | `deleteAnnotationCore` of one, then `addAnnotationCore` | After the delete the list held 500; the add was still refused. |
| L3 | A sidecar written with 498 + 2 = 500 annotations, then `addAnnotationCore` | Refused (the limit applies at exactly 500). |
| L4 | `partitionAnnotations` (F120) with 501 annotations as input | `{"outcome":"failed","reason":"over-limit","annotationId":null}`. This is the F120 precedent; it checks input and each resulting list. |

So `annotation-validation.ts` guards one add at a time (`validateNewAnnotation` and `validateNewClaim`) and not a batch carry: a merge that writes the concatenated list through the sidecar write path stores a list over 500 without refusal, and the first later add is refused. A merge refusing over 500 would have to check `target.length + carried.length` itself, as `partitionAnnotations` does for a split. Whether the cap in Task 24 and 25 should be that check is for those tasks to decide.

## Mark stripping and `content.txt` (observed)

Absorbed paragraph `A1`: runs `plain `, `noted`{aNote}, ` mid `, `cited`{aCite, bold}, ` end `, `claimed`{aClaim}. "Strip" is `stripBodylessAnnotationMarks(doc, new Set())` (`annotation-mark-strip.ts`); "persist" is `persistResourceContent` (`frontend/src/lib/tiptap-utils.ts`).

| Row | Probe | Observed |
|---|---|---|
| S1 | Strip all three marks | 3 marks removed; the input object was not modified; `tiptapToPlainText` of the document before and after: equal (`plain noted mid cited end claimed`); the `bold` mark on the cited run kept (`[{"type":"bold"}]`); mark ids afterwards: none. |
| S1 | Stored JSON text runs before and after strip | 6 and 6: the strip leaves adjacent text nodes split, not merged. Pretty-printed JSON length 1156 before, 681 after. |
| S2 | `persistResourceContent` of the original, then of the stripped document, on a real resource directory | `content.txt` byte-identical before and after (33 characters); `content.tiptap.json` not byte-identical. So stripping changes the stored JSON and not `content.txt`. |
| S3 | Both the kept and the stripped JSON loaded into an editor and read with `getJSON` | Runs: 6 for the kept document, 3 for the stripped one (`plain noted mid `, `cited`{bold}, ` end claimed`): the editor merges adjacent runs with equal marks. `getText` of the two equal. |

Keeping the marks (no strip):

| Row | Probe | Observed |
|---|---|---|
| K1 | `collectAnnotationMarkIds` on the absorbed document and on the target-after-append document | Absorbed holds `aNote`, `aCite`, `aClaim`; all three are also marked in the appended target. So two documents hold one annotation id each, if the absorbed document is left unchanged. |
| K2 | `stripBodylessAnnotationMarks(absorbed, knownIds)` where `knownIds` is the absorbed sidecar's ids after the three annotations moved to the target (empty set) | 3 marks removed. This is the strip the restore path of a revision applies (`revision-core.ts`), so restoring a revision of the absorbed document would remove those three marks. |
| K3 | The same call where the absorbed sidecar still holds all three annotations | 0 removed. |
| L5 | `addAnnotationCore` of one annotation id to a first resource, then the same id to a second resource | Both accepted. `validateNewAnnotation` checks collision within one resource's list only; no check across resources exists. |

## Not measured

- A paste or drop of the absorbed nodes into the editor (the extension's paste handling was read in F120 and not exercised there either).
- The mark behaviour for a merged document through the full merge core, which does not exist yet; every row above is a composed primitive.
- A document with a table, an image, or `textStyle` marks in the appended part; an annotation in a table cell.
- Claim and citation annotations through the carry: marks stand in for them here, because the mark is the same `annotation` mark for all three kinds; their `claim` and `target` fields were not part of any probe.
- Documents of hundreds of thousands of words, and timing.
- Why the first I3 run left the target unchanged (see above).

## Readers

Tasks 18, 19 and 25 read this record before writing tests: rows I1 to I5 (what an append gives for ids), L1 to L4 (the limit and the F120 precedent), S1 to S3 and K1 to K3 (strip or keep), L5 (one id in two resources).

## Test and build status

No production code changed. Typecheck, lint and the Electron and CLI typecheck were not run (no file under `frontend/src/lib/models/`, `cli/` or `electron/` was touched). The only runs were the two throwaway probes, both passing (1 test each).
