/**
 * @module rtf-to-tiptap
 *
 * Hand-rolled RTF → TipTap converter for the Scrivener CLI importer
 * (FR-14). Scrivener's `content.rtf` bodies are converted to
 * `content.tiptap.json` (bold/italic preserved as TipTap marks) and to
 * plain text (`content.txt`, formatting-free) in a single pass.
 *
 * Scope: this parser is deliberately **not** a general RTF engine. It is
 * scoped to the control words measured present in the survey project's
 * `content.rtf` bodies per FR-14: `\b`/`\b0` (bold), `\i`/`\i0` (italic),
 * `\uN` Unicode escapes (plus the fallback character every `\uN` is
 * followed by, per the RTF spec's `\ucN` convention, default N=1), the
 * `\field`/`HYPERLINK` construct, and paragraph structure (`\par`). No
 * RTF-parsing package dependency is added, per FR-14 and
 * `docs/standards/package-selection.md` — control-word scanning is
 * hand-rolled below.
 *
 * The FR-14 amendment (2026-09-11, owner decision, Gate 5), from a measured
 * run of this converter over all 75 real-project `content.rtf`/`notes.rtf`
 * files, added: `\emdash`/`\endash`/`\lquote`/`\rquote`/`\ldblquote`/
 * `\rdblquote`/`\bullet` special-character mappings; `\tab` as a literal
 * tab character; `\line` as a TipTap `hardBreak` node (a paragraph-internal
 * line break, distinct from `\par`'s new-paragraph); `\listtext` destination
 * suppression so a list paragraph's own text is kept as an ordinary
 * paragraph without the `\listtext` marker text being duplicated into it;
 * `\super`/`\sub` runs keeping their text while being reported as dropped
 * formatting (no GetWrite mark exists for either); a fixed list of
 * layout-only control words recognized and silently ignored; and an unknown
 * ignorable destination (`{\*\…}`) now skipped with no report entry at all
 * (previously reported — the amendment supersedes that).
 *
 * Everything else falls into one of two buckets, per FR-8's
 * skip-with-reason principle:
 *
 * - {@link SILENT_STRUCTURAL_CONTROL_WORDS} and
 *   {@link SILENT_DESTINATION_GROUPS} — control words/groups that carry no
 *   visible prose content and that GetWrite's fixed-typography editor has
 *   no equivalent for regardless (document header metadata, font/size/
 *   color selection, paragraph alignment/reset). Dropping these is not a
 *   loss a writer would notice or want reported — every one of the six
 *   fixture files contains several of them — so they are skipped silently
 *   rather than padding the FR-9 report with boilerplate noise.
 * - Any other, unrecognized control word or RTF `\*`-marked ignorable
 *   destination group is treated as a genuine, reportable loss: it is
 *   never emitted as literal text (RTF control words are never meant to
 *   appear as visible prose) and is instead recorded in
 *   `droppedFeatures` with the word/group name, per FR-8.
 *
 * Input type: `convertRtfToTiptap` accepts a `Buffer`/`Uint8Array` or a
 * `string`. RTF's own grammar guarantees every byte outside a `\uN`
 * Unicode escape is 7-bit ASCII (non-ASCII characters are always
 * represented as `\uN` escapes or `\'hh` hex escapes, never as raw
 * multi-byte sequences) so a `Buffer`/`Uint8Array` is decoded with
 * `"latin1"`, which maps each byte to the identical code point losslessly
 * for that ASCII-only range. `string` is accepted directly so a caller
 * that already read the file via `io.ts`'s `readFile` (which returns a
 * decoded `utf8` string) does not need to re-read it as a buffer.
 *
 * **Task 22 (FR-14/FR-8/FR-9 amendment, 2026-09-11): `\'XX` hex-escape
 * decoding.** Every `\'XX` escape is decoded as a byte in the document's
 * declared `\ansicpg` Windows code page (via {@link decodeWindowsCodePageByte}) —
 * currently only Windows-1252 is supported, since that is the only code
 * page measured in the real project. A document with no `\ansicpg` at all
 * defaults to 1252 (ANSI RTF's own conventional default), rather than
 * refusing to decode; a document that explicitly declares a different,
 * unsupported code page is instead recorded as a single FR-8 skip and its
 * `\'XX` escapes are left undecoded (dropped, since there is no safe
 * mapping to guess) rather than mis-decoded under the wrong table. A
 * decoded byte landing in the C0 control range (0x00-0x1F) is dropped from
 * the output text — it is not visible prose GetWrite's editor can render —
 * and is recorded as exactly one FR-9 report entry per affected document
 * (not one per occurrence), per the amendment. A `\'XX` hex-escape token
 * appearing while a `\uN` ANSI-fallback byte is owed (RTF's `\ucN`
 * convention) is consumed as that fallback byte and discarded entirely,
 * rather than decoded/emitted, so the `\uN`-decoded character is not
 * duplicated.
 */

