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

/** A paragraph node; its `content` is empty for a blank paragraph. */
export interface RtfTipTapParagraphNode {
  type: "paragraph";
  content: RtfTipTapTextNode[];
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
  "ansicpg",
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
  "uc",
  "nowidctlpar",
  "widctlpar",
  "itap",
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
]);

type TokenType = "open" | "close" | "star" | "word" | "symbol" | "text";

interface Token {
  type: TokenType;
  /** Control word name (`"word"` tokens) or the single symbol character
   * (`"symbol"` tokens). */
  name?: string;
  /** Numeric parameter following a control word, if any. */
  param?: number;
  /** Raw text payload (`"text"` tokens). */
  value?: string;
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
}

function newFrame(parent: Frame): Frame {
  return {
    bold: parent.bold,
    italic: parent.italic,
    skip: parent.skip,
    atStart: true,
    starPrefixed: false,
    isFieldWrapper: false,
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
    skip: false,
    atStart: false,
    starPrefixed: false,
    isFieldWrapper: false,
  };
  const stack: Frame[] = [rootFrame];
  const fieldStack: FieldContext[] = [];
  const droppedFeatures: RtfDroppedFeature[] = [];

  const paragraphs: RtfTipTapTextNode[][] = [[]];
  const plainParagraphs: string[] = [""];

  let currentRunText = "";
  let currentRunBold = false;
  let currentRunItalic = false;
  /** Number of fallback characters still owed to the most recent `\uN`
   * escape (RTF's `\ucN` convention; this converter assumes the default
   * N=1 since no fixture sets `\uc`). */
  let pendingUnicodeFallback = 0;

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

    if (currentRunBold !== frame.bold || currentRunItalic !== frame.italic) {
      flushRun();
      currentRunBold = frame.bold;
      currentRunItalic = frame.italic;
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
        // An RTF `\*`-marked destination this converter doesn't
        // specifically recognize. Per the RTF spec such a group is safe
        // to suppress entirely, but doing so may drop real content, so —
        // unlike the boilerplate groups above — it is reported.
        frame.skip = true;
        droppedFeatures.push({
          feature: `rtf-destination:${name}`,
          detail: `Unrecognized ignorable RTF destination group "\\*\\${name}" was skipped.`,
        });
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
      case "u": {
        const code = param ?? 0;
        const codePoint = code < 0 ? code + 65536 : code;
        addText(String.fromCodePoint(codePoint));
        pendingUnicodeFallback += 1;
        return;
      }
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
