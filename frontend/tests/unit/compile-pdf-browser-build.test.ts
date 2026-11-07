/**
 * Feature 101, Task 24 (FR-24): reproduces the PDF compile failure seen on the
 * Android WebView. The static native bundle resolves `@react-pdf/renderer` to
 * its browser build (`package.json` "browser" field), where `renderToBuffer`
 * throws "... is a Node specific API".
 *
 * Browser resolution is forced with `vi.mock`, replacing the module with the
 * package's `lib/react-pdf.browser.js` file (vitest.config.ts sets no alias or
 * conditions). Everything else is the real `compilePdfCore` path.
 *
 * Task 25: the browser-side render seam (`renderPdfInBrowser`, passed by the
 * native backend) makes the first test pass. The second test keeps the
 * Task 24 reproduction as a guard: the default server renderer, which stays on
 * `renderToBuffer`, still rejects under the browser build.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-pdf/renderer", async () => {
  return await import("@react-pdf/renderer/lib/react-pdf.browser.js");
});

import { compilePdfCore } from "../../src/lib/models/compile-core";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  FIXED_DOCUMENT_SERVER_PAGE_TEXTS,
  fixedDocumentBody,
  writeFixedDocument,
} from "../helpers/compile-pdf-fixed-document";
import {
  renderPdfInBrowser,
  type PdfRenderer,
} from "../../src/lib/export/pdf-render";
import { checkPdfValidity, extractPdfPageTexts } from "../helpers/pdf-text";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function compileFixedWithBrowserBuild(
  render?: PdfRenderer,
): Promise<ArrayBuffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pdf-browser-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  await writeFixedDocument(path.join(dir, projectId));
  const prev = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return (await compilePdfCore(fixedDocumentBody(projectId), render))
      .arrayBuffer;
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = prev;
  }
}

describe("compilePdfCore with the @react-pdf/renderer browser build", () => {
  it("produces a PDF with the server-path text through the browser render seam", async () => {
    const pdf = await compileFixedWithBrowserBuild(renderPdfInBrowser);
    expect(await extractPdfPageTexts(pdf)).toEqual(
      FIXED_DOCUMENT_SERVER_PAGE_TEXTS,
    );
    expect((await checkPdfValidity(pdf)).valid).toBe(true);
  });

  it("the default (server) renderer still rejects under the browser build", async () => {
    await expect(compileFixedWithBrowserBuild()).rejects.toThrow(
      /Node specific API/,
    );
  });
});
