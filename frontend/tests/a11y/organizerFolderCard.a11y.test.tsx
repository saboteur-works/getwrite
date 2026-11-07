import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerCard from "../../components/WorkArea/Views/OrganizerView/OrganizerCard";
import { createFolderResource } from "../../src/lib/models/resource-factory";
import { runAxe } from "./helpers/axe";

/**
 * Feature 102, Task 17 (FR-14): the Organizer folder card (name and subtype,
 * no notes preview, no child count). Real axe-core run plus keyboard use of
 * the card's native buttons.
 */
describe("a11y: OrganizerCard folder card", () => {
  it("with a subtype: zero axe violations", async () => {
    const folder = createFolderResource({ name: "Act One" });
    const { container } = render(
      <OrganizerCard
        resource={folder}
        folderSubtype="Act"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("without a subtype: zero axe violations", async () => {
    const folder = createFolderResource({ name: "Act Two" });
    const { container } = render(
      <OrganizerCard resource={folder} onSelect={vi.fn()} onOpen={vi.fn()} />,
    );
    await runAxe(container);
  });

  it("the folder's title is a native button operable with Enter", async () => {
    const onSelect = vi.fn();
    const folder = createFolderResource({ name: "Act One" });
    render(
      <OrganizerCard
        resource={folder}
        folderSubtype="Act"
        onSelect={onSelect}
      />,
    );
    const title = screen.getByRole("button", { name: "Act One" });
    expect(title.tagName).toBe("BUTTON");
    title.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
