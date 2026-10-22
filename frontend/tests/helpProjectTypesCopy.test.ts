/**
 * Feature 90, Task 27 (FR-25): the Project Types help text must describe the
 * manager as it now behaves (types can be saved, copied and deleted) and must
 * not keep the earlier claim that edits are session-only.
 */
import { describe, expect, it } from "vitest";
import {
  HELP_TABS,
  type HelpRichTextPart,
} from "../components/help/help-content";

function partsToText(parts: HelpRichTextPart[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.text)).join("");
}

function projectTypesHelpText(): string {
  const tab = HELP_TABS.find((t) => t.id === "types");
  if (!tab) throw new Error("types help tab missing");
  const chunks: string[] = [];
  for (const block of tab.blocks) {
    if (block.type === "paragraph") chunks.push(partsToText(block.content));
  }
  return chunks.join("\n");
}

describe("Project Types help copy (FR-25)", () => {
  it("no longer says edits are session-only or that files must be edited by hand", () => {
    const text = projectTypesHelpText();
    expect(text).not.toMatch(/held in the session only/);
    expect(text).not.toMatch(/means editing those files directly/);
  });

  it("names Save as copy, Save, Delete, the unsaved prompt and the clash rule", () => {
    const text = projectTypesHelpText();
    expect(text).toMatch(/Bundled types never change/);
    expect(text).toMatch(/Save as copy/);
    expect(text).toMatch(/Delete/);
    expect(text).toMatch(/Keep editing/);
    expect(text).toMatch(/ignoring capitals and surrounding spaces/);
  });
});

describe("Project Settings Editor-tab font help copy (Feature 91, FR-20)", () => {
  it("describes the font list, Other..., and the toolbar without it", () => {
    const tab = HELP_TABS.find((t) => t.id === "projects");
    if (!tab) throw new Error("projects help tab missing");
    const chunks: string[] = [];
    for (const block of tab.blocks) {
      if (block.type !== "tip-card") continue;
      for (const item of block.items) chunks.push(partsToText(item));
    }
    const text = chunks.join("\n");
    expect(text).toMatch(
      /pick from the list, or choose Other\.\.\. and type a name/,
    );
    expect(text).toMatch(
      /editor toolbar lists the same fonts without Other\.\.\./,
    );
  });
});
