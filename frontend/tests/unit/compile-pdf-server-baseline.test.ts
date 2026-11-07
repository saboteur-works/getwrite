/**
 * Feature 101, Task 24: baseline of the unchanged server PDF path
 * (`compilePdfCore` -> `renderToBuffer`) for the fixed document.
 * Task 25 must keep this equal.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { compilePdfCore } from "../../src/lib/models/compile-core";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  FIXED_DOCUMENT_SERVER_PAGE_TEXTS,
  fixedDocumentBody,
  writeFixedDocument,
} from "../helpers/compile-pdf-fixed-document";
import { checkPdfValidity, extractPdfPageTexts } from "../helpers/pdf-text";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

describe("server PDF path baseline", () => {
  it("extracts the fixed document text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pdf-base-"));
    tmpDirs.push(dir);
    const projectId = generateUUID();
    await writeFixedDocument(path.join(dir, projectId));
    const prev = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = dir;
    try {
      const result = await compilePdfCore(fixedDocumentBody(projectId));
      expect((await checkPdfValidity(result.arrayBuffer)).valid).toBe(true);
      const pages = await extractPdfPageTexts(result.arrayBuffer);
      expect(pages).toEqual(FIXED_DOCUMENT_SERVER_PAGE_TEXTS);
      expect(result.warning).toBeUndefined();
    } finally {
      process.env.GETWRITE_PROJECTS_DIR = prev;
    }
  });
});
