/**
 * Feature 89, Task 9 (FR-15): the texts that tell the writer a deprecated
 * field is hidden from the sidebar and its values are kept. A later edit that
 * changes behaviour or wording must fail here rather than become untrue.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DeprecateOrClearDialog from "../components/SchemaManager/DeprecateOrClearDialog";
import {
  HELP_TABS,
  type HelpRichTextPart,
} from "../components/help/help-content";

function partsToText(parts: HelpRichTextPart[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.text)).join("");
}

function helpDeprecateItem(): string {
  const tab = HELP_TABS.find((t) => t.id === "metadata");
  if (!tab) throw new Error("metadata help tab missing");
  for (const block of tab.blocks) {
    if (block.type !== "tip-card") continue;
    for (const item of block.items) {
      const text = partsToText(item);
      if (text.startsWith("Deprecate")) return text;
    }
  }
  throw new Error("Deprecate help item missing");
}

describe("deprecated-field copy (FR-15)", () => {
  it("DeprecateOrClearDialog says the field is hidden from the sidebar and values are kept", () => {
    render(
      <DeprecateOrClearDialog
        isOpen
        fieldLabel="Old Field"
        onDeprecate={vi.fn()}
        onClear={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const text = screen.getByText(/hide field from sidebar/i).textContent;
    expect(text).toMatch(/Keep values in sidecars/);
    expect(text).toMatch(/hide field from sidebar/);
    expect(text).toMatch(/queryable but flagged/);
  });

  it("help text says Deprecate hides the field from the panel and keeps every stored value", () => {
    const text = helpDeprecateItem();
    expect(text).toMatch(/hides the field from the panel/);
    expect(text).toMatch(/keeps every stored value/);
    expect(text).toMatch(/flagged as deprecated/);
  });
});
