/**
 * Feature 116, Task 58 (experiment): does `compilePdfCore` with the bundled
 * IBM Plex faces throw a fontkit `RangeError` when body text has `"`, `:` or
 * `;` between letters? The outcomes are logged with `PROBE` and recorded in
 * `specs/features/citations-at-compile/experiments/task-58.md`. No fix here.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React from "react";
import { createRequire } from "node:module";
import {
  Document,
  Font,
  Page,
  Text,
  type DocumentProps,
} from "@react-pdf/renderer";
import { afterEach, describe, expect, it } from "vitest";

import type { CompileBody } from "../../src/lib/export/types";
import {
  CompilePDFDocument,
  registerIBMPlexFonts,
} from "../../src/lib/export/CompilePDFDocument";
import { CompilePDFFallbackDocument } from "../../src/lib/export/CompilePDFFallbackDocument";
import { renderPdfOnServer } from "../../src/lib/export/pdf-render";
import { compilePdfCore } from "../../src/lib/models/compile-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { checkPdfValidity } from "../helpers/pdf-text";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

const RESOURCE_ID = "00000000-0000-4000-8000-0000000000b1";

/** Message of a thrown value, with its constructor name when it is an Error. */
function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** Mirror of the unexported `isFontError` in compile-core.ts (same regex). */
function matchesIsFontError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /font|fetch|404|network/i.test(msg);
}

function probe(label: string, value: unknown): void {
  console.info(`PROBE ${label}: ${String(value)}`);
}

/** Writes one text resource with `text` as its single paragraph; returns the body. */
async function setupProject(
  text: string,
): Promise<{ body: CompileBody; restore: () => void }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pdf-font-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  const resDir = path.join(dir, projectId, "resources", RESOURCE_ID);
  await fs.mkdir(resDir, { recursive: true });
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
  await fs.writeFile(
    path.join(resDir, "content.tiptap.json"),
    JSON.stringify(doc),
  );
  await fs.writeFile(
    path.join(resDir, "content.txt"),
    tiptapToPlainText(doc as Parameters<typeof tiptapToPlainText>[0]),
  );
  const prev = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  return {
    body: {
      projectId,
      resourceIds: [RESOURCE_ID],
      resources: [{ id: RESOURCE_ID, name: "Chapter", type: "text" }],
      includeHeaders: true,
      projectName: "Font Probe",
    } as CompileBody,
    restore: () => {
      if (prev === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
      else process.env.GETWRITE_PROJECTS_DIR = prev;
    },
  };
}

type Outcome = { ok: true; warning?: string } | { ok: false; error: unknown };

async function viaCompilePdfCore(text: string): Promise<Outcome> {
  const { body, restore } = await setupProject(text);
  try {
    const result = await compilePdfCore(body);
    const isValid = (await checkPdfValidity(result.arrayBuffer)).valid;
    if (!isValid) return { ok: false, error: new Error("invalid PDF") };
    return { ok: true, warning: result.warning };
  } catch (error) {
    return { ok: false, error };
  } finally {
    restore();
  }
}

const sections = (text: string) => [{ name: "Chapter", content: text }];

