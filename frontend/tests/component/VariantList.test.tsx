/** @vitest-environment jsdom */
/**
 * Feature 110, Task 18 (FR-5, FR-8, FR-10, FR-19, FR-22): the presentational
 * variant list. States are conveyed by text; the list writes nothing.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VariantList, {
  type VariantListItem,
} from "../../components/Folklore/VariantList";
import { runAxe } from "../a11y/helpers/axe";

const FULL: VariantListItem = {
  id: "v1",
  name: "Grimm 1812",
  kind: "variant",
  fields: [
    {
      key: "teller",
      label: "Teller",
      kind: "detail",
      state: "set",
      text: "Dorothea Viehmann",
    },
    { key: "date", label: "Date", kind: "detail", state: "not-set" },
    { key: "odd", label: "Place", kind: "detail", state: "unexpected-value" },
    {
      key: "motifs",
      label: "Motifs",
      kind: "tags",
      state: "set",
      tags: [
        { text: "ATU 510A | Cinderella", isInList: true, mark: null },
        { text: "old tag", isInList: false, mark: "not in the list" },
      ],
    },
    { key: "types", label: "Tale types", kind: "tags", state: "not-set" },
  ],
};
const NOT_VARIANT: VariantListItem = {
  id: "s2",
  name: "Field notes",
  kind: "not-a-variant",
  fields: [],
};
const UNREADABLE: VariantListItem = {
  id: "u3",
  name: "Broken one",
  kind: "unreadable",
  reason: "The sidecar could not be parsed",
  fields: [],
};

function setup(items: VariantListItem[], selectedIds: string[] = []) {
  const onOpen = vi.fn();
  const onToggleSelect = vi.fn();
  const utils = render(
    <VariantList
      label="Variants of Cinderella"
      items={items}
      selectedIds={selectedIds}
      onOpen={onOpen}
      onToggleSelect={onToggleSelect}
    />,
  );
  return { onOpen, onToggleSelect, ...utils };
}

function rowOf(name: RegExp): HTMLElement {
  const box = screen.getByRole("checkbox", { name });
  const li = box.closest("li");
  if (!li) throw new Error("row not found");
  return li;
}

describe("VariantList", () => {
  it("is a ul with an accessible name and one row per item", () => {
    setup([FULL, NOT_VARIANT, UNREADABLE]);
    const list = screen.getByRole("list", { name: "Variants of Cinderella" });
    expect(list.tagName).toBe("UL");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(3);
  });

  it("shows name, each field under its label, not set and unexpected value in text", () => {
    setup([FULL]);
    const row = rowOf(/Grimm 1812|Broken one/);
    expect(within(row).getByText("Grimm 1812")).toBeTruthy();
    expect(within(row).getByText("Teller")).toBeTruthy();
    expect(within(row).getByText("Dorothea Viehmann")).toBeTruthy();
    expect(within(row).getByText("Date")).toBeTruthy();
    expect(within(row).getAllByText("not set")).toHaveLength(2);
    expect(within(row).getByText("Place")).toBeTruthy();
    expect(within(row).getByText(/unexpected value/i)).toBeTruthy();
  });

  it("shows tags whole and marks a tag not in the list in text", () => {
    setup([FULL]);
    const row = rowOf(/Grimm 1812|Broken one/);
    expect(within(row).getByText("ATU 510A | Cinderella")).toBeTruthy();
    expect(within(row).getByText("old tag")).toBeTruthy();
    expect(within(row).getAllByText(/not in the list/)).toHaveLength(1);
  });

  it("marks a Source that is not a Variant and still lets it be selected", async () => {
    const { onToggleSelect } = setup([NOT_VARIANT]);
    expect(
      screen.getByText("not a Variant: teller, date and place do not apply"),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Field notes/ }),
    );
    expect(onToggleSelect).toHaveBeenCalledWith("s2");
  });

  it("shows an unreadable row with its reason, never as empty fields", () => {
    setup([UNREADABLE]);
    const row = rowOf(/Grimm 1812|Broken one/);
    expect(within(row).getByText(/Unreadable/)).toBeTruthy();
    expect(
      within(row).getByText(/The sidecar could not be parsed/),
    ).toBeTruthy();
    expect(within(row).queryByText("not set")).toBeNull();
  });

  it("has an open action per row that calls back with the id", async () => {
    const { onOpen } = setup([FULL, UNREADABLE]);
    await userEvent.click(
      screen.getByRole("button", { name: /Open Grimm 1812/ }),
    );
    expect(onOpen).toHaveBeenCalledWith("v1");
    expect(
      screen.getByRole("button", { name: /Open Broken one/ }),
    ).toBeTruthy();
  });

  it("reflects the selection on the checkbox", () => {
    setup([FULL, NOT_VARIANT], ["v1"]);
    expect(
      (screen.getByRole("checkbox", { name: /Grimm 1812/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Field notes/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("works with no tag fields and shows no tag heading or error", () => {
    setup([
      {
        id: "v9",
        name: "Plain",
        kind: "variant",
        fields: [
          {
            key: "teller",
            label: "Teller",
            kind: "detail",
            state: "set",
            text: "A",
          },
        ],
      },
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/tag/i)).toBeNull();
  });

  it("offers only open and select controls, and no text input", () => {
    setup([FULL, NOT_VARIANT]);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    const buttons = screen
      .getAllByRole("button")
      .map((b: HTMLElement) => b.textContent);
    expect(buttons.every((t: string | null) => t === "Open")).toBe(true);
  });

  it("is operable by keyboard alone", async () => {
    const { onOpen, onToggleSelect } = setup([FULL]);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: /Grimm 1812/ }),
    );
    await user.keyboard(" ");
    expect(onToggleSelect).toHaveBeenCalledWith("v1");
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Open Grimm 1812/ }),
    );
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("v1");
  });

  it("passes axe", async () => {
    const { container } = setup([FULL, NOT_VARIANT, UNREADABLE], ["v1"]);
    await runAxe(container, ["region"]);
  });
});
