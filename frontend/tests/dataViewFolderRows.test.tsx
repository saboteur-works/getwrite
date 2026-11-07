import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataView from "../components/WorkArea/DataView";
import { createTextResource } from "../src/lib/models/resource";

// Feature 102, Task 16 (FR-14): folder rows in the Data view.

describe("DataView folder rows (Feature 102 FR-14)", () => {
  const rows = [
    {
      id: "f1",
      name: "Part One",
      subtype: "Act",
      cells: [
        { key: "mood", label: "Mood", value: "tense" },
        { key: "arc", label: "Arc", value: "" },
      ],
    },
  ];
  it("a folder row shows name, subtype and the field columns, and no notes or child count", () => {
    render(<DataView folderRows={rows} />);
    const list = screen.getByRole("list", { name: "Folders" });
    expect(list.textContent).toContain("Part One");
    expect(list.textContent).toContain("Act");
    expect(list.textContent).toContain("Mood");
    expect(list.textContent).toContain("tense");
    expect(list.textContent).not.toMatch(/notes/i);
    expect(list.textContent).not.toMatch(/\bchild|\bitems?\b|\bwords\b/i);
  });

  it("renders the same output with empty folder props as without them", () => {
    const resources = [
      createTextResource({ name: "A1", plainText: "x", folderId: null } as any),
    ];
    const before = render(<DataView resources={resources} />);
    const beforeHtml = before.container.innerHTML;
    before.unmount();
    const withEmpty = render(
      <DataView resources={resources} folderRows={[]} />,
    );
    expect(withEmpty.container.innerHTML).toBe(beforeHtml);
    expect(screen.queryByRole("list", { name: "Folders" })).toBeNull();
  });

  it("shows a failure, not an empty folder list, when the folder read failed", () => {
    render(<DataView folderRows={[]} folderRowsError="sidecar unreadable" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "sidecar unreadable",
    );
    expect(screen.queryByRole("list", { name: "Folders" })).toBeNull();
  });

  it("shows a failure and no stale rows when the smart-folder evaluation failed", () => {
    const resources = [
      createTextResource({
        name: "StaleDoc",
        plainText: "x",
        folderId: null,
      } as any),
    ];
    render(
      <DataView
        resources={resources}
        folderRows={rows}
        evaluationError="Query evaluation failed."
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Query evaluation failed.",
    );
    expect(screen.queryByText("StaleDoc")).toBeNull();
    expect(screen.queryByText("Part One")).toBeNull();
  });

  it("calls onSelectFolder with the folder id when a row is activated", () => {
    const onSelectFolder = vi.fn();
    render(<DataView folderRows={rows} onSelectFolder={onSelectFolder} />);
    fireEvent.click(screen.getByRole("button", { name: /Part One/ }));
    expect(onSelectFolder).toHaveBeenCalledWith("f1");
  });
});