/** A TipTap mark this converter can produce. Matches the on-disk mark
 * names the editor actually persists (FR-14/OQ-5) — not invented names. */
export interface RtfTipTapMark {
  type: "bold" | "italic";
}

/** A single run of text within a paragraph, with zero or more marks. */
export interface RtfTipTapTextNode {
  type: "text";
  text: string;
  marks?: RtfTipTapMark[];
}

/**
 * A `\line` paragraph-internal line break — distinct from `\par`'s
 * new-paragraph — as the TipTap `hardBreak` node type name confirmed on
 * disk by FR-14's amendment (`"type": "hardBreak"` at
 * `projects/937079b8-83d0-4052-8688-8c3b77499c2b/resources/9f32a555-583f-4824-b272-c3953938f8e2/content.tiptap.json`).
 */
export interface RtfTipTapHardBreakNode {
  type: "hardBreak";
}

/** One node within a paragraph's `content`: a text run or a `\line` hard break. */
export type RtfTipTapParagraphContentNode =
  | RtfTipTapTextNode
  | RtfTipTapHardBreakNode;

/** A paragraph node; its `content` is empty for a blank paragraph. */
export interface RtfTipTapParagraphNode {
  type: "paragraph";
  content: RtfTipTapParagraphContentNode[];
}

/**
 * TipTap document root produced by this converter.
 *
 * The project already declares `TipTapDocumentSchema`/`TipTapNodeSchema`
 * in `schemas.ts`, but per FR-14/OQ-5's note those declare no `marks`
 * field and are used only within `schemas.ts` itself — forcing this
 * converter's bold/italic output through that Zod shape would either lose
 * marks or require widening a schema this module doesn't own. This local,
 * narrower type is structurally compatible with the broader
 * `TipTapDocument` interface in `types.ts` (same `{ type: "doc", content:
 * [...] }` envelope) but adds the `marks` field this converter needs.
 */
export interface RtfTipTapDocument {
  type: "doc";
  content: RtfTipTapParagraphNode[];
}

/** A single RTF feature this converter could not faithfully preserve. */
export interface RtfDroppedFeature {
  /** Short, machine-stable identifier (e.g. `"HYPERLINK"` or
   * `"control-word:ul"`) suitable for grouping/de-duplication by a report
   * builder. */
  feature: string;
  /** Human-readable detail for the FR-9 report — what was dropped and,
   * where available, the visible text or URL involved. */
  detail: string;
}

export interface RtfToTiptapResult {
  tiptap: RtfTipTapDocument;
  plainText: string;
  droppedFeatures: RtfDroppedFeature[];
}

/**
 * Control words that carry no visible prose content and have no
 * GetWrite-editor equivalent regardless (document header metadata, font/
 * size/color selection, paragraph alignment/reset). Silently skipped —
 * see the module doc for the reasoning.
 */
const SILENT_STRUCTURAL_CONTROL_WORDS = new Set([
  "rtf",
  "ansi",
  "mac",
  "pc",
  "pca",
  "cocoartf",
  "cocoatextscaling",
  "cocoaplatform",
  "deff",
  "deflang",
  "deflangfe",
  "pard",
  "plain",
  "ql",
  "qr",
  "qc",
  "qj",
  "f",
  "fs",
  "cf",
  "cb",
  "fswiss",
  "fmodern",
  "froman",
  "fscript",
  "fdecor",
  "fnil",
  "ftech",
  "fbidi",
  "fcharset",
  "tx",
  "li",
  "ri",
  "fi",
  "sa",
  "sb",
  "sl",
  "slmult",
  "lang",
  "langfe",
  "kerning",
  "viewkind",
  "viewscale",
  "nowidctlpar",
  "widctlpar",
  "itap",
  // FR-14 amendment (2026-09-11): page size/margins, font/charset
  // selection, and other cocoa-specific control words named explicitly in
  // the amendment text.
  "paperw",
  "paperh",
  "margl",
  "margr",
  "margt",
  "margb",
  "af",
  "loch",
  "hich",
  "dbch",
  "ltrch",
  "partightenfactor",
  "pardirnatural",
  // FR-14 amendment: a list paragraph's own list-level/id markers
  // (`\ls`/`\ilvl`) carry no visible content — the paragraph's own text is
  // what reaches output as an ordinary paragraph (see
  // SILENT_DESTINATION_GROUPS's `listtext` entry for the discarded marker
  // text itself).
  "ls",
  "ilvl",
]);

