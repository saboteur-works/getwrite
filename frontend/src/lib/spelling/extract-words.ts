/**
 * @module extract-words
 *
 * Pure, engine-independent word extraction for the spell checker (FR-20).
 * Turns a ProseMirror document into the words to check, each with the exact
 * document range it occupies. It never calls a spelling engine.
 *
 * Rules:
 * - A word is a run of letters with apostrophes (`'` or `’`, normalised to
 *   `'`) and hyphens inside it. A hyphenated token is one word; its parts are
 *   returned so a caller can check them if the whole is unknown.
 * - Text is read per textblock, with the text nodes joined across marks (a
 *   word split by bold is one word). Every non-text inline node (hard break,
 *   image, math, mention) and every run of `code`-marked text is a word
 *   boundary. Unlike `collectTextBlocks` in `entityHighlightDecoration.ts`,
 *   which joins text either side of such a node.
 * - Skipped: `code`-marked text, text inside code blocks, math nodes, tokens
 *   containing a digit or underscore, single-letter tokens, and URLs and
 *   email addresses. ALL-CAPS tokens of two or more letters are checked.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** A part of a hyphenated word, with its document range. */
interface ExtractedWordPart {
  /** The part's text, apostrophes normalised to `'`. */
  word: string;
  /** Document position of the part's first character. */
  from: number;
  /** Document position just after the part's last character. */
  to: number;
}

/** A checkable word with its document range. */
export interface ExtractedWord extends ExtractedWordPart {
  /**
   * The parts of a hyphenated word that are themselves checkable words
   * (two or more letters, no digit or underscore). Empty when the word has no
   * hyphen.
   */
  parts: ExtractedWordPart[];
}

/** A word found in a plain string, as offsets into that string. */
export interface TextWord {
  /** The word, apostrophes normalised to `'`. */
  word: string;
  /** Offset of the first character. */
  start: number;
  /** Offset just after the last character. */
  end: number;
  /** Checkable hyphen-separated parts; empty when there is no hyphen. */
  parts: TextWord[];
}

/** Stands in for a word boundary in a joined block string. */
const BOUNDARY = "\n";

const CHUNK = /[^\s]+/gu;
const TOKEN = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)/iu;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const LETTER = /[\p{L}\p{M}]/gu;
const DIGIT_OR_UNDERSCORE = /[\p{N}_]/u;

function normalise(token: string): string {
  return token.replace(/’/gu, "'");
}

function letterCount(token: string): number {
  return token.match(LETTER)?.length ?? 0;
}

/** A token is checkable when it has no digit or underscore and 2+ letters. */
function isCheckable(token: string): boolean {
  return !DIGIT_OR_UNDERSCORE.test(token) && letterCount(token) >= 2;
}

function hyphenParts(token: string, base: number): TextWord[] {
  if (!token.includes("-")) return [];
  const parts: TextWord[] = [];
  let offset = 0;
  for (const piece of token.split("-")) {
    if (isCheckable(piece)) {
      parts.push({
        word: normalise(piece),
        start: base + offset,
        end: base + offset + piece.length,
        parts: [],
      });
    }
    offset += piece.length + 1;
  }
  return parts;
}

/**
 * Finds the checkable words in a string, by the same rule the document
 * extraction uses. Also used to split a multi-word entity name or alias into
 * the words it makes known (FR-18).
 */
export function findWordsInText(text: string): TextWord[] {
  const found: TextWord[] = [];
  for (const chunk of text.matchAll(CHUNK)) {
    const chunkText = chunk[0];
    if (URL_LIKE.test(chunkText) || EMAIL_LIKE.test(chunkText)) continue;
    for (const match of chunkText.matchAll(TOKEN)) {
      const token = match[0];
      if (!isCheckable(token)) continue;
      const start = chunk.index + match.index;
      found.push({
        word: normalise(token),
        start,
        end: start + token.length,
        parts: hyphenParts(token, start),
      });
    }
  }
  return found;
}

/** A textblock's joined text and the document position of each character. */
export interface BlockText {
  text: string;
  /** Document position of each character of `text`; -1 for a boundary. */
  positions: number[];
}

function isCodeMarked(node: ProseMirrorNode): boolean {
  return node.marks.some((mark) => mark.type.name === "code");
}

function buildBlockText(block: ProseMirrorNode, blockPos: number): BlockText {
  let text = "";
  const positions: number[] = [];
  block.forEach((child, offset) => {
    const childPos = blockPos + 1 + offset;
    if (child.isText && child.text && !isCodeMarked(child)) {
      text += child.text;
      for (let i = 0; i < child.text.length; i++) positions.push(childPos + i);
      return;
    }
    text += BOUNDARY;
    positions.push(-1);
  });
  return { text, positions };
}

function toDocPart(word: TextWord, positions: number[]): ExtractedWordPart {
  return {
    word: word.word,
    from: positions[word.start],
    to: positions[word.end - 1] + 1,
  };
}

/**
 * The text of every checkable textblock, in document order, read by the same
 * rule {@link extractWords} uses (code blocks skipped; non-text inline nodes
 * and code-marked text are boundaries). The spell scheduler posts these texts
 * to the worker.
 */
export function extractTextBlocks(doc: ProseMirrorNode): BlockText[] {
  const out: BlockText[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    out.push(buildBlockText(node, pos));
    return false;
  });
  return out;
}

/** Extracts every checkable word in the document, in document order. */
export function extractWords(doc: ProseMirrorNode): ExtractedWord[] {
  const out: ExtractedWord[] = [];
  for (const { text, positions } of extractTextBlocks(doc)) {
    for (const word of findWordsInText(text)) {
      out.push({
        ...toDocPart(word, positions),
        parts: word.parts.map((part) => toDocPart(part, positions)),
      });
    }
  }
  return out;
}
