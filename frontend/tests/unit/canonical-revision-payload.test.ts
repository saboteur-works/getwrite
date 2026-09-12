import { describe, it, expect } from "vitest";
import { plainTextToTipTapDocument } from "../../src/lib/models/tiptap-doc";
import type { TipTapDocument } from "../../src/lib/models/types";

/**
 * A new resource's first canonical revision must hold a serialized TipTap
 * document, not plain text: the editor only parses a JSON revision payload,
 * and a plain-text one is loaded as HTML — collapsing the resource into a
 * single paragraph that the canonical autosave then writes back to disk.
 *
 * These cover the conversion the producers (`createResourceCore`,
 * `createProjectFromType`) now apply before calling `writeRevision`.
 */
describe("plainTextToTipTapDocument — canonical revision payloads", () => {
  it("produces one paragraph per line", () => {
    const doc = plainTextToTipTapDocument("One.\nTwo.\nThree.");

    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(3);
    expect(doc.content.map((n) => n.content?.[0]?.text)).toEqual([
      "One.",
      "Two.",
      "Three.",
    ]);
  });

  it("keeps an empty line as an empty paragraph", () => {
    const doc = plainTextToTipTapDocument("One.\n\nTwo.");

    expect(doc.content).toHaveLength(3);
    expect(doc.content[1].type).toBe("paragraph");
    expect(doc.content[1].content ?? []).toHaveLength(0);
  });

  it("produces a single empty paragraph for empty text", () => {
    const doc = plainTextToTipTapDocument("");

    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].content ?? []).toHaveLength(0);
  });

  it("serializes to a payload the editor's revision parser accepts", () => {
    const payload = JSON.stringify(plainTextToTipTapDocument("One.\nTwo."));

    expect(payload.trimStart().startsWith("{")).toBe(true);
    const parsed = JSON.parse(payload) as TipTapDocument;
    expect(parsed.type).toBe("doc");
    expect(parsed.content).toHaveLength(2);
  });

  it("handles CRLF line endings", () => {
    const doc = plainTextToTipTapDocument("One.\r\nTwo.");

    expect(doc.content).toHaveLength(2);
    expect(doc.content[1].content?.[0]?.text).toBe("Two.");
  });
});
