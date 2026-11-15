/**
 * Feature 116 Task 24: the optional citations option on the PDF and DOCX
 * compile requests and the dispatch seam in the compile cores.
 *
 * No engine is installed; these tests use a fake pass registered through the
 * seam. They are evidence about dispatch only, never about citation output.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as postPdf } from "../../app/api/compile/pdf/route";
import { POST as postDocx } from "../../app/api/compile/docx/route";
import {
  CitationsNotSupportedForFormatError,
  CitationsUnavailableError,
  compileDocxCore,
  compileMarkdownCore,
  compilePdfCore,
  compileTextCore,
  registerCitationsPass,
  type CompileCitationsPass,
} from "../../src/lib/models/compile-core";
import type { CompileBody } from "../../src/lib/export/types";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

const STYLE_ID = "chicago-notes-bibliography";
const tmpDirs: string[] = [];
let originalEnv: string | undefined;
let projectId: string;
let resourceId: string;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cite-opt-"));
  tmpDirs.push(dir);
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  projectId = generateUUID();
  resourceId = generateUUID();
  const resDir = path.join(dir, projectId, "resources", resourceId);
  await fs.mkdir(resDir, { recursive: true });
  await fs.writeFile(path.join(resDir, "content.txt"), "Hello world");
  await fs.writeFile(
    path.join(resDir, "content.tiptap.json"),
    JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    }),
  );
});

afterEach(async () => {
  registerCitationsPass(undefined);
  process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop();
    if (d) await removeDirRetry(d);
  }
});

function body(citations?: unknown): CompileBody {
  const b: Record<string, unknown> = {
    projectId,
    resourceIds: [resourceId],
    resources: [{ id: resourceId, name: "Ch", type: "text" }],
    includeHeaders: true,
    projectName: "Book",
  };
  if (citations !== undefined) b.citations = citations;
  return b as unknown as CompileBody;
}

function req(url: string, payload: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function fakePass(): ReturnType<typeof vi.fn<CompileCitationsPass>> {
  return vi.fn<CompileCitationsPass>(async () => ({
    arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
  }));
}

describe("absent option", () => {
  it("does not enter the seam for PDF or DOCX", async () => {
    const pass = fakePass();
    registerCitationsPass(pass);
    await compilePdfCore(body());
    await compileDocxCore(body());
    expect(pass).not.toHaveBeenCalled();
  });

  it("keeps the CompileBody fields and makes the option optional", () => {
    const b: CompileBody = {
      projectId,
      resourceIds: [],
      resources: [],
      includeHeaders: false,
      projectName: "x",
    };
    expect(b.citations).toBeUndefined();
  });
});

describe("present option, valid style", () => {
  it("passes the option to the seam for DOCX and PDF", async () => {
    const pass = fakePass();
    registerCitationsPass(pass);
    const docx = await compileDocxCore(body({ styleId: STYLE_ID }));
    const pdf = await compilePdfCore(body({ styleId: STYLE_ID }));
    expect(pass).toHaveBeenCalledTimes(2);
    expect(pass.mock.calls[0][0].format).toBe("docx");
    expect(pass.mock.calls[1][0].format).toBe("pdf");
    expect(pass.mock.calls[0][0].option).toEqual({ styleId: STYLE_ID });
    expect(docx.arrayBuffer.byteLength).toBe(3);
    expect(pdf.arrayBuffer.byteLength).toBe(3);
  });

  it("fails with a message naming citations when no pass is registered", async () => {
    await expect(
      compileDocxCore(body({ styleId: STYLE_ID })),
    ).rejects.toBeInstanceOf(CitationsUnavailableError);
    await expect(compilePdfCore(body({ styleId: STYLE_ID }))).rejects.toThrow(
      /citations are not available/i,
    );
  });
});

describe("routes refuse a bad option without echoing client input", () => {
  const bad: Array<[string, unknown]> = [
    ["a style id not in the bundled list", { styleId: "SECRET-STYLE" }],
    ["a client-supplied path", { styleId: "../../etc/SECRET-PATH" }],
    ["an unknown key", { styleId: STYLE_ID, SECRETKEY: "x" }],
    ["a path key", { styleId: STYLE_ID, path: "/SECRET" }],
    ["a non-object", "SECRET-STRING"],
    ["null", null],
    ["an array", [STYLE_ID]],
    ["a non-string style id", { styleId: 5 }],
  ];
  const routes = [
    ["pdf", postPdf, "/api/compile/pdf"],
    ["docx", postDocx, "/api/compile/docx"],
  ] as const;
  for (const [label, option] of bad) {
    for (const [name, post, url] of routes) {
      it(`${name}: ${label}`, async () => {
        const pass = fakePass();
        registerCitationsPass(pass);
        const res = await post(req(url, { ...body(), citations: option }));
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).not.toMatch(/SECRET/);
        expect(text.length).toBeGreaterThan(2);
        expect(pass).not.toHaveBeenCalled();
      });
    }
  }

  it("a valid option with no pass registered is refused visibly, no output", async () => {
    const res = await postDocx(
      req("/api/compile/docx", { ...body(), citations: { styleId: STYLE_ID } }),
    );
    expect(res.status).toBe(501);
    expect(await res.text()).toMatch(/citations are not available/i);
  });

  it("a valid option reaches the seam through the route", async () => {
    const pass = fakePass();
    registerCitationsPass(pass);
    const res = await postPdf(
      req("/api/compile/pdf", { ...body(), citations: { styleId: STYLE_ID } }),
    );
    expect(res.status).toBe(200);
    expect(pass).toHaveBeenCalledTimes(1);
  });
});

describe("Markdown and text refuse the option", () => {
  it("compileMarkdownCore and compileTextCore throw a visible message", async () => {
    const pass = fakePass();
    registerCitationsPass(pass);
    await expect(
      compileMarkdownCore(body({ styleId: STYLE_ID })),
    ).rejects.toBeInstanceOf(CitationsNotSupportedForFormatError);
    await expect(compileTextCore(body({ styleId: STYLE_ID }))).rejects.toThrow(
      /available for PDF and DOCX/,
    );
    expect(pass).not.toHaveBeenCalled();
  });
});
