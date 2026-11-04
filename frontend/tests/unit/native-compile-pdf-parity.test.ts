/**
 * Feature 101, Task 26 (FR-26, font-fallback half of FR-27): the PDF compiled
 * through the native backend (`createNativeCompileTransport`, which passes
 * `renderPdfInBrowser`) against the server path (`compilePdfCore` with
 * `renderToBuffer`) for the same input. Compares extracted content, not bytes.
 *
 * The native side runs in Node with `@react-pdf/renderer` replaced by the
 * package's browser build (`vi.doMock` plus `vi.resetModules`, so the server
 * path imported statically keeps the real build). This is a module mock, not a
 * device or WebView.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compilePdfCore } from "../../src/lib/models/compile-core";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  FsEncoding,
  createFakeCapacitorFilesystem,
} from "../../src/lib/models/capacitor-filesystem";
import type { CompileTransport } from "../../src/lib/api/compile";
import {
  FIXED_DOCUMENT_PROJECT_NAME,
  FIXED_DOCUMENT_RESOURCES,
  FIXED_DOCUMENT_SERVER_PAGE_TEXTS,
  fixedDocumentBody,
  writeFixedDocument,
} from "../helpers/compile-pdf-fixed-document";
import { checkPdfValidity, extractPdfPageTexts } from "../helpers/pdf-text";
import { removeDirRetry } from "./helpers/fs-utils";

const PROJECTS_DIR = "/projects";
const tmpDirs: string[] = [];

afterEach(async () => {
  vi.doUnmock("@react-pdf/renderer");
  vi.resetModules();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

/** Runs `fn` with `GETWRITE_PROJECTS_DIR` pointing at a temp dir holding the fixed document. */
async function withServerProject<T>(
  extra: (projectPath: string) => Promise<void>,
  fn: (projectId: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pdf-parity-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  await writeFixedDocument(path.join(dir, projectId));
  await extra(path.join(dir, projectId));
  const prev = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn(projectId);
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = prev;
  }
}

/** Writes the same resources as `writeFixedDocument` into a fake device filesystem. */
async function writeFixedDocumentToFake(
  fake: ReturnType<typeof createFakeCapacitorFilesystem>,
  projectId: string,
): Promise<void> {
  for (const r of FIXED_DOCUMENT_RESOURCES) {
    const base = `${PROJECTS_DIR}/${projectId}/resources/${r.id}`;
    const doc = {
      type: "doc",
      content: r.paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    };
    await fake.writeFile({
      path: `${base}/content.txt`,
      data: r.paragraphs.join("\n"),
      encoding: FsEncoding.UTF8,
      recursive: true,
    });
    await fake.writeFile({
      path: `${base}/content.tiptap.json`,
      data: JSON.stringify(doc),
      encoding: FsEncoding.UTF8,
      recursive: true,
    });
  }
}

/**
 * Loads the native compile transport with `@react-pdf/renderer` mocked to its
 * browser build. With `failFontRegistration`, `Font.register` throws a
 * font-loading error, the condition `isFontError` classifies as a fallback.
 */
async function loadNativeTransport(
  failFontRegistration: boolean,
): Promise<CompileTransport> {
  vi.resetModules();
  vi.doMock("@react-pdf/renderer", async () => {
    const browser =
      await import("@react-pdf/renderer/lib/react-pdf.browser.js");
    if (!failFontRegistration) return browser;
    return {
      ...browser,
      Font: {
        register: () => {
          throw new Error("Failed to fetch font");
        },
      },
    };
  });
  const { createNativeCompileTransport } =
    await import("../../src/store/transport/native-compile-backend");
  const fake = createFakeCapacitorFilesystem();
  const projectId = generateUUID();
  await writeFixedDocumentToFake(fake, projectId);
  const transport = createNativeCompileTransport({
    fs: fake,
    projectsDir: PROJECTS_DIR,
  });
  const body = fixedDocumentBody(projectId);
  return { ...transport, pdf: () => transport.pdf(body) };
}

