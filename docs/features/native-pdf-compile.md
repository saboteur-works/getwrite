# PDF compile on native (developer)

Feature 101, Part 3. Spec: [specs/features/compile-defaults-annotations-native-pdf.md](../../specs/features/compile-defaults-annotations-native-pdf.md) (FR-24 to FR-30). Measurements: [experiments.md](../../specs/features/compile-defaults-annotations-native-pdf/experiments.md), Part 3.

## What was changed

`lib/export/pdf-render.ts` holds the render seam: `PdfRenderer`, `renderPdfOnServer` (`renderToBuffer`, the default) and `renderPdfInBrowser` (`pdf(<Document/>).toBlob()`, then `Blob.arrayBuffer()`). `compilePdfCore(body, render = renderPdfOnServer)` in `models/compile-core.ts` takes the renderer. `native-compile-backend.ts` passes `renderPdfInBrowser`; `app/api/compile/pdf/route.ts` is unchanged. The `font-fallback` handling wraps whichever renderer is passed.

## Observed

- Under Vitest, with `@react-pdf/renderer` swapped for its browser build, the old path rejected with "renderToBuffer is a Node specific API", and the new renderer produced a valid PDF whose extracted text equals the server path's (`compile-pdf-browser-build.test.ts`, `native-compile-pdf-parity.test.ts`).
- Both PDF entry paths (project menu "Compile Project" and Start Page "Package") produced a valid PDF with the native transport selected, with a fake filesystem and the download step mocked (`native-compile-entry-paths.test.tsx`).
- The `font-fallback` warning and its toast were demonstrated with an injected font error, not a real one.

## Observed on device (FR-30, 2026-11-06)

One check: Pixel 7 Pro, Android 17, Android System WebView 156, airplane mode with wifi and data off (ping 100% loss), debug build installed from `pnpm build:native` and `cap sync`. A PDF compiled from Project menu > Compile Project was valid (`%PDF-1.3`, 81,201 bytes, one page, extracted text matched what was typed) and written to `Documents`. Checked with `pdfjs-dist` and the font dictionaries: subsets of IBM Plex Sans Bold (section headers) and IBM Plex Serif Regular (heading and body) are embedded; a non-embedded Helvetica entry is present with no text drawn in it. This is one device, one document, one entry path. It does not show that fonts embed for every PDF or device.

## Not verified

- The pipeline itself ran no device or Android WebView; the device check is under Observed on device below.
- On a device: the Start Page compile path; DOCX and Markdown; bold, italic or non-Latin text; heading styling in the PDF ("Chapter One" was drawn at body size and face, not compared with the server path); whether the `font-fallback` notice shows in a real font failure.
- Whether the `font-fallback` notice appeared in the FR-30 run: not observed, but the screenshot was taken about 10 s after Compile, so a short toast could have been missed.
- Separate observation, not reproduced, cause not established: once, a `.txt` was written after `pdf` was chosen (POS task task_76229e5f; experiments.md, FR-30 device check).
- Whether the earlier on-device failure had the same path as the reproduced error; only the Vitest reproduction was observed.
- Separate observation, cause not established: a server-path render of one test paragraph threw a fontkit `RangeError` (experiments.md, Task 24).

The handbook says only that PDF compile uses an in-app render path on Android; it makes no claim about fonts or about what was checked.
