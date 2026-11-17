# Task 60: PDF font failure root cause (experiment)

No fix was made or chosen and no production file, `package.json` or lockfile was edited; nothing was installed. Every value below was produced by `frontend/tests/unit/citations-pdf-font-root-cause.test.ts`, run from `frontend/` with

    pnpm exec vitest run tests/unit/citations-pdf-font-root-cause.test.ts --reporter=verbose --silent=false

(values are the `PROBE` lines; the test asserts what was observed, 11 tests pass). Date measured: 2026-11-15. Versions: fontkit 2.0.4 (reached through `@react-pdf/renderer` -> `@react-pdf/font`, as in Task 58), `@fontsource` IBM Plex 5.3.0, fontTools 4.63.0 (the decoder of (b)).

**Scope of the evidence.** The failure was measured in Node tests (vitest) on code shipped in getwrite-v2.3.0 (commit 6772aae9) and observed once by the owner in their installed app (version not recorded; `experiments/task-58.md`, "Observed in the running app"). This task ran no app, no `compilePdfCore` and no PDF render; it calls fontkit directly on the four bundled faces: IBM Plex Serif 400 normal, Serif 400 italic, Sans 400 normal, Sans 700 normal, each as `.woff2` and `.woff` from `node_modules/@fontsource/ibm-plex-{serif,sans}/files`.

## (a) The `glyf` glyph object and `loca` at the `_addGlyph` site (fontkit/dist/module.mjs:12177)

Test: `reads <face>` (one per face; lines `PROBE addGlyph[woff2|woff][face][char]`). The probe mirrors lines 12177-12190 without writing: `font.getGlyph(gid)._decode()`, `loca.offsets[gid]` and `[gid+1]`, `_getTableStream('glyf')`, `pos += cur`, `readBuffer(next - cur)`, and whether `component.pos + 2` fits the buffer (the `view.setUint16(component.pos, gid)` of line 12190).

Glyph ids and the glyph object, identical from the `.woff2` and the `.woff` of the same face (the test asserts type, `numberOfContours` and component glyph ids equal):

| face | `"` gid | `:` gid | `;` gid | `a` gid | `"` components | `:` components | `;` components |
|---|---|---|---|---|---|---|---|
| Serif 400 normal | 79 | 75 | 77 | 4 | 78, 78 | 73, 73 | 76, 73 |
| Serif 400 italic | 79 | 75 | 77 | 4 | 78, 78 | 73, 73 | 76, 73 |
| Sans 400 normal | 77 | 73 | 75 | 1 | 76, 76 | 71, 71 | 74, 71 |
| Sans 700 normal | 77 | 73 | 75 | 1 | 76, 76 | 71, 71 | 74, 71 |

`"`, `:` and `;` are composite glyphs (`numberOfContours` = -1, two components each) in all four faces, in both formats. The control glyph `a` is simple (`numberOfContours` = 2) in all four faces, in both formats.

