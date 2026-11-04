// Last Updated: 2026-11-04

/**
 * @module pdf-render
 *
 * The render seam shared by the HTTP route and the native backend (Feature
 * 101, FR-25). `compilePdfCore` takes a {@link PdfRenderer}; the default is
 * {@link renderPdfOnServer}, which keeps `renderToBuffer` (Node only) as the
 * render call on server and desktop. The native backend passes
 * {@link renderPdfInBrowser}, which uses `pdf(<Document/>).toBlob()`, an API the
 * `@react-pdf/renderer` browser build provides, because the static native
 * export resolves that build and its `renderToBuffer` throws.
 *
 * The caller makes the choice rather than run-time detection, so the server
 * path cannot silently take the browser branch.
 */
import type { ReactElement } from "react";
import { pdf, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

/** Renders a react-pdf `<Document/>` element to PDF bytes. */
export type PdfRenderer = (
  element: ReactElement<DocumentProps>,
) => Promise<ArrayBuffer>;

/** Converts a Node `Buffer` to a standalone `ArrayBuffer` (never a view into a shared pool). */
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/** Server and desktop render: `renderToBuffer`. */
export const renderPdfOnServer: PdfRenderer = async (element) =>
  bufferToArrayBuffer(await renderToBuffer(element));

/** Browser render: `pdf(element).toBlob()` then `Blob.arrayBuffer()`. */
export const renderPdfInBrowser: PdfRenderer = async (element) => {
  const blob = await pdf(element).toBlob();
  return blob.arrayBuffer();
};