describe("native PDF path against the server path (FR-26)", () => {
  it("is a valid PDF with the selected resources in order, headers and text", async () => {
    const native = await loadNativeTransport(false);
    const { arrayBuffer, filename, warning } = await native.pdf(
      fixedDocumentBody("ignored"),
    );

    const bytes = Buffer.from(arrayBuffer);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect((await checkPdfValidity(arrayBuffer)).valid).toBe(true);
    expect(filename).toBe("fixed-document.pdf");
    expect(warning).toBeUndefined();

    const text = (await extractPdfPageTexts(arrayBuffer)).join("\n");
    const order = [
      "Chapter One",
      "The lighthouse keeper counted the ships at dusk.",
      "Seven passed, none stopped.",
      "Chapter Two",
      "Morning brought fog and a single bell.",
    ].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("extracted text equals the server path's for the same input", async () => {
    const serverPages = await withServerProject(
      async () => {},
      async (projectId) => {
        const result = await compilePdfCore(fixedDocumentBody(projectId));
        return extractPdfPageTexts(result.arrayBuffer);
      },
    );
    expect(serverPages).toEqual(FIXED_DOCUMENT_SERVER_PAGE_TEXTS);

    const native = await loadNativeTransport(false);
    const nativePages = await extractPdfPageTexts(
      (await native.pdf(fixedDocumentBody("ignored"))).arrayBuffer,
    );
    expect(nativePages).toEqual(serverPages);
  });

  it("leaves out an unselected resource and keeps the selected order", async () => {
    vi.resetModules();
    vi.doMock("@react-pdf/renderer", async () => {
      return await import("@react-pdf/renderer/lib/react-pdf.browser.js");
    });
    const { createNativeCompileTransport } =
      await import("../../src/store/transport/native-compile-backend");
    const fake = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    await writeFixedDocumentToFake(fake, projectId);
    const extraId = "00000000-0000-4000-8000-0000000000a3";
    await fake.writeFile({
      path: `${PROJECTS_DIR}/${projectId}/resources/${extraId}/content.txt`,
      data: "Unselected words.",
      encoding: FsEncoding.UTF8,
      recursive: true,
    });
    const transport = createNativeCompileTransport({
      fs: fake,
      projectsDir: PROJECTS_DIR,
    });
    const body = fixedDocumentBody(projectId);
    const { arrayBuffer } = await transport.pdf(body);
    const text = (await extractPdfPageTexts(arrayBuffer)).join("\n");
    expect(text).not.toContain("Unselected words.");
    expect(text.indexOf("Chapter One")).toBeLessThan(
      text.indexOf("Chapter Two"),
    );
  });
});

describe("font fallback (FR-27, font-fallback half)", () => {
  it("server path: a font error gives a valid PDF and the font-fallback warning", async () => {
    const { Font } = await import("@react-pdf/renderer");
    const spy = vi.spyOn(Font, "register").mockImplementation(() => {
      throw new Error("Failed to fetch font");
    });
    try {
      await withServerProject(
        async () => {},
        async (projectId) => {
          const result = await compilePdfCore(fixedDocumentBody(projectId));
          expect(result.warning).toBe("font-fallback");
          expect((await checkPdfValidity(result.arrayBuffer)).valid).toBe(true);
          const text = (await extractPdfPageTexts(result.arrayBuffer)).join(
            "\n",
          );
          expect(text).toContain("Chapter One");
          expect(text).toContain("Morning brought fog and a single bell.");
        },
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("native path: the same font error surfaces as the font-fallback warning and the writer is told", async () => {
    const native = await loadNativeTransport(true);
    const result = await native.pdf(fixedDocumentBody("ignored"));
    expect(result.warning).toBe("font-fallback");
    expect((await checkPdfValidity(result.arrayBuffer)).valid).toBe(true);
    expect(
      (await extractPdfPageTexts(result.arrayBuffer)).join("\n"),
    ).toContain("Chapter One");

    // The writer-facing step: runCompileAndDownload shows the toast on this warning.
    const toastInfo = vi.fn();
    vi.resetModules();
    vi.doMock("../../src/lib/api/compile", () => ({
      compilePdf: async () => result,
      compileDocx: vi.fn(),
      compileText: vi.fn(),
      compileMarkdown: vi.fn(),
    }));
    vi.doMock("../../src/lib/toast-service", () => ({
      toastService: { info: toastInfo, error: vi.fn(), success: vi.fn() },
    }));
    vi.doMock("../../src/lib/compile/download-file", () => ({
      downloadFile: async () => ({ kind: "downloaded" }),
    }));
    const { runCompileAndDownload } =
      await import("../../src/lib/compile/run-compile-and-download");
    await runCompileAndDownload(fixedDocumentBody("ignored"), {
      format: "pdf",
      compilationName: FIXED_DOCUMENT_PROJECT_NAME,
    });
    expect(toastInfo).toHaveBeenCalledWith(
      "PDF compiled with fallback fonts — IBM Plex fonts were unreachable",
    );
    vi.doUnmock("../../src/lib/api/compile");
    vi.doUnmock("../../src/lib/toast-service");
    vi.doUnmock("../../src/lib/compile/download-file");
  });
});