async function renderHelvetica(text: string): Promise<Outcome> {
  try {
    await renderPdfOnServer(
      React.createElement(CompilePDFFallbackDocument, {
        sections: sections(text),
        includeHeaders: true,
      }) as React.ReactElement<DocumentProps>,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function renderPlex(text: string): Promise<Outcome> {
  try {
    await renderPdfOnServer(
      React.createElement(CompilePDFDocument, {
        sections: sections(text),
        includeHeaders: true,
      }) as React.ReactElement<DocumentProps>,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

const FONTSOURCE = path.resolve(__dirname, "../../node_modules/@fontsource");
const FACES = [
  ["ibm-plex-serif", "ibm-plex-serif-latin-400-normal"],
  ["ibm-plex-serif", "ibm-plex-serif-latin-400-italic"],
  ["ibm-plex-sans", "ibm-plex-sans-latin-400-normal"],
  ["ibm-plex-sans", "ibm-plex-sans-latin-700-normal"],
] as const;

function facePath(pkg: string, base: string, ext: string): string {
  return path.join(FONTSOURCE, pkg, "files", `${base}.${ext}`);
}

/**
 * Registers the Serif regular and italic faces from `ext` files under a
 * family name of its own (`Font.clear` would also drop the built-in
 * Helvetica every default style needs), and renders a bare document with it.
 */
async function renderBareFrom(
  ext: "woff" | "woff2" | "ttf",
  text: string,
): Promise<Outcome> {
  const family = `Probe Serif ${ext}`;
  Font.register({
    family,
    fonts: [
      {
        src: facePath(FACES[0][0], FACES[0][1], ext),
        fontWeight: 400,
        fontStyle: "normal",
      },
    ],
  });
  try {
    await renderPdfOnServer(
      React.createElement(
        Document,
        null,
        React.createElement(
          Page,
          { size: "A4" },
          React.createElement(Text, { style: { fontFamily: family } }, text),
        ),
      ) as React.ReactElement<DocumentProps>,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function fileExists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

interface FontkitGlyph {
  id: number;
}
interface FontkitSubset {
  includeGlyph(g: FontkitGlyph): number;
  encode(): unknown;
}
interface FontkitFont {
  layout(text: string): { glyphs: FontkitGlyph[] };
  createSubset(): FontkitSubset;
}
interface FontkitModule {
  create(buf: Buffer): FontkitFont;
}

/** fontkit as `@react-pdf/font` resolves it; no direct dependency is added. */
function loadFontkit(): FontkitModule | null {
  try {
    const viaRenderer = createRequire(
      createRequire(import.meta.url).resolve("@react-pdf/renderer"),
    );
    const viaFont = createRequire(viaRenderer.resolve("@react-pdf/font"));
    return viaFont("fontkit") as FontkitModule;
  } catch {
    return null;
  }
}

/** ASCII punctuation, each placed between two letters. */
const PUNCT = Array.from("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

const INPUTS: Record<string, string> = {
  quote: 'He said"hello"and left.',
  colon: "Note:this is a colon between letters.",
  semicolon: "One;two;three between letters.",
  all: 'He said"hello": one;two and left.',
  spaced: 'He said "hello": one; two and left.',
  plain: "No special characters at all here.",
};

describe("Task 58: compilePdfCore with bundled IBM Plex and quote, colon, semicolon", () => {
  for (const [name, text] of Object.entries(INPUTS)) {
    it(`compilePdfCore input "${name}"`, async () => {
      const r = await viaCompilePdfCore(text);
      if (r.ok) {
        probe(
          `compilePdfCore[${name}]`,
          `rendered; warning=${r.warning ?? "none"}`,
        );
      } else {
        probe(
          `compilePdfCore[${name}]`,
          `threw ${describeError(r.error)}; matchesIsFontError=${matchesIsFontError(r.error)}`,
        );
      }
      // Observed (2026-11-15): every input with `"`, `:` or `;` throws and
      // matches no font-error fallback; the plain input renders.
      if (name === "plain") {
        expect(r).toEqual({ ok: true, warning: undefined });
      } else {
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(describeError(r.error)).toBe(
            "RangeError: Offset is outside the bounds of the DataView",
          );
          expect(matchesIsFontError(r.error)).toBe(false);
        }
      }
    });
  }

  it("logs the top of the stack of the thrown error", async () => {
    const r = await viaCompilePdfCore(INPUTS.all);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error instanceof Error) {
      probe("stack", (r.error.stack ?? "").split("\n").slice(0, 8).join(" | "));
    }
  });

  it("renders every input with Helvetica (fallback document)", async () => {
    for (const [name, text] of Object.entries(INPUTS)) {
      const r = await renderHelvetica(text);
      probe(`helvetica[${name}]`, r.ok ? "rendered" : describeError(r.error));
      expect(r.ok).toBe(true);
    }
  });
});

describe("Task 58: which characters trigger it (direct render, bundled woff2)", () => {
  it("renders each ASCII punctuation character between letters", async () => {
    registerIBMPlexFonts();
    const failing: string[] = [];
    const messages = new Set<string>();
    for (const ch of PUNCT) {
      const r = await renderPlex(`ab${ch}cd`);
      if (!r.ok) {
        failing.push(ch);
        messages.add(describeError(r.error));
      }
    }
    probe("woff2 failing chars", JSON.stringify(failing));
    probe("woff2 failing messages", JSON.stringify([...messages]));
    expect(failing).toEqual(['"', ":", ";"]);
    const lone = await renderPlex("abcd");
    expect(lone.ok).toBe(true);
    const bare = await renderPlex('"');
    probe(
      "woff2 text is only a quote",
      bare.ok ? "rendered" : describeError(bare.error),
    );
  });
});

describe("Task 58: does it depend on the .woff2 faces", () => {
  const SAMPLE = 'He said"hello": one;two and left.';

  it("renders the sample from woff2, woff and ttf files (same fontsource packages)", async () => {
    for (const ext of ["woff2", "woff", "ttf"] as const) {
      const present = await Promise.all(
        FACES.map(([pkg, base]) => fileExists(facePath(pkg, base, ext))),
      );
      if (!present.every(Boolean)) {
        probe(`faces[${ext}]`, "absent from node_modules; comparison not run");
        continue;
      }
      const r = await renderBareFrom(ext, SAMPLE);
      probe(`bareRender[${ext}]`, r.ok ? "rendered" : describeError(r.error));
      const ctl = await renderBareFrom(ext, "abcd efgh");
      probe(
        `bareRenderControl[${ext}]`,
        ctl.ok ? "rendered" : describeError(ctl.error),
      );
      expect(ctl.ok).toBe(true);
      expect(r.ok).toBe(ext === "woff");
    }
  });

  it("subsets glyphs with fontkit directly for each present face", async () => {
    const fontkit = loadFontkit();
    if (!fontkit) {
      probe("fontkit", "does not resolve; subsetting not run");
      return;
    }
    probe("fontkit", "resolved via @react-pdf/renderer -> @react-pdf/font");
    for (const ext of ["woff2", "woff"] as const) {
      for (const [pkg, base] of FACES) {
        const file = facePath(pkg, base, ext);
        if (!(await fileExists(file))) continue;
        const font = fontkit.create(await fs.readFile(file));
        for (const text of ["abcd", 'ab"cd', "ab:cd", "ab;cd"]) {
          try {
            const subset = font.createSubset();
            for (const g of font.layout(text).glyphs) subset.includeGlyph(g);
            subset.encode();
            probe(`fontkit[${ext}][${base}][${text}]`, "encoded");
            expect(ext === "woff" || text === "abcd").toBe(true);
          } catch (error) {
            probe(`fontkit[${ext}][${base}][${text}]`, describeError(error));
            expect(ext).toBe("woff2");
            expect(text).not.toBe("abcd");
          }
        }
      }
    }
  });
});