What differs between the formats is the `loca` side and the component offsets. Serif 400 normal (the other faces' lines are in the test output):

| glyph | format | `loca[gid]` | `loca[gid+1]` | length | `readBuffer` length | component `pos` | patch in bounds |
|---|---|---|---|---|---|---|---|
| `"` gid 79 | woff2 | 1278 | 100 | -1178 | 0 | 58, 64 | false |
| `"` gid 79 | woff | 7130 | 7154 | 24 | 24 | 12, 18 | true |
| `:` gid 75 | woff2 | 600 | 70 | -530 | 0 | 30, 36 | false |
| `:` gid 75 | woff | 6984 | 7008 | 24 | 24 | 12, 18 | true |
| `;` gid 77 | woff2 | 1906 | 100 | -1806 | 0 | 44, 50 | false |
| `;` gid 77 | woff | 7076 | 7100 | 24 | 24 | 12, 18 | true |
| `a` gid 4 | woff2 | 58162 | 37386 | -20776 | 0 | none | not applicable |
| `a` gid 4 | woff | 40 | 210 | 170 | 170 | none | not applicable |

In all four faces, for `"`, `:` and `;`: the woff2 `loca[gid+1] - loca[gid]` is negative, `readBuffer` returns 0 bytes, and the component `pos` values do not fit the buffer, so the patch at line 12190 is out of bounds (`componentPatchInBounds=false`); the woff values are a 24-byte slice with `pos` 12 and 18, in bounds (`true`). The control glyph `a` does not throw (it is simple, so line 12190 is not reached), but its woff2 slice length differs from the woff's in all four faces (asserted): `readBuffer` length woff2/woff is 0/170 (Serif normal), 27778/168 (Serif italic), 6/136 (Sans 400), 6/134 (Sans 700).

Whole tables, test `compares whole loca and glyf tables for <face>` (lines `PROBE loca[...]`, `directory[...]`, `glyfStream[...]`), Serif 400 normal as the example:

- `.woff2`: fontkit's `loca.offsets` has 264 entries, as the `.woff` does; all 264 differ from the woff's; the last offset is 950 (woff: 19356); 127 steps go backwards (woff: 0). Other faces: backwards steps woff2 129, 131, 131 (italic, Sans 400, Sans 700), woff 0; last offset woff2 902, 132, 100 against woff 22320, 17506, 17452.
- Directory entries fontkit reads from the `.woff2`: `glyf{length=36444, transformed=true, transformLength=32512, offset=16665}` and `loca{length=528, transformed=true, transformLength=0, offset=49177}`. The `.woff`: `glyf{length=19356}`, `loca{length=528}`.
- The stream `_addGlyph` slices for `glyf`: woff2 length 52262 at pos 16665 (the whole decompressed WOFF2 data stream, positioned at the transformed `glyf`); woff length 19356 at pos 0.
- The `.woff` and `.woff2` of a face are not the same glyph bytes: the `.woff` `glyf` table is 19356 bytes against 36156 for the fontTools decode of the `.woff2` (Serif normal), and 192 to 240 of the 263 or 270 glyphs differ byte for byte between the two (test `subsets the fontTools-decoded TrueType...`, line `decodedVsWoff`). So the `.woff` is a different build of the face (the decoded `.woff2` is larger), and "woff against woff2" is not a comparison of one font in two containers. Outlines: glyph paths (SVG) from fontkit's own `.woff2` read equal the fontTools-decoded TrueType's for all glyphs in all four faces (`outlines[...]`, woff2 differing = 0); the `.woff` differs from the decoded TrueType in 16 glyphs in each Sans face and 0 in each Serif face.

## (b) Independent decoder

**Looked for, and where** (test `records what was looked for and where` and `finds a Python with fontTools and brotli`, lines `PROBE search ...`, `which ...`):

- `node_modules/.pnpm` at the repo root, names matching `woff2|wawoff|fonteditor|ttf2|fontverter|opentype|brotli`: only `brotli@1.3.3`, which is a brotli codec, not a WOFF2 decoder (the WOFF2 table transform is what is in question), so it is not independent. `frontend/`, `electron/` and `cli/` `node_modules` top level, same pattern: nothing.
- `which woff2_decompress woff2_compress fonttools pyftsubset ttx`: all not found.
- Python: a local Python with fontTools 4.63.0 and brotli, run with `-I`, was the only one used; nothing was installed for it. The test finds it only through the environment variable `GETWRITE_FONTTOOLS_PYTHON` and searches nowhere else.

**Independent decoder found: fontTools' WOFF2 reader** (`fontTools.ttLib.TTFont(...woff2)` with `flavor = None`, then `save`), which is not fontkit and was not written here. The test runs it through `child_process` and skips the part with a `NOT RUN` probe line if `GETWRITE_FONTTOOLS_PYTHON` is not set. Test: `subsets the fontTools-decoded TrueType of each face for the four glyph sets`. Results, for each of the four faces:

- The decoded TrueType loads in fontkit with 263 glyphs (Serif) or 270 (Sans), as the `.woff` does; its `loca` has no backwards step (`ttf loca backwards steps=0`).
- `"`, `:` and `;` in the decoded TrueType: composite, same component glyph ids as in (a), `loca` length 24, `readBuffer` length 24, component `pos` 12 and 18, patch in bounds (lines `addGlyph[decoded ttf]`).
- Subset and `encode()` in fontkit (the same code path as Task 58), glyph sets `abcd`, `ab"cd`, `ab:cd`, `ab;cd`:

| face | source | `abcd` | `ab"cd` | `ab:cd` | `ab;cd` |
|---|---|---|---|---|---|
| all four | `.woff2` read by fontkit | encoded | RangeError | RangeError | RangeError |
| all four | `.woff` | encoded | encoded | encoded | encoded |
| all four | the `.woff2` decoded by fontTools | encoded | encoded | encoded | encoded |

(`RangeError` is `RangeError: Offset is outside the bounds of the DataView`; lines `PROBE subset[face][text]`.)

## (c) Cause

What (a) and (b) discriminate, as measured with fontkit 2.0.4 and these four faces:

- **Not a property of the glyph outlines in the published `.woff2` files.** The fontTools decode of those same `.woff2` files contains the same composite glyphs and subsets without error.
- **Not a fontkit subset bug in `glyf` writing, for these glyphs.** The same `_addGlyph` and `encode()` succeed on the decoded TrueType and on the `.woff` for the same glyph ids and text.
- **Consistent with the third alternative, the reading of the transformed WOFF2 `glyf`/`loca` in fontkit**: with `.woff2` input fontkit's `loca.offsets` is not a forward sequence of glyph offsets (backwards steps, a last offset far below the `glyf` length), the `glyf` stream `_addGlyph` slices is the whole decompressed WOFF2 data positioned at the transformed `glyf`, the slice length is negative or wrong, and the component `pos` values (24 to 64 across the four faces, against 12 and 18) do not fit it. The directory shows `loca` as `transformed=true`, `transformLength=0`.

Stated as a hypothesis, not as a fact: fontkit 2.0.4's `WOFF2Font` decodes glyph outlines itself (`_transformGlyfTable`, so paths come out right) but does not rebuild a TrueType-layout `glyf` and `loca`, which `_addGlyph` assumes. What this experiment shows is that the three listed alternatives are not distinguished as broadly as that sentence is: it excludes the outline and the `glyf`-writing alternatives and leaves the fontkit reading of WOFF2 as the one that fits. It does not show where in fontkit's WOFF2 code the offsets go wrong (no fontkit source was changed or instrumented), nor that the `.woff2` files are free of fault in some respect fontTools tolerates, nor anything about other fontkit versions or other `@fontsource` releases.

**Unexplained and worth recording.** The control glyph `a` and every other simple glyph do not throw, but `_addGlyph` slices them with the same wrong offsets (`readBuffer` length 0, 27778, 6 or 6 where the correct length is 134 to 170 for `a`). Whether the PDFs that did render from `.woff2` faces embed wrong glyph data was not measured here: Task 58 checked only that the output is a valid PDF (`checkPdfValidity`), not that the glyphs draw. The FR-30 Pixel 7 Pro run (`docs/features/native-pdf-compile.md`) reported a valid PDF embedding the Plex subsets, not that the text drew correctly.

**Next experiments** (none run here):

1. Render a PDF from `compilePdfCore` with plain text through the `.woff2` faces and look at (or text-extract and rasterise) the glyphs, to see whether text without `"`, `:` or `;` draws correctly. Settles the unexplained item above and the size of the problem.
2. Instrument or step fontkit's `WOFF2Font._decompress` / `_transformGlyfTable` / the `loca` decode for one face to see where `loca` is read from (hypothesis to test: from the byte range after the `glyf` data, with `transformLength=0` for a table WOFF2 says is to be rebuilt).
3. Try other fontkit and `@react-pdf/font` versions, and other `@fontsource` releases, against the same faces; not tried.

Fix options are not part of this task and go to the lead and the owner.

## Test

`frontend/tests/unit/citations-pdf-font-root-cause.test.ts` (new, test-only). Green: 11 tests. It asserts the observed values, so a dependency upgrade that changes them makes it fail and the record should be re-measured. The fontTools part depends on `GETWRITE_FONTTOOLS_PYTHON` naming a local Python with fontTools and brotli, and logs `NOT RUN` and returns if it is unset. `pnpm typecheck` passes; `pnpm lint` reports 0 errors (459 warnings repo-wide, none in this file; ESLint on the file alone is clean).
