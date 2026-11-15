/**
 * Feature 116, Task 60 (experiment): why does fontkit's subset `encode` throw
 * `RangeError: Offset is outside the bounds of the DataView` for `"`, `:` and
 * `;` from the bundled `.woff2` IBM Plex faces and not from the `.woff` faces?
 *
 * Part (a) reads the `glyf` glyph object and the `loca` offsets fontkit
 * computes at the `_addGlyph` site (fontkit/dist/module.mjs:12177), from the
 * `.woff2` and the `.woff` of each face. Part (b) decodes each `.woff2` to
 * TrueType with fontTools (Python, not fontkit), if a Python is named by
 * `GETWRITE_FONTTOOLS_PYTHON`, and subsets that with fontkit. Outcomes are logged with `PROBE` and
 * recorded in `specs/features/citations-at-compile/experiments/task-60.md`.
 * No fix here; no dependency is added (fontkit is reached as in Task 58).
 */
// @vitest-environment node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

function probe(label: string, value: unknown): void {
  console.info(`PROBE ${label}: ${String(value)}`);
}

interface GlyfComponent {
  glyphID: number;
  pos: number;
}
interface GlyfObject {
  numberOfContours: number;
  components?: GlyfComponent[];
}
interface FontkitGlyph {
  id: number;
  _decode(): GlyfObject | null;
  path: { toSVG(): string };
}
interface TableStream {
  pos: number;
  length: number;
  readBuffer(n: number): Uint8Array;
}
interface DirectoryEntry {
  offset: number;
  length: number;
  transformed?: boolean;
  transformLength?: number;
}
interface FontkitSubset {
  includeGlyph(g: FontkitGlyph): number;
  encode(): unknown;
}
interface FontkitFont {
  numGlyphs: number;
  loca: { version: number; offsets: number[] };
  directory: { tables: Record<string, DirectoryEntry> };
  layout(text: string): { glyphs: FontkitGlyph[] };
  getGlyph(id: number): FontkitGlyph;
  createSubset(): FontkitSubset;
  _getTableStream(tag: string): TableStream;
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

const FRONTEND = path.resolve(__dirname, "../..");
const FONTSOURCE = path.join(FRONTEND, "node_modules/@fontsource");
const FACES = [
  ["ibm-plex-serif", "ibm-plex-serif-latin-400-normal"],
  ["ibm-plex-serif", "ibm-plex-serif-latin-400-italic"],
  ["ibm-plex-sans", "ibm-plex-sans-latin-400-normal"],
  ["ibm-plex-sans", "ibm-plex-sans-latin-700-normal"],
] as const;
const CHARS = ['"', ":", ";", "a"] as const;
/** Glyph sets of Task 58's subset test. */
const TEXTS = ["abcd", 'ab"cd', "ab:cd", "ab;cd"] as const;

function facePath(pkg: string, base: string, ext: string): string {
  return path.join(FONTSOURCE, pkg, "files", `${base}.${ext}`);
}

const fontkit = loadFontkit();

function open(pkg: string, base: string, ext: "woff2" | "woff"): FontkitFont {
  return fontkit.create(fsSync.readFileSync(facePath(pkg, base, ext)));
}

/** The glyf object and loca values `_addGlyph` reads for glyph `gid`. */
interface AddGlyphView {
  gid: number;
  kind: "composite" | "simple" | "none";
  numberOfContours: number | null;
  components: string;
  cur: number;
  next: number;
  length: number;
  bufferLength: number;
  componentPatchInBounds: boolean | null;
}

/** Mirrors lines 12177-12190 of fontkit/dist/module.mjs without writing. */
function viewAddGlyph(font: FontkitFont, gid: number): AddGlyphView {
  const glyf = font.getGlyph(gid)._decode();
  const cur = font.loca.offsets[gid];
  const next = font.loca.offsets[gid + 1];
  const stream = font._getTableStream("glyf");
  stream.pos += cur;
  const bufferLength = stream.readBuffer(next - cur).length;
  const isComposite = glyf !== null && glyf.numberOfContours < 0;
  const comps = isComposite ? (glyf.components ?? []) : [];
  return {
    gid,
    kind: glyf === null ? "none" : isComposite ? "composite" : "simple",
    numberOfContours: glyf === null ? null : glyf.numberOfContours,
    components: comps.map((c) => `${c.glyphID}@${c.pos}`).join(","),
    cur,
    next,
    length: next - cur,
    bufferLength,
    componentPatchInBounds: isComposite
      ? comps.every((c) => c.pos + 2 <= bufferLength)
      : null,
  };
}

function gidOf(font: FontkitFont, ch: string): number {
  return font.layout(ch).glyphs[0].id;
}

function describeView(v: AddGlyphView): string {
  return (
    `gid=${v.gid} ${v.kind} numberOfContours=${v.numberOfContours} ` +
    `components=[${v.components}] loca[gid]=${v.cur} loca[gid+1]=${v.next} ` +
    `loca length=${v.length} readBuffer length=${v.bufferLength} ` +
    `componentPatchInBounds=${v.componentPatchInBounds}`
  );
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function sha(buf: Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

function tableBytes(font: FontkitFont, tag: string): Buffer {
  const stream = font._getTableStream(tag);
  return Buffer.from(stream.readBuffer(font.directory.tables[tag].length));
}

function subsetOutcome(font: FontkitFont, text: string): string {
  try {
    const subset = font.createSubset();
    for (const g of font.layout(text).glyphs) subset.includeGlyph(g);
    subset.encode();
    return "encoded";
  } catch (error) {
    return describeError(error);
  }
}

describe("Task 60 (a): glyf glyph object and loca at the _addGlyph site, woff2 against woff", () => {
  for (const [pkg, base] of FACES) {
    it(`reads ${base}`, () => {
      const w2 = open(pkg, base, "woff2");
      const w1 = open(pkg, base, "woff");
      for (const ch of CHARS) {
        const g2 = gidOf(w2, ch);
        const g1 = gidOf(w1, ch);
        expect(g2).toBe(g1);
        const v2 = viewAddGlyph(w2, g2);
        const v1 = viewAddGlyph(w1, g1);
        probe(`addGlyph[woff2][${base}][${ch}]`, describeView(v2));
        probe(`addGlyph[woff][${base}][${ch}]`, describeView(v1));
        // Same glyph object (type, contours, components) from both formats.
        expect(v2.kind).toBe(v1.kind);
        expect(v2.numberOfContours).toBe(v1.numberOfContours);
        expect(v2.components.split("@").length).toBe(
          v1.components.split("@").length,
        );
        expect(v2.components.replace(/@\d+/g, "")).toBe(
          v1.components.replace(/@\d+/g, ""),
        );
        // The woff loca slice is the glyph's own bytes; for the woff2 the
        // loca offsets fontkit reads do not give a forward slice.
        expect(v1.length).toBeGreaterThanOrEqual(0);
        expect(v1.length).toBe(v1.bufferLength);
        if (ch === "a") {
          expect(v1.kind).toBe("simple");
          // No throw for a simple glyph, but the slice length differs from the woff's.
          expect(v2.bufferLength).not.toBe(v1.bufferLength);
        } else {
          expect(v1.kind).toBe("composite");
          expect(v1.componentPatchInBounds).toBe(true);
          expect(v2.componentPatchInBounds).toBe(false);
        }
      }
    });

    it(`compares whole loca and glyf tables for ${base}`, () => {
      const w2 = open(pkg, base, "woff2");
      const w1 = open(pkg, base, "woff");
      const o2 = w2.loca.offsets;
      const o1 = w1.loca.offsets;
      let differing = 0;
      let backwards = 0;
      for (let i = 0; i < o2.length; i++) {
        if (o2[i] !== o1[i]) differing++;
        if (i > 0 && o2[i] < o2[i - 1]) backwards++;
      }
      let woffBackwards = 0;
      for (let i = 1; i < o1.length; i++)
        if (o1[i] < o1[i - 1]) woffBackwards++;
      probe(
        `loca[${base}]`,
        `numGlyphs woff2=${w2.numGlyphs} woff=${w1.numGlyphs}; offsets length woff2=${o2.length} woff=${o1.length}; ` +
          `indexToLocFormat woff2=${w2.loca.version} woff=${w1.loca.version}; last offset woff2=${o2[o2.length - 1]} woff=${o1[o1.length - 1]}; ` +
          `entries differing=${differing}; backwards steps woff2=${backwards} woff=${woffBackwards}`,
      );
      const d2 = w2.directory.tables;
      const d1 = w1.directory.tables;
      probe(
        `directory[${base}]`,
        `woff2 glyf{length=${d2.glyf.length}, transformed=${d2.glyf.transformed}, transformLength=${d2.glyf.transformLength}, offset=${d2.glyf.offset}} ` +
          `woff2 loca{length=${d2.loca.length}, transformed=${d2.loca.transformed}, transformLength=${d2.loca.transformLength}, offset=${d2.loca.offset}} ` +
          `woff glyf{length=${d1.glyf.length}} woff loca{length=${d1.loca.length}}`,
      );
      const s2 = w2._getTableStream("glyf");
      const s1 = w1._getTableStream("glyf");
      probe(
        `glyfStream[${base}]`,
        `woff2 stream length=${s2.length} pos=${s2.pos}; woff stream length=${s1.length} pos=${s1.pos}; ` +
          `woff glyf table sha=${sha(tableBytes(w1, "glyf"))} woff loca table sha=${sha(tableBytes(w1, "loca"))}`,
      );
      expect(o2.length).toBe(o1.length);
      expect(woffBackwards).toBe(0);
      expect(backwards).toBeGreaterThan(0);
      expect(differing).toBeGreaterThan(0);
      expect(d2.glyf.transformed).toBe(true);
      expect(d2.loca.transformed).toBe(true);
    });
  }
});

/** Decoders looked for (b); each probe line is what was searched and where. */
function which(cmd: string): string {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "not found";
}

function listDir(dir: string): string[] {
  try {
    return fsSync.readdirSync(dir);
  } catch {
    return [];
  }
}

const DECODER_NAME = /woff2|wawoff|fonteditor|ttf2|fontverter|opentype|brotli/i;

/**
 * The one Python interpreter to try, named by the opt-in environment variable
 * `GETWRITE_FONTTOOLS_PYTHON`. Nothing else is searched.
 */
function pythonCandidates(): string[] {
  const named = process.env.GETWRITE_FONTTOOLS_PYTHON;
  if (named === undefined || named === "") return [];
  return fsSync.existsSync(named) ? [named] : [];
}

const CAN_DECODE =
  "import fontTools.ttLib.woff2, brotli, fontTools; print(fontTools.version)";

interface Decoder {
  python: string;
  fontToolsVersion: string;
}

function findFontTools(): { decoder: Decoder | null; lines: string[] } {
  const lines: string[] = [];
  let decoder: Decoder | null = null;
  for (const python of pythonCandidates()) {
    const r = spawnSync(python, ["-I", "-c", CAN_DECODE], { encoding: "utf8" });
    const isOk = r.status === 0;
    lines.push(
      `GETWRITE_FONTTOOLS_PYTHON: ${isOk ? `fontTools ${r.stdout.trim()} + brotli` : "no fontTools+brotli"}`,
    );
    if (isOk && decoder === null)
      decoder = { python, fontToolsVersion: r.stdout.trim() };
  }
  return { decoder, lines };
}

const DECODE_SCRIPT = [
  "import sys",
  "from fontTools.ttLib import TTFont",
  "f = TTFont(sys.argv[1])",
  "f.flavor = None",
  "f.save(sys.argv[2])",
].join("\n");

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
});

describe("Task 60 (b): woff2 decoded to TrueType by an independent decoder, then subset with fontkit", () => {
  it("records what was looked for and where", () => {
    const pnpmDir = path.resolve(FRONTEND, "../node_modules/.pnpm");
    const hits = listDir(pnpmDir).filter((n) => DECODER_NAME.test(n));
    probe(
      "search node_modules/.pnpm (repo root) for woff2|wawoff|fonteditor|ttf2|fontverter|opentype|brotli",
      JSON.stringify(hits),
    );
    for (const pkgDir of ["frontend", "electron", "cli"]) {
      const top = listDir(
        path.resolve(FRONTEND, "..", pkgDir, "node_modules"),
      ).filter((n) => DECODER_NAME.test(n));
      probe(`search ${pkgDir}/node_modules top level`, JSON.stringify(top));
    }
    for (const cmd of [
      "woff2_decompress",
      "woff2_compress",
      "fonttools",
      "pyftsubset",
      "ttx",
    ]) {
      probe(`which ${cmd}`, which(cmd));
    }
    expect(hits.every((n) => n.startsWith("brotli@"))).toBe(true);
  });

  it("finds a Python with fontTools and brotli", () => {
    const { decoder, lines } = findFontTools();
    for (const l of lines) probe("python candidate", l);
    probe(
      "independent decoder",
      decoder
        ? `GETWRITE_FONTTOOLS_PYTHON (fontTools ${decoder.fontToolsVersion})`
        : "NOT RUN: GETWRITE_FONTTOOLS_PYTHON not set or unusable",
    );
    expect(Array.isArray(lines)).toBe(true);
  });

  it("subsets the fontTools-decoded TrueType of each face for the four glyph sets", async () => {
    const { decoder } = findFontTools();
    if (!decoder) {
      probe("decode", "NOT RUN: GETWRITE_FONTTOOLS_PYTHON not set or unusable");
      return;
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-woff2-ttf-"));
    tmpDirs.push(dir);
    for (const [pkg, base] of FACES) {
      const out = path.join(dir, `${base}.ttf`);
      const r = spawnSync(
        decoder.python,
        ["-I", "-c", DECODE_SCRIPT, facePath(pkg, base, "woff2"), out],
        { encoding: "utf8" },
      );
      expect(r.status, r.stderr).toBe(0);
      const ttf = fontkit.create(await fs.readFile(out));
      const w1 = open(pkg, base, "woff");
      const w2 = open(pkg, base, "woff2");
      probe(
        `decoded[${base}]`,
        `numGlyphs ttf=${ttf.numGlyphs} woff=${w1.numGlyphs}; loca offsets length ttf=${ttf.loca.offsets.length} woff=${w1.loca.offsets.length}`,
      );
      // Per-glyph bytes of the decoded TrueType against the woff's glyf, and
      // outlines (path SVG) from the three sources.
      const gT = tableBytes(ttf, "glyf");
      const g1 = tableBytes(w1, "glyf");
      let glyphsDiffering = 0;
      let pathsWoff2VsTtf = 0;
      let pathsWoffVsTtf = 0;
      for (let gid = 0; gid < w1.numGlyphs; gid++) {
        const a = gT.subarray(ttf.loca.offsets[gid], ttf.loca.offsets[gid + 1]);
        const b = g1.subarray(w1.loca.offsets[gid], w1.loca.offsets[gid + 1]);
        if (Buffer.compare(a, b) !== 0) glyphsDiffering++;
        const pT = ttf.getGlyph(gid).path.toSVG();
        if (w2.getGlyph(gid).path.toSVG() !== pT) pathsWoff2VsTtf++;
        if (w1.getGlyph(gid).path.toSVG() !== pT) pathsWoffVsTtf++;
      }
      let locaDiffering = 0;
      for (let i = 0; i < w1.loca.offsets.length; i++)
        if (ttf.loca.offsets[i] !== w1.loca.offsets[i]) locaDiffering++;
      let ttfBackwards = 0;
      for (let i = 1; i < ttf.loca.offsets.length; i++)
        if (ttf.loca.offsets[i] < ttf.loca.offsets[i - 1]) ttfBackwards++;
      probe(
        `decodedVsWoff[${base}]`,
        `glyphs whose glyf bytes differ=${glyphsDiffering} of ${w1.numGlyphs}; loca entries differing=${locaDiffering}; ` +
          `glyf table length ttf=${gT.length} woff=${g1.length}; sha ttf=${sha(gT)} woff=${sha(g1)}; ` +
          `ttf loca backwards steps=${ttfBackwards}`,
      );
      probe(
        `outlines[${base}]`,
        `glyph paths differing from the decoded ttf: woff2 (fontkit)=${pathsWoff2VsTtf}, woff=${pathsWoffVsTtf} of ${w1.numGlyphs}`,
      );
      expect(ttfBackwards).toBe(0);
      expect(pathsWoff2VsTtf).toBe(0);
      for (const ch of CHARS) {
        const vT = viewAddGlyph(ttf, gidOf(ttf, ch));
        probe(`addGlyph[decoded ttf][${base}][${ch}]`, describeView(vT));
        if (ch !== "a") {
          expect(vT.kind).toBe("composite");
          expect(vT.componentPatchInBounds).toBe(true);
        }
      }
      for (const text of TEXTS) {
        const outTtf = subsetOutcome(ttf, text);
        const outWoff = subsetOutcome(w1, text);
        const outWoff2 = subsetOutcome(w2, text);
        probe(
          `subset[${base}][${text}]`,
          `woff2 (fontkit direct)=${outWoff2}; woff=${outWoff}; fontTools-decoded ttf=${outTtf}`,
        );
        expect(outTtf).toBe("encoded");
        expect(outWoff).toBe("encoded");
        expect(outWoff2).toBe(
          text === "abcd"
            ? "encoded"
            : "RangeError: Offset is outside the bounds of the DataView",
        );
      }
    }
  });
});
