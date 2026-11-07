/**
 * Tests for the PDF text helper (Feature 101, Task 1): it must extract the text
 * of a PDF produced by `compilePdfCore`, tell two PDFs that differ by one letter
 * apart, and reject buffers that are not valid PDFs.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import { compilePdfCore } from "../../src/lib/models/compile-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { checkPdfValidity, extractPdfPageTexts } from "../helpers/pdf-text";

const RESOURCE_ID = "00000000-0000-4000-8000-000000000001";
const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function compileText(text: string): Promise<ArrayBuffer> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pdf-text-"));
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const dir = path.join(projectsDir, projectId, "resources", RESOURCE_ID);
  await fs.mkdir(dir, { recursive: true });
  const doc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
  await fs.writeFile(
    path.join(dir, "content.tiptap.json"),
    JSON.stringify(doc),
  );
  await fs.writeFile(path.join(dir, "content.txt"), text);
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    const result = await compilePdfCore({
      projectId,
      resourceIds: [RESOURCE_ID],
      resources: [{ id: RESOURCE_ID, name: "Chapter One", type: "text" }],
      includeHeaders: true,
      projectName: "Helper Check",
    });
    return result.arrayBuffer;
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

describe("pdf-text helper", () => {
  it("extracts the header and body text of a compilePdfCore PDF", async () => {
    const pdf = await compileText("The quick brown fox");
    const pages = await extractPdfPageTexts(pdf);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const joined = pages.join("\n");
    expect(joined).toContain("Chapter One");
    expect(joined).toContain("The quick brown fox");
  });

  it("extracts differently when one letter of the input changes (control)", async () => {
    const a = await extractPdfPageTexts(
      await compileText("The quick brown fox"),
    );
    const b = await extractPdfPageTexts(
      await compileText("The quick brown fax"),
    );
    expect(a).not.toEqual(b);
  });

  it("reports a compilePdfCore PDF as valid", async () => {
    const pdf = await compileText("valid please");
    expect(await checkPdfValidity(pdf)).toEqual({ valid: true });
  });

  it("rejects a buffer without the %PDF- header", async () => {
    const result = await checkPdfValidity(new TextEncoder().encode("hello"));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/header/);
  });

  it("rejects a truncated PDF with no %%EOF trailer", async () => {
    const pdf = new Uint8Array(await compileText("truncate me"));
    const result = await checkPdfValidity(pdf.subarray(0, pdf.length - 2048));
    expect(result.valid).toBe(false);
  });

  it("throws rather than returning empty when the buffer does not parse", async () => {
    await expect(
      extractPdfPageTexts(
        new TextEncoder().encode("%PDF-1.4\nnot a pdf\n%%EOF"),
      ),
    ).rejects.toThrow();
  });
});
