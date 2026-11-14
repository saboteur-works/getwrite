# Task 25: Long-text fixture generator

Script: `scripts/folklore-long-text-fixture.mjs` (generates data for Task 28 only; not shipped).

## Command run

```
node scripts/folklore-long-text-fixture.mjs --out $TMPDIR/f25out --variants 6 --short 300 --long 3000 --very-long 20000
```

Output went to a scratch directory (`/tmp/claude-501/f25out`), not to `projects/`. Nothing was run in the main store.

## Word counts written (observed from the script's output, counting the written text)

Six Variant Sources, one Narrative folder: 300, 3000, 20000, 300, 3000, 20000 words (short, long, very long, repeated). The loaded sidecars reported the same `wordCount` values.

## The texts are synthetic

Every body is random words from a 20-word list ("river lantern harbor ..."), in paragraphs of 100 words. Names, tellers, places, dates ("c. 1850") and the motif and tale-type options are placeholders. No text is a writer's, and none is a real telling. Word counts of such text say nothing about how real prose reads or lays out.

## Project shape written

- One folder with sidecar `resourceSubtype: "Narrative"`.
- N Sources (`type: "source"`, `resourceSubtype: "Variant"`, empty `attachments`, canonical `v-1` revision, `content.txt`, `content.tiptap.json`), each with values for the five fields.
- Metadata schema group with text fields `teller`, `date`, `place` and multiselect fields `motifs`, `tale-types` (options of the form "D1 | Synthetic motif one"), each `appliesTo: ["Variant"]`, no `appliesToFolders`.
- `config.subtypes: ["Narrative", "Variant"]`, `config.modules: { folklore: true }`.

## Open check

A throwaway vitest probe (deleted afterwards, not part of the repo) set `GETWRITE_PROJECTS_DIR` to the scratch directory and called `loadProjectCore(projectId)`. Observed: it resolved; `config.modules` was `{ folklore: true }`, `config.subtypes` was `["Narrative","Variant"]`, 1 folder, 6 resources, each of type `source`, subtype `Variant`, with the five field keys present. The probe test passed (1 test).

## Not checked

The tab, the comparison and any rendering of this project in the app; whether `folklore` is a registered module in this branch at this point; the revision text read through `fetchResourceContent`.
