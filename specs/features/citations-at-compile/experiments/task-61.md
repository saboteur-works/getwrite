# Task 61: PDF export faces from .woff2 to .woff

Date: 2026-11-15. Records Task 61's own results only.

## Change

`registerIBMPlexFonts` in `frontend/src/lib/export/CompilePDFDocument.tsx` now points its four faces (Serif 400 normal and italic, Sans 400 and 700) at the `.woff` files of the same `@fontsource` packages, which were already installed. Nothing else in that file changed. `package.json` and the lockfile are untouched; nothing was installed.

## Failing before (measured, unchanged `.woff2` faces)

New test `frontend/tests/unit/citations-pdf-font-fix.test.ts`, run with `pnpm exec vitest run tests/unit/citations-pdf-font-fix.test.ts` before the face paths were changed. Both tests failed:

```
 ❯ |node| tests/unit/citations-pdf-font-fix.test.ts (2 tests | 2 failed) 51ms
     × renders a valid PDF with no font-fallback warning 45ms
     × embeds glyph outlines equal to the source .woff faces for the probed characters 5ms
RangeError: Offset is outside the bounds of the DataView
 ❯ ...fontkit@2.0.4/node_modules/fontkit/dist/src/subset/TTFSubset.js:32:13   (_addGlyph)
 ❯ ...fontkit/dist/src/subset/TTFSubset.js:75:11                               (encode)
 ❯ EmbeddedFont.embed  (@react-pdf/pdfkit 5.1.1, pdfkit.js:37506:30)
 ❯ EmbeddedFont.finalize
 ❯ PDFDocument.end
 ❯ render (@react-pdf/render 4.5.1)
 ❯ renderPDF / Object.toBuffer (@react-pdf/renderer 4.5.1)
 ❯ renderToStream
```

The test goes through `compilePdfCore` with the default `renderPdfOnServer`; the section header is `Said "Hi": one; two` and the body is `He said "hello": one; two; three and left.`

## Passing after

Same command after the change: 2 passed. The second test reads the output PDF, inflates each embedded `FontFile2` subset and its `ToUnicode` map, and reads both the subset and the source `.woff` face with fontkit (reached through `@react-pdf/renderer` -> `@react-pdf/font`, as in Task 58). For each probed character it finds the subset glyph id through the PDF's own `ToUnicode` map and compares `glyph.path.toSVG()` with the source face's outline for the same character; they are equal and non-empty.

```
PROBE embedded fonts: OPBMOA+IBMPlexSans-Bold RNOZYZ+IBMPlexSerif-Regular
PROBE compared outlines: ibm-plex-sans-latin-700-normal ["] [:] [;] [a] [e] [o] [n]
                         ibm-plex-serif-latin-400-normal ["] [:] [;] [a] [e] [o] [n]
```

The faces used by this compile are Sans 700 (section header) and Serif 400 normal (body). Serif italic and Sans 400 are not used by a plain-text compile, so no glyph of those two faces was compared; their file path change is the same edit, and they are not covered by an outline check here.

## Other checks

- `pnpm test:ci` in `frontend/`: 989 files passed, 13561 tests passed, 8 expected fail, 3 skipped.
- `pnpm typecheck`: no errors. `pnpm lint`: 0 errors, 459 warnings (the three PDF font test files and `CompilePDFDocument.tsx` produce none when linted alone).
- `GETWRITE_FONTTOOLS_PYTHON` was unset for every run; Task 60's test passes and logs `NOT RUN` for part (b).

## THIRD_PARTY_FONTS.txt and docs/ check

Command: `grep -n -i woff THIRD_PARTY_FONTS.txt` and `grep -rn -i woff docs`. Result: `THIRD_PARTY_FONTS.txt` line 4 says the listed families ship "as WOFF2 files, served from the app's own origin"; it does not mention PDF. `docs/features/editor/settings.md` line 111 says the bundled families ship as WOFF2 and that PDF export registers the IBM Plex faces "from the installed packages, not from remote URLs", without naming a format for the PDF faces. No statement names `.woff2` for the PDF faces, so neither file was edited. (The two WOFF2 statements are about the editor UI's `styles/bundled-fonts.css`, which this task does not change.)

## Dated note: why the Task 58 and Task 60 tests changed (2026-11-15)

`frontend/tests/unit/citations-pdf-font-failure.test.ts` (Task 58) asserted, against the shipped faces, that every `compilePdfCore` input with `"`, `:` or `;` throws `RangeError: Offset is outside the bounds of the DataView` and that `['"', ":", ";"]` fail in a direct render. Those were observations of the `.woff2` faces that shipped; since this task the shipped faces are `.woff`, so they now expect every input to render with no warning and no failing characters. The stack-logging test, which required a throw, was removed. The tests that compare `.woff2`, `.woff` and `.ttf` files directly, and the direct fontkit subset test, are unchanged, since they name the file extension and not the shipped faces. `frontend/tests/unit/citations-pdf-font-root-cause.test.ts` (Task 60) reads the font files directly and never the shipped registration, so it needed no change and passes as it was. `experiments/task-58.md` and `experiments/task-60.md` are not edited; they record what was measured before the change.

## Not verified

- Visual difference between the `.woff` and `.woff2` builds (not measured; Task 60 recorded only that 192 to 240 glyphs differ byte for byte).
- Serif italic and Sans 400 outlines in a PDF.
- A packaged or standalone build resolving the `.woff` assets with the file tracer (needs `next build`, main checkout), and the Android on-device run.
