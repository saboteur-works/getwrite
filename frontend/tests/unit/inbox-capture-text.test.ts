/**
 * Feature 106, Task 4 (FR-2 refusals, FR-5 title and body, FR-22 validation):
 * the pure capture text helpers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAPTURE_FALLBACK_TITLE,
  CAPTURE_LINK_MAX_LENGTH,
  CAPTURE_TEXT_MAX_LENGTH,
  CAPTURE_TITLE_MAX_LENGTH,
  deriveCaptureTitle,
  prepareCapture,
} from "../../src/lib/models/inbox-capture-text";
import { plainTextToTipTapDocument } from "../../src/lib/models/tiptap-doc";

const FIXED = new Date("2026-11-09T12:34:56.789Z");
const clock = (): Date => FIXED;

describe("prepareCapture refusals", () => {
  it.each(["", "   ", "\n\t \n"])(
    "refuses empty text %j with no link",
    (text) => {
      const r = prepareCapture({ text }, clock);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message.length).toBeGreaterThan(0);
        expect(Object.keys(r)).toEqual(["ok", "message"]);
      }
    },
  );

  it("refuses whitespace text with a whitespace-only link", () => {
    expect(prepareCapture({ text: " ", link: "  " }, clock).ok).toBe(false);
  });

  it("refuses text over 50,000 characters and names the limit", () => {
    const r = prepareCapture({ text: "a".repeat(50_001) }, clock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("50,000");
  });

  it("accepts exactly 50,000 characters", () => {
    expect(CAPTURE_TEXT_MAX_LENGTH).toBe(50_000);
    expect(prepareCapture({ text: "a".repeat(50_000) }, clock).ok).toBe(true);
  });

  it("counts the text as given, with no trimming", () => {
    const padded = `${" ".repeat(10)}x${" ".repeat(49_989)}`;
    expect(padded.length).toBe(50_000);
    expect(prepareCapture({ text: padded }, clock).ok).toBe(true);
    expect(prepareCapture({ text: `${padded} ` }, clock).ok).toBe(false);
  });

  it("refuses a non-string text", () => {
    expect(prepareCapture({ text: 5 as unknown as string }, clock).ok).toBe(
      false,
    );
  });

  it("refuses a link over the bound and a non-string link", () => {
    const long = "h".repeat(CAPTURE_LINK_MAX_LENGTH + 1);
    expect(prepareCapture({ text: "note", link: long }, clock).ok).toBe(false);
    expect(
      prepareCapture({ text: "note", link: 7 as unknown as string }, clock).ok,
    ).toBe(false);
    expect(
      prepareCapture(
        { text: "note", link: "h".repeat(CAPTURE_LINK_MAX_LENGTH) },
        clock,
      ).ok,
    ).toBe(true);
  });
});

describe("deriveCaptureTitle", () => {
  it("uses the first non-empty line, trimmed", () => {
    expect(deriveCaptureTitle("\n  \n   Hello there  \nsecond")).toBe(
      "Hello there",
    );
  });

  it("cuts to 80 characters mid-word", () => {
    const word = "x".repeat(120);
    const title = deriveCaptureTitle(`${word} tail`);
    expect(CAPTURE_TITLE_MAX_LENGTH).toBe(80);
    expect(title).toBe("x".repeat(80));
  });

  it("keeps an 80-character line whole", () => {
    expect(deriveCaptureTitle("y".repeat(80))).toBe("y".repeat(80));
  });

  it("falls back when there is no non-empty line", () => {
    expect(deriveCaptureTitle("")).toBe(CAPTURE_FALLBACK_TITLE);
    expect(deriveCaptureTitle(" \n \r\n")).toBe("Captured note");
  });
});

describe("prepareCapture result", () => {
  it("builds title, whole-text body, both body forms and capturedAt", () => {
    const text = "First line\n\nthird line";
    const r = prepareCapture({ text }, clock);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("First line");
      expect(r.value.plainText).toBe(text);
      expect(r.value.tiptap).toEqual(plainTextToTipTapDocument(text));
      expect(r.value.capturedAt).toBe("2026-11-09T12:34:56.789Z");
      expect(r.value.capturedLink).toBeUndefined();
    }
  });

  it("is deterministic for the same input and clock", () => {
    expect(prepareCapture({ text: "a\nb" }, clock)).toEqual(
      prepareCapture({ text: "a\nb" }, clock),
    );
  });

  it("makes a link-only capture whose body is the link", () => {
    const r = prepareCapture(
      { text: "  ", link: " https://example.org/a " },
      clock,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.plainText).toBe("https://example.org/a");
      expect(r.value.title).toBe("https://example.org/a");
      expect(r.value.capturedLink).toBe("https://example.org/a");
      expect(r.value.tiptap).toEqual(
        plainTextToTipTapDocument("https://example.org/a"),
      );
    }
  });

  it("keeps the text as the body and stores the link when both are given", () => {
    const r = prepareCapture({ text: "my note", link: "https://e.org" }, clock);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.plainText).toBe("my note");
      expect(r.value.capturedLink).toBe("https://e.org");
    }
  });

  it("imports nothing from React, node:*, the network or the file system", () => {
    const src = readFileSync(
      new URL("../../src/lib/models/inbox-capture-text.ts", import.meta.url),
      "utf8",
    );
    const imports = [...src.matchAll(/^import .*from "([^"]+)"/gm)].map(
      (m) => m[1],
    );
    expect(imports.every((i) => i.startsWith("./"))).toBe(true);
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/node:|react|fetch\(|XMLHttpRequest/);
  });
});
