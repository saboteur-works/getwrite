# Task 58: PDF font failure reproduction (experiment)

No fix was made and no production file was edited. Every value below was produced by
`frontend/tests/unit/citations-pdf-font-failure.test.ts`, run from `frontend/` with

    pnpm exec vitest run tests/unit/citations-pdf-font-failure.test.ts --reporter=verbose --silent=false

(values are the `PROBE` lines; the test asserts what was observed, 11 tests pass).
Date measured: 2026-11-15. Versions in node_modules: fontkit 2.0.4, @react-pdf/renderer 4.5.1, @react-pdf/pdfkit 5.1.1.

## Measured

1. `compilePdfCore` (default `renderPdfOnServer`, bundled IBM Plex `.woff2` faces, no `citations` option), one text resource, headers on. Test: `compilePdfCore input "<name>"`.

   | input | outcome |
   |---|---|
   | `He said"hello"and left.` | threw |
   | `Note:this is a colon between letters.` | threw |
   | `One;two;three between letters.` | threw |
   | `He said"hello": one;two and left.` | threw |
   | `He said "hello": one; two and left.` (with spaces) | threw |
   | `No special characters at all here.` | rendered, valid PDF, `warning` undefined |

   Full error text, identical for every throwing input: `RangeError: Offset is outside the bounds of the DataView`.
   Stack top (test `logs the top of the stack`): `DataView.prototype.setUint16` <- fontkit `_addGlyph` (fontkit/dist/module.mjs:12177) <- fontkit subset `encode` (:12210) <- `EmbeddedFont.embed` (@react-pdf/pdfkit) <- `EmbeddedFont.finalize` <- `PDFDocument.end` <- @react-pdf/render `render`.
   The error is thrown at embed time, after layout, not when a font file is loaded.

2. Which characters (test `renders each ASCII punctuation character between letters`): all 32 ASCII punctuation characters, each as `ab<ch>cd`, rendered through `CompilePDFDocument` with the registered woff2 faces. Failing set: `"`, `:`, `;` and no other. A text consisting of a single `"` also throws. Between-letters is not needed (spaced input throws too). Not tried: non-ASCII punctuation (curly quotes, dashes), other glyphs outside ASCII punctuation, other weights/families than those registered.

3. Same input with Helvetica (test `renders every input with Helvetica`): the `CompilePDFFallbackDocument` (Times-Roman and Helvetica-Bold, the built-ins) rendered all six inputs, including all of the above.

4. `isFontError` (unexported in `compile-core.ts`; the test mirrors its regex `/font|fetch|404|network/i`, so this is a copy, not the function itself): the error message does not match, `matchesIsFontError=false`. Reading `compilePdfCore`, a non-matching error is rethrown (`if (!isFontError(err)) throw err`), so no fallback applies and no `font-fallback` warning is produced; the call rejects. Measured at the core only (the route and UI were not run).

5. Dependence on the `.woff2` faces.
   - `.ttf`: absent from `node_modules/@fontsource/ibm-plex-{serif,sans}/files` (only `.woff` and `.woff2` exist). The `.ttf` comparison was not run (probe `faces[ttf]`).
   - `.woff`: present for all four faces. A bare react-pdf `Document` with one `Text` using the IBM Plex Serif 400 normal face under its own family name (`Font.clear` is not used: it drops Helvetica), text `He said"hello": one;two and left.`: with the `.woff2` file it threw the same `RangeError`; with the `.woff` file it rendered. Control text `abcd efgh` rendered with both (probes `bareRender[woff2|woff]`, `bareRenderControl[...]`). This bare document is not `CompilePDFDocument`; it differs by using one family and no other styles.
   - fontkit directly (the test resolves fontkit through `@react-pdf/renderer` -> `@react-pdf/font`; no dependency added, package.json untouched): for each of the four faces, `font.layout(text)`, `createSubset()`, `includeGlyph` for each glyph, `encode()`. With the `.woff2` files, `abcd` encoded and each of `ab"cd`, `ab:cd`, `ab;cd` threw the same `RangeError` (all four faces). With the `.woff` files, all four texts encoded for all four faces.

## Result

It reproduces through `compilePdfCore` with the bundled fonts, the error matches no `isFontError` pattern, and so a manuscript containing `"`, `:` or `;` (with or without spaces) fails to compile to PDF. This is the Task 42 implementor's report, now reproduced. FR-17 relevance: the failure is visible (the call rejects), not silent output without citations; the plain path does not fall back to Helvetica for it. Whether the citations PDF path (`runCitationsSeam`) behaves the same was not run here: the test used no `citations` option.

## Cause

Established by experiment (the same glyph subset encoded or threw depending only on the font file format, with fontkit called without react-pdf): the throw depends on the `.woff2` faces, as opposed to `compilePdfCore`, `CompilePDFDocument`, the document structure, react-pdf layout, or the text length. It is thrown in fontkit's subset `encode` when the glyph set includes `"`, `:` or `;` from the `.woff2` files.

Not established: why. Candidate causes not discriminated: the WOFF2 decoder's reconstruction of the transformed `glyf`/`loca` tables for these three glyphs, a property of the glyph outlines in the published woff2 files (for example composite glyphs), or a fontkit subset bug in `glyf` writing that only those glyphs trigger. Experiment that would settle it: in the test, read the `glyf` glyph object for the `"`, `:` and `;` glyph ids from the `.woff2` and the `.woff` of the same face and compare their type (simple or composite), `_getTableStream` bounds and the `loca` offsets at fontkit/dist/module.mjs:12177; and decode the `.woff2` to `.ttf` with an independent decoder and subset that. Also untested: whether a different fontkit version or a newer `@fontsource` release removes it.

## Test

`frontend/tests/unit/citations-pdf-font-failure.test.ts` (new, test-only). Green: 11 tests. It asserts the observed outcomes; if a dependency upgrade changes them it will fail and the record should be re-measured. Fix options are not part of this task and go to the lead.

## Observed in the running app (added by the lead, 2026-11-15)

The owner compiled a document containing `He said: "hi"; then left.` to PDF in their locally installed GetWrite and reported that the compile failed. The app version, the surface (desktop or web), and the error text shown were not captured in this record. This is the first observation outside Node tests; it does not change the cause stated above (dependence on the `.woff2` faces), which Task 60 investigates.
