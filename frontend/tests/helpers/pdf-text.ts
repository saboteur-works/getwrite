/**
 * Test helper: ordered per-page text extraction and a validity check for a
 * PDF buffer, using `pdfjs-dist`'s legacy build (the one that runs under Node).
 *
 * PDF output embeds a creation date and document id, so tests compare
 * extracted text, never raw bytes (Feature 101, FR-8 and FR-26).
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

/** Outcome of {@link checkPdfValidity}. `reason` is set only when `valid` is false. */
export interface PdfValidity {
  valid: boolean;
  reason?: string;
}

const PDF_HEADER = "%PDF-";
const PDF_TRAILER = "%%EOF";
/** PDF readers accept trailing whitespace and a short run of junk after `%%EOF`. */
const TRAILER_WINDOW_BYTES = 1024;

function toBytes(pdf: ArrayBuffer | Uint8Array): Uint8Array {
  return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

/** Starts loading from a private copy of the bytes (pdfjs transfers its input). */
function openTask(pdf: ArrayBuffer | Uint8Array) {
  return getDocument({
    data: new Uint8Array(toBytes(pdf)),
    useSystemFonts: false,
    verbosity: 0,
  });
}

/**
 * Returns the extracted text of every page, in page order. Items on a page are
 * joined in content-stream order, with a newline where pdfjs reports a line end.
 * Throws if the buffer does not parse; a parse failure is never returned as empty.
 */
export async function extractPdfPageTexts(
  pdf: ArrayBuffer | Uint8Array,
): Promise<string[]> {
  const task = openTask(pdf);
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        text += item.str;
        if (item.hasEOL) text += "\n";
      }
      pages.push(text);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Checks `%PDF-` at the start, `%%EOF` near the end, and that pdfjs parses it. */
export async function checkPdfValidity(
  pdf: ArrayBuffer | Uint8Array,
): Promise<PdfValidity> {
  const bytes = toBytes(pdf);
  if (!latin1(bytes.subarray(0, PDF_HEADER.length)).startsWith(PDF_HEADER)) {
    return { valid: false, reason: "missing %PDF- header" };
  }
  const tail = latin1(
    bytes.subarray(Math.max(0, bytes.length - TRAILER_WINDOW_BYTES)),
  );
  if (!tail.includes(PDF_TRAILER)) {
    return { valid: false, reason: "missing %%EOF trailer" };
  }
  const task = openTask(bytes);
  try {
    await task.promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `does not parse: ${message}` };
  } finally {
    await task.destroy();
  }
  return { valid: true };
}
