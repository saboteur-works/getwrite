# PDF compile on native (developer)

Feature 101, Part 3. Spec: [specs/features/compile-defaults-annotations-native-pdf.md](../../specs/features/compile-defaults-annotations-native-pdf.md) (FR-24 to FR-30). Measurements: [experiments.md](../../specs/features/compile-defaults-annotations-native-pdf/experiments.md), Part 3.

## What was changed

`lib/export/pdf-render.ts` holds the render seam: `PdfRenderer`, `renderPdfOnServer` (`renderToBuffer`, the default) and `renderPdfInBrowser` (`pdf(<Document/>).toBlob()`, then `Blob.arrayBuffer()`). `compilePdfCore(body, render = renderPdfOnServer)` in `models/compile-core.ts` takes the renderer. `native-compile-backend.ts` passes `renderPdfInBrowser`; `app/api/compile/pdf/route.ts` is unchanged. The `font-fallback` handling wraps whichever renderer is passed.

## Observed

- Under Vitest, with `@react-pdf/renderer` swapped for its browser build, the old path rejected with "renderToBuffer is a Node specific API", and the new renderer produced a valid PDF whose extracted text equals the server path's (`compile-pdf-browser-build.test.ts`, `native-compile-pdf-parity.test.ts`).
- Both PDF entry paths (project menu "Compile Project" and Start Page "Package") produced a valid PDF with the native transport selected, with a fake filesystem and the download step mocked (`native-compile-entry-paths.test.tsx`).
- The `font-fallback` warning and its toast were demonstrated with an injected font error, not a real one.

## Not verified

- Any real device or Android WebView, the static-export bundle (`pnpm build:native` was not run in the pipeline), and the native file-save step.
- FR-30: whether IBM Plex fonts are embedded in a PDF made on Android with the network off, and whether the `font-fallback` notice shows. This check needs the owner and a device and has not been run. No doc or PR text may claim fonts embed on Android.
- Whether the earlier on-device failure had the same path as the reproduced error; only the Vitest reproduction was observed.
- Separate observation, cause not established: a server-path render of one test paragraph threw a fontkit `RangeError` (experiments.md, Task 24).

The handbook says only that PDF compile uses an in-app render path on Android and that this has not been checked on a device.
