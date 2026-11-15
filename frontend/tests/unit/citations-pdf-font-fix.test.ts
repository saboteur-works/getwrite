/**
 * Feature 116, Task 61 (fix): `compilePdfCore` renders text containing `"`,
 * `:` and `;` with the bundled IBM Plex faces, and the glyphs draw.
 *
 * "Draw" is checked on the output PDF: each embedded TrueType font subset is
 * read with fontkit (reached through `@react-pdf/renderer`, as in Tasks 58 and
 * 60; no dependency is added), and the outline of each probed character in
 * the subset must equal the outline of the same character in the source
 * `.woff` face. The subset's glyph ids are found through the PDF's own
 * `ToUnicode` map. Results are recorded in
 * `specs/features/citations-at-compile/experiments/task-61.md`.
 */
// @vitest-environment node
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

import type { CompileBody } from "../../src/lib/export/types";
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

const RESOURCE_ID = "00000000-0000-4000-8000-0000000000c1";
/** Text of the resource name (section header, Sans bold) and of the body (Serif regular). */
const HEADER = 'Said "Hi": one; two';
const BODY = 'He said "hello": one; two; three and left.';
const PROBE_CHARS = ['"', ":", ";", "a", "e", "o", "n"] as const;

interface FontkitGlyph {
  id: number;
  path: { toSVG(): string };
}
interface FontkitFont {
  postscriptName: string;
  layout(text: string): { glyphs: FontkitGlyph[] };
  getGlyph(id: number): FontkitGlyph;
}
interface FontkitModule {
  create(buf: Buffer): FontkitFont;
}

/** fontkit as `@react-pdf/font` resolves it; no direct dependency is added. */
function loadFontkit(): FontkitModule {
  const viaRenderer = createRequire(
    createRequire(import.meta.url).resolve("@react-pdf/renderer"),
  );
  const viaFont = createRequire(viaRenderer.resolve("@react-pdf/font"));
  return viaFont("fontkit") as FontkitModule;
}

const FONTSOURCE = path.resolve(__dirname, "../../node_modules/@fontsource");
const FACES = [
  ["ibm-plex-serif", "ibm-plex-serif-latin-400-normal"],
  ["ibm-plex-serif", "ibm-plex-serif-latin-400-italic"],
  ["ibm-plex-sans", "ibm-plex-sans-latin-400-normal"],
  ["ibm-plex-sans", "ibm-plex-sans-latin-700-normal"],
] as const;

function woffPath(pkg: string, base: string): string {
  return path.join(FONTSOURCE, pkg, "files", `${base}.woff`);
}

async function compileSample(): Promise<ArrayBuffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pdf-fix-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  const resDir = path.join(dir, projectId, "resources", RESOURCE_ID);
  await fs.mkdir(resDir, { recursive: true });
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: BODY }] }],
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
  try {
    const result = await compilePdfCore({
      projectId,
      resourceIds: [RESOURCE_ID],
      resources: [{ id: RESOURCE_ID, name: HEADER, type: "text" }],
      includeHeaders: true,
      projectName: "Font Fix",
    } as CompileBody);
    expect(result.warning).toBeUndefined();
    return result.arrayBuffer;
  } finally {
    if (prev === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prev;
  }
}

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

/** Every `N 0 obj` of the PDF with its dictionary text and inflated stream. */
function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const re = /(\d+) 0 obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const streamAt = text.indexOf("stream", bodyStart);
    const endObj = text.indexOf("endobj", bodyStart);
    if (streamAt === -1 || (endObj !== -1 && endObj < streamAt)) {
      objects.set(id, { dict: text.slice(bodyStart, endObj), stream: null });
      continue;
    }
    const dict = text.slice(bodyStart, streamAt);
    const dataStart = text[streamAt + 6] === "\r" ? streamAt + 8 : streamAt + 7;
    const dataEnd = text.indexOf("endstream", dataStart);
    const raw = pdf.subarray(dataStart, dataEnd);
    const stream = dict.includes("/FlateDecode") ? zlib.inflateSync(raw) : raw;
    objects.set(id, { dict, stream });
    re.lastIndex = dataEnd;
  }
  return objects;
}

