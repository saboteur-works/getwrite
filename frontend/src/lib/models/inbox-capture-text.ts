/**
 * @module inbox-capture-text
 *
 * Pure helpers for the Inbox capture (Feature 106, FR-2, FR-5, FR-22): they
 * validate the captured text and link, derive the title and build the body.
 * No I/O, no clock of their own (the caller injects one), no React and no
 * `node:*`, so the native build and the capture core can both import it.
 * A refusal is a returned value, never a thrown error (OQ-4, OQ-8).
 */
import { plainTextToTipTapDocument } from "./tiptap-doc";
import type { TipTapDocument } from "./types";

/** Longest accepted captured text, counted as given with no trimming (OQ-8). */
export const CAPTURE_TEXT_MAX_LENGTH = 50_000;

/** Longest item name; the cut has no word-boundary rule (OQ-8). */
export const CAPTURE_TITLE_MAX_LENGTH = 80;

/** Longest accepted link, counted after trimming (FR-22). */
export const CAPTURE_LINK_MAX_LENGTH = 2048;

/** Name used when the text has no non-empty line. */
export const CAPTURE_FALLBACK_TITLE = "Captured note";

/** What a caller supplies to a capture. `link` is optional. */
export interface CaptureTextInput {
  text: string;
  link?: string;
}

/** The validated and derived values a capture writes. */
export interface PreparedCapture {
  /** First non-empty line, trimmed, at most 80 characters. */
  title: string;
  /** The whole body as plain text. */
  plainText: string;
  /** The same body as a TipTap document, one paragraph per line. */
  tiptap: TipTapDocument;
  /** Full ISO UTC timestamp from the injected clock. */
  capturedAt: string;
  /** The trimmed link, when one was supplied. */
  capturedLink?: string;
}

/** Either the prepared values or a plain refusal message. */
export type PrepareCaptureResult =
  | { ok: true; value: PreparedCapture }
  | { ok: false; message: string };

/**
 * Derives the item name from the captured body.
 *
 * @param body - The body text.
 * @returns The first non-empty line, trimmed and cut to 80 characters, or
 *   "Captured note" when no line has content.
 */
export function deriveCaptureTitle(body: string): string {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "");
  if (line === undefined) return CAPTURE_FALLBACK_TITLE;
  return line.slice(0, CAPTURE_TITLE_MAX_LENGTH);
}

/**
 * Validates a capture and derives what is written for it.
 *
 * @param input - Captured text and optional link.
 * @param now - Injected clock for `capturedAt`.
 * @returns The prepared values, or a refusal with a plain message. Empty or
 *   whitespace-only text with no link, text over 50,000 characters, a
 *   non-string text or link, and an over-long link are refused.
 */
export function prepareCapture(
  input: CaptureTextInput,
  now: () => Date,
): PrepareCaptureResult {
  const { text, link } = input;
  if (typeof text !== "string") {
    return { ok: false, message: "The captured text must be text." };
  }
  if (link !== undefined && typeof link !== "string") {
    return { ok: false, message: "The link must be text." };
  }
  if (text.length > CAPTURE_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      message: `That is too long to capture. The limit is ${CAPTURE_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
    };
  }
  const trimmedLink = link?.trim() ?? "";
  if (trimmedLink.length > CAPTURE_LINK_MAX_LENGTH) {
    return {
      ok: false,
      message: `The link is too long. The limit is ${CAPTURE_LINK_MAX_LENGTH.toLocaleString("en-US")} characters.`,
    };
  }
  const hasText = text.trim() !== "";
  if (!hasText && trimmedLink === "") {
    return { ok: false, message: "Type something to capture." };
  }
  const plainText = hasText ? text : trimmedLink;
  return {
    ok: true,
    value: {
      title: deriveCaptureTitle(plainText),
      plainText,
      tiptap: plainTextToTipTapDocument(plainText),
      capturedAt: now().toISOString(),
      ...(trimmedLink !== "" ? { capturedLink: trimmedLink } : {}),
    },
  };
}