/**
 * Group-opening destination control words whose entire content is
 * boilerplate metadata (font table, color table, style sheet, document
 * info, embedded picture data, etc.) rather than visible prose. When one
 * of these is the first control word inside a `{`, the whole group is
 * suppressed — no text from it reaches `plainText`/`tiptap`, and (unlike
 * an unrecognized `\*` destination) no drop is reported, since this is
 * expected, universal RTF document structure rather than a lost writer
 * feature.
 */
const SILENT_DESTINATION_GROUPS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "generator",
  "pict",
  "listtable",
  "listoverridetable",
  "rsidtbl",
  "xmlnstbl",
  "themedata",
  "colorschememapping",
  "latentstyles",
  // FR-14 amendment (2026-09-11): a list paragraph's `\listtext` group
  // holds only the bullet/number marker text, which the item's own
  // following paragraph text already supersedes — discarding it here (with
  // no report entry, per the amendment) is what keeps the marker from
  // being duplicated into the paragraph.
  "listtext",
]);

/**
 * Windows-1252 mapping for the 0x80-0x9F range, where CP1252 diverges from
 * Latin-1 (which maps that range to the C1 control characters). Slots CP1252
 * itself leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) fall back to the
 * identity/C1-control mapping, matching common real-world CP1252 decoders.
 * 0x00-0x7F and 0xA0-0xFF are identical between CP1252 and Latin-1, so they
 * are not listed here — {@link decodeWindowsCodePageByte} maps them
 * directly.
 */
const CP1252_HIGH_RANGE: ReadonlyMap<number, number> = new Map([
  [0x80, 0x20ac], // €
  [0x82, 0x201a], // ‚
  [0x83, 0x0192], // ƒ
  [0x84, 0x201e], // „
  [0x85, 0x2026], // …
  [0x86, 0x2020], // †
  [0x87, 0x2021], // ‡
  [0x88, 0x02c6], // ˆ
  [0x89, 0x2030], // ‰
  [0x8a, 0x0160], // Š
  [0x8b, 0x2039], // ‹
  [0x8c, 0x0152], // Œ
  [0x8e, 0x017d], // Ž
  [0x91, 0x2018], // '
  [0x92, 0x2019], // '
  [0x93, 0x201c], // "
  [0x94, 0x201d], // "
  [0x95, 0x2022], // •
  [0x96, 0x2013], // –
  [0x97, 0x2014], // —
  [0x98, 0x02dc], // ˜
  [0x99, 0x2122], // ™
  [0x9a, 0x0161], // š
  [0x9b, 0x203a], // ›
  [0x9c, 0x0153], // œ
  [0x9e, 0x017e], // ž
  [0x9f, 0x0178], // Ÿ
]);

/**
 * Windows code pages this converter can decode a `\'XX` hex escape's raw
 * byte value under. Only 1252 is measured present in the real project
 * (Task 22); any other declared `\ansicpg` value is an FR-8 skip rather
 * than a guessed decode.
 */
const SUPPORTED_ANSI_CODE_PAGES = new Set([1252]);

/**
 * Decodes a single raw byte (0-255) as Windows-1252, returning its Unicode
 * code point. 0x00-0x7F and 0xA0-0xFF are identical to Latin-1 (identity
 * mapping); 0x80-0x9F consults {@link CP1252_HIGH_RANGE}.
 */
function decodeWindowsCodePageByte(byte: number): number {
  if (byte >= 0x80 && byte <= 0x9f) {
    return CP1252_HIGH_RANGE.get(byte) ?? byte;
  }
  return byte;
}

type TokenType =
  | "open"
  | "close"
  | "star"
  | "word"
  | "symbol"
  | "text"
  | "hexescape";