function refOf(dict: string, key: RegExp): number {
  const m = key.exec(dict);
  if (!m) throw new Error(`no ${key} reference in ${dict.slice(0, 200)}`);
  return Number(m[1]);
}

/** char -> gid, from the `bfchar` entries of a ToUnicode CMap. */
function parseToUnicode(cmap: string): Map<string, number> {
  const byChar = new Map<string, number>();
  for (const m of cmap.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4})>/g)) {
    const gid = parseInt(m[1], 16);
    const ch = String.fromCharCode(parseInt(m[2], 16));
    if (!byChar.has(ch)) byChar.set(ch, gid);
  }
  return byChar;
}

interface EmbeddedFace {
  baseFont: string;
  font: FontkitFont;
  gidByChar: Map<string, number>;
}

function embeddedFaces(pdf: Buffer): EmbeddedFace[] {
  const fontkit = loadFontkit();
  const objects = parseObjects(pdf);
  const faces: EmbeddedFace[] = [];
  for (const { dict } of objects.values()) {
    if (!dict.includes("/Type0") || !dict.includes("/ToUnicode")) continue;
    const descendant = objects.get(
      refOf(dict, /\/DescendantFonts\s*\[\s*(\d+) 0 R/),
    );
    const toUnicode = objects.get(refOf(dict, /\/ToUnicode\s+(\d+) 0 R/));
    if (!descendant || !toUnicode?.stream) continue;
    const descriptor = objects.get(
      refOf(descendant.dict, /\/FontDescriptor\s+(\d+) 0 R/),
    );
    const file = descriptor
      ? objects.get(refOf(descriptor.dict, /\/FontFile2\s+(\d+) 0 R/))
      : undefined;
    if (!file?.stream) continue;
    faces.push({
      baseFont: /\/BaseFont\s*\/(\S+)/.exec(dict)?.[1] ?? "",
      font: fontkit.create(file.stream),
      gidByChar: parseToUnicode(toUnicode.stream.toString("latin1")),
    });
  }
  return faces;
}

describe("Task 61: compilePdfCore with bundled IBM Plex and quote, colon, semicolon", () => {
  it("renders a valid PDF with no font-fallback warning", async () => {
    const pdf = await compileSample();
    expect((await checkPdfValidity(pdf)).valid).toBe(true);
  });

  it("embeds glyph outlines equal to the source .woff faces for the probed characters", async () => {
    const pdf = Buffer.from(await compileSample());
    const fontkit = loadFontkit();
    const sources = FACES.map(([pkg, base]) => ({
      base,
      font: fontkit.create(fsSync.readFileSync(woffPath(pkg, base))),
    }));
    const faces = embeddedFaces(pdf);
    console.info(
      `PROBE embedded fonts: ${faces.map((f) => f.baseFont).join(" ")}`,
    );
    const compared: string[] = [];
    for (const face of faces) {
      const source = sources.find((s) =>
        face.baseFont.endsWith(s.font.postscriptName),
      );
      if (!source) continue;
      for (const ch of PROBE_CHARS) {
        const gid = face.gidByChar.get(ch);
        if (gid === undefined) continue;
        const embedded = face.font.getGlyph(gid).path.toSVG();
        const original = source.font.layout(ch).glyphs[0].path.toSVG();
        expect(embedded.length, `${source.base} ${ch}`).toBeGreaterThan(0);
        expect(embedded, `${source.base} ${ch}`).toBe(original);
        compared.push(`${source.base}[${ch}]`);
      }
    }
    console.info(`PROBE compared outlines: ${compared.join(" ")}`);
    const bases = new Set(compared.map((c) => c.split("[")[0]));
    expect(bases.has("ibm-plex-serif-latin-400-normal")).toBe(true);
    expect(bases.has("ibm-plex-sans-latin-700-normal")).toBe(true);
    for (const base of bases) {
      for (const ch of ['"', ":", ";"]) {
        expect(compared, `${base} ${ch}`).toContain(`${base}[${ch}]`);
      }
    }
  });
});