interface Token {
  type: TokenType;
  /** Control word name (`"word"` tokens) or the single symbol character
   * (`"symbol"` tokens). */
  name?: string;
  /** Numeric parameter following a control word, if any. */
  param?: number;
  /** Raw text payload (`"text"` tokens). */
  value?: string;
  /** Raw byte value 0-255 (`"hexescape"` tokens, i.e. `\'XX`). */
  byte?: number;
}

/**
 * Splits raw RTF source into a flat token stream: group braces, the `\*`
 * ignorable-destination marker, control words (with optional numeric
 * parameter), control symbols, and plain text runs. Literal `\r`/`\n`
 * bytes in the source are insignificant formatting of the RTF file itself
 * (not visible whitespace) and are dropped from text runs.
 */
function tokenize(rtf: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = rtf.length;

  while (i < len) {
    const ch = rtf[i];

    if (ch === "{") {
      tokens.push({ type: "open" });
      i += 1;
      continue;
    }

    if (ch === "}") {
      tokens.push({ type: "close" });
      i += 1;
      continue;
    }

    if (ch === "\\") {
      const next = rtf[i + 1];
      if (next === undefined) {
        i += 1;
        continue;
      }

      if (next === "*") {
        tokens.push({ type: "star" });
        i += 2;
        continue;
      }

      // `\'XX` hex escape: backslash, apostrophe, exactly 2 hex digits,
      // consumed as one token carrying the raw byte value (Task 22).
      if (
        next === "'" &&
        /[0-9a-fA-F]/.test(rtf[i + 2] ?? "") &&
        /[0-9a-fA-F]/.test(rtf[i + 3] ?? "")
      ) {
        const hex = rtf[i + 2] + rtf[i + 3];
        tokens.push({ type: "hexescape", byte: parseInt(hex, 16) });
        i += 4;
        continue;
      }

      if (/[a-zA-Z]/.test(next)) {
        let j = i + 1;
        let word = "";
        while (j < len && /[a-zA-Z]/.test(rtf[j])) {
          word += rtf[j];
          j += 1;
        }
        let paramStr = "";
        if (rtf[j] === "-") {
          paramStr += "-";
          j += 1;
        }
        while (j < len && /[0-9]/.test(rtf[j])) {
          paramStr += rtf[j];
          j += 1;
        }
        const param =
          paramStr === "" || paramStr === "-" ? undefined : Number(paramStr);
        // A single trailing space is the control word's delimiter, and is
        // consumed rather than treated as literal text.
        if (rtf[j] === " ") {
          j += 1;
        }
        tokens.push({ type: "word", name: word, param });
        i = j;
        continue;
      }

      // Control symbol: backslash followed by exactly one non-letter
      // character (e.g. `\~`, `\_`, `\{`, `\}`, `\\`).
      tokens.push({ type: "symbol", name: next });
      i += 2;
      continue;
    }

    // Plain text run up to the next control introducer or brace.
    let j = i;
    let text = "";
    while (j < len && rtf[j] !== "\\" && rtf[j] !== "{" && rtf[j] !== "}") {
      const c = rtf[j];
      if (c !== "\r" && c !== "\n") {
        text += c;
      }
      j += 1;
    }
    if (text !== "") {
      tokens.push({ type: "text", value: text });
    }
    i = j;
  }

  return tokens;
}

/** Per-group interpreter state, inherited by child groups on `{`. */
interface Frame {
  bold: boolean;
  italic: boolean;
  /** `\super`/`\sub` state, cleared by `\nosupersub`. Kept text still
   * reaches output (per the FR-14 amendment) — there is no GetWrite mark
   * for either, so this only drives the `droppedFeatures` report. */
  superOrSub: "super" | "sub" | undefined;
  /** True while text encountered in this group must not reach visible
   * output (a suppressed destination group). */
  skip: boolean;
  /** True until the group's first token has been processed — used to
   * detect a leading destination control word. */
  atStart: boolean;
  /** True if `\*` was seen while still `atStart` (RTF's
   * ignorable-if-unrecognized destination marker). */
  starPrefixed: boolean;
  /** Set when this frame is the `\fldinst` or `\fldrslt` destination of an
   * enclosing `\field` group. */
  captureAs?: "fldinst" | "fldrslt";
  /** True when this frame is the `\field` wrapper group itself. */
  isFieldWrapper: boolean;
  /** RTF's `\ucN` convention: the number of ANSI-fallback bytes that follow
   * each `\uN` escape in this group. Defaults to 1 (the RTF-spec default)
   * and is inherited by child groups until overridden by `\ucN` itself. */
  ucN: number;
}

function newFrame(parent: Frame): Frame {
  return {
    bold: parent.bold,
    italic: parent.italic,
    superOrSub: parent.superOrSub,
    skip: parent.skip,
    atStart: true,
    starPrefixed: false,
    isFieldWrapper: false,
    ucN: parent.ucN,
  };
}

/** Accumulated text for the two destinations of a single `\field` group. */
interface FieldContext {
  fldinstText: string;
  fldrsltText: string;
}

/**
 * Converts a Scrivener `content.rtf` body to a TipTap document plus plain
 * text, per FR-14. Pure — no I/O; callers read the file first.
 */
export function convertRtfToTiptap(
  rtfInput: string | Buffer | Uint8Array,
): RtfToTiptapResult {
  const rtf =
    typeof rtfInput === "string"
      ? rtfInput
      : Buffer.from(rtfInput).toString("latin1");

  const tokens = tokenize(rtf);

  const rootFrame: Frame = {
    bold: false,
    italic: false,
    superOrSub: undefined,
    skip: false,
    atStart: false,
    starPrefixed: false,
    isFieldWrapper: false,
    ucN: 1,
  };
  const stack: Frame[] = [rootFrame];
  const fieldStack: FieldContext[] = [];
  const droppedFeatures: RtfDroppedFeature[] = [];

  const paragraphs: RtfTipTapParagraphContentNode[][] = [[]];
  const plainParagraphs: string[] = [""];

  let currentRunText = "";
  let currentRunBold = false;
  let currentRunItalic = false;
  let currentRunSuperOrSub: "super" | "sub" | undefined;
  /** Number of fallback bytes still owed to the most recent `\uN` escape
   * (RTF's `\ucN` convention — the count comes from the enclosing frame's
   * `ucN`, default 1). A `"text"`/`"symbol"`/`"hexescape"` token encountered
   * while this is positive is consumed as that fallback and discarded. */
  let pendingUnicodeFallback = 0;
  /** This document's declared `\ansicpg` code page, captured on first sight.
   * `undefined` until an `\ansicpg` control word is seen, at which point it
   * is set once (per the module doc, a document declares at most one). No
   * `\ansicpg` at all defaults to 1252 (Task 22 — ANSI RTF's own
   * conventional default), so decoding proceeds rather than treating an
   * absent declaration as an unsupported code page. */
  let declaredCodePage: number | undefined;
  /** True once an unsupported (non-1252) `\ansicpg` has been recorded as an
   * FR-8 skip for this document, so it is reported only once. */
  let unsupportedCodePageReported = false;
  /** True once a decoded C0 control character has been dropped from this
   * document's output, so the FR-9 drop is recorded only once (Task 22). */
  let c0ControlDropped = false;

  const effectiveCodePage = (): number => declaredCodePage ?? 1252;
  const codePageSupported = (): boolean =>
    SUPPORTED_ANSI_CODE_PAGES.has(effectiveCodePage());

  const top = (): Frame => stack[stack.length - 1];

  const flushRun = (): void => {
    if (currentRunText === "") return;
    const marks: RtfTipTapMark[] = [];
    if (currentRunBold) marks.push({ type: "bold" });
    if (currentRunItalic) marks.push({ type: "italic" });
    const node: RtfTipTapTextNode =
      marks.length > 0
        ? { type: "text", text: currentRunText, marks }
        : { type: "text", text: currentRunText };
    paragraphs[paragraphs.length - 1].push(node);
    plainParagraphs[plainParagraphs.length - 1] += currentRunText;
    if (currentRunSuperOrSub !== undefined) {
      droppedFeatures.push({
        feature: currentRunSuperOrSub,
        detail: `${currentRunSuperOrSub === "super" ? "Superscript" : "Subscript"} formatting dropped (text kept): "${currentRunText}"`,
      });
    }
    currentRunText = "";
  };

  const newParagraph = (): void => {
    flushRun();
    paragraphs.push([]);
    plainParagraphs.push("");
  };

  const addText = (text: string): void => {
    if (text === "") return;
    const frame = top();

    if (frame.captureAs === "fldinst") {
      if (fieldStack.length > 0) {
        fieldStack[fieldStack.length - 1].fldinstText += text;
      }
      return;
    }
    if (frame.captureAs === "fldrslt") {
      if (fieldStack.length > 0) {
        fieldStack[fieldStack.length - 1].fldrsltText += text;
      }
      // Falls through: the visible result text is still rendered below.
    }

    if (frame.skip) return;

    if (
      currentRunBold !== frame.bold ||
      currentRunItalic !== frame.italic ||
      currentRunSuperOrSub !== frame.superOrSub
    ) {
      flushRun();
      currentRunBold = frame.bold;
      currentRunItalic = frame.italic;
      currentRunSuperOrSub = frame.superOrSub;
    }
    currentRunText += text;
  };

  /** Consumes up to `pendingUnicodeFallback` characters from the front of
   * `text`, returning the remainder to be added as real text. */
  const stripUnicodeFallback = (text: string): string => {
    if (pendingUnicodeFallback <= 0) return text;
    const consume = Math.min(pendingUnicodeFallback, text.length);
    pendingUnicodeFallback -= consume;
    return text.slice(consume);
  };

  const openGroup = (): void => {
    stack.push(newFrame(top()));
  };

  const closeGroup = (): void => {
    flushRun();
    if (stack.length <= 1) return; // unbalanced `}`; ignore defensively
    const closed = stack.pop() as Frame;
    if (closed.isFieldWrapper) {
      const ctx = fieldStack.pop();
      if (ctx) {
        const urlMatch = /HYPERLINK\s+"([^"]*)"/.exec(ctx.fldinstText);
        const url = urlMatch ? urlMatch[1] : undefined;
        const visibleText = ctx.fldrsltText.trim();
        droppedFeatures.push({
          feature: "HYPERLINK",
          detail: `HYPERLINK field converted to plain text (link mark dropped): text="${visibleText}"${
            url ? `, url="${url}"` : ""
          }`,
        });
      }
    }
  };

  const handleWord = (name: string, param: number | undefined): void => {
    const frame = top();

    if (frame.skip) {
      frame.atStart = false;
      return;
    }

    if (frame.atStart) {
      frame.atStart = false;
      if (SILENT_DESTINATION_GROUPS.has(name)) {
        frame.skip = true;
        return;
      }
      if (name === "fldinst") {
        frame.skip = true;
        frame.captureAs = "fldinst";
        return;
      }
      if (name === "fldrslt") {
        frame.captureAs = "fldrslt";
        return;
      }
      if (name === "field") {
        frame.isFieldWrapper = true;
        fieldStack.push({ fldinstText: "", fldrsltText: "" });
        return;
      }
      if (frame.starPrefixed) {
        // An RTF `\*`-marked (unknown) destination this converter doesn't
        // specifically recognize. Per the FR-14 amendment this MUST be
        // skipped silently, with no report entry — RTF's own spec marks
        // `\*` groups as safe to ignore when unrecognized, and (unlike the
        // earlier, pre-amendment behavior) this is no longer treated as a
        // reportable loss.
        frame.skip = true;
        return;
      }
      // Not a recognized destination keyword; fall through and handle it
      // as an ordinary control word below (e.g. a group opening directly
      // with `\pard` or `\b`).
    }

    switch (name) {
      case "b":
        frame.bold = param !== 0;
        return;
      case "i":
        frame.italic = param !== 0;
        return;
      case "par":
        newParagraph();
        return;
      case "line":
        // A paragraph-internal line break — distinct from \par — converts
        // to a TipTap hardBreak node rather than starting a new paragraph
        // (FR-14 amendment).
        flushRun();
        paragraphs[paragraphs.length - 1].push({ type: "hardBreak" });
        plainParagraphs[plainParagraphs.length - 1] += "\n";
        return;
      case "u": {
        const code = param ?? 0;
        const codePoint = code < 0 ? code + 65536 : code;
        addText(String.fromCodePoint(codePoint));
        pendingUnicodeFallback += frame.ucN;
        return;
      }
      case "uc":
        // RTF's `\ucN` convention: how many ANSI-fallback bytes follow each
        // subsequent `\uN` escape in this group (Task 22). `\uc0` is valid
        // (no fallback bytes at all); only an actually-supplied param
        // overrides the inherited default.
        if (param !== undefined) frame.ucN = param;
        return;
      case "ansicpg":
        // Captures the document's declared Windows code page for `\'XX`
        // hex-escape decoding (Task 22); contributes no visible text.
        // Per the module doc, a document declares this at most once — a
        // second sighting is defensively ignored rather than overwritten.
        if (declaredCodePage === undefined && param !== undefined) {
          declaredCodePage = param;
          if (
            !unsupportedCodePageReported &&
            !SUPPORTED_ANSI_CODE_PAGES.has(declaredCodePage)
          ) {
            unsupportedCodePageReported = true;
            droppedFeatures.push({
              feature: "unsupported-codepage",
              detail: `Unsupported \\ansicpg${declaredCodePage} code page; \\'XX hex escapes in this document were left undecoded.`,
            });
          }
        }
        return;
      case "emdash":
        addText("—");
        return;
      case "endash":
        addText("–");
        return;
      case "lquote":
        addText("‘");
        return;
      case "rquote":
        addText("’");
        return;
      case "ldblquote":
        addText("“");
        return;
      case "rdblquote":
        addText("”");
        return;
      case "bullet":
        addText("•");
        return;
      case "tab":
        addText("\t");
        return;
      case "super":
        frame.superOrSub = "super";
        return;
      case "sub":
        frame.superOrSub = "sub";
        return;
      case "nosupersub":
        frame.superOrSub = undefined;
        return;
      default:
        if (SILENT_STRUCTURAL_CONTROL_WORDS.has(name)) return;
        droppedFeatures.push({
          feature: `control-word:${name}`,
          detail: `Unsupported RTF control word "\\${name}" was skipped.`,
        });
    }
  };

  for (const token of tokens) {
    if (token.type === "open") {
      openGroup();
      continue;
    }
    if (token.type === "close") {
      closeGroup();
      continue;
    }
    if (token.type === "star") {
      const frame = top();
      if (frame.atStart) frame.starPrefixed = true;
      continue;
    }
    if (token.type === "word") {
      handleWord(token.name as string, token.param);
      continue;
    }
    if (token.type === "symbol") {
      top().atStart = false;
      const ch = token.name as string;
      if (pendingUnicodeFallback > 0) {
        pendingUnicodeFallback -= 1;
        continue; // this symbol is the \uN fallback character; discard it
      }
      // Escaped literal brace/backslash render as themselves; other
      // control symbols (tab, non-breaking space, etc.) are outside this
      // converter's measured scope and are safely dropped as
      // non-content punctuation substitutions rather than reported —
      // none appear in the fixture set.
      if (ch === "{" || ch === "}" || ch === "\\") {
        addText(ch);
      }
      continue;
    }
    if (token.type === "hexescape") {
      top().atStart = false;
      // A `\'XX` hex escape counts as exactly one `\uN` ANSI-fallback byte
      // when one is owed (Task 22) — discard it entirely rather than
      // decode/emit it, so the `\uN`-decoded character is not duplicated.
      if (pendingUnicodeFallback > 0) {
        pendingUnicodeFallback -= 1;
        continue;
      }
      if (!codePageSupported()) {
        // Unsupported declared code page: leave undecoded (dropped) rather
        // than guess a mapping — the FR-8 skip was already recorded when
        // `\ansicpg` was seen.
        continue;
      }
      const codePoint = decodeWindowsCodePageByte(token.byte as number);
      if (codePoint <= 0x1f) {
        // C0 control character: drop from output, report once per document.
        if (!c0ControlDropped) {
          c0ControlDropped = true;
          droppedFeatures.push({
            feature: "control-character",
            detail:
              "One or more decoded C0 control characters (from \\'XX hex escapes) were dropped from this document's text.",
          });
        }
        continue;
      }
      addText(String.fromCodePoint(codePoint));
      continue;
    }
    // token.type === "text"
    top().atStart = false;
    const remaining = stripUnicodeFallback(token.value as string);
    addText(remaining);
  }

  flushRun();

  // A file ending in `\par}` produces one trailing empty paragraph after
  // the last real one; trim exactly one, matching the intuitive "N
  // paragraphs" reading of such a file rather than N+1.
  if (paragraphs.length > 1 && paragraphs[paragraphs.length - 1].length === 0) {
    paragraphs.pop();
    plainParagraphs.pop();
  }

  const tiptap: RtfTipTapDocument = {
    type: "doc",
    content: paragraphs.map((content) => ({ type: "paragraph", content })),
  };
  const plainText = plainParagraphs.join("\n");

  return { tiptap, plainText, droppedFeatures };
}
