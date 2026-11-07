import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataView from "../../components/WorkArea/DataView";
import { runAxe } from "./helpers/axe";

/**
 * Feature 102, Task 16 (FR-14): the Data view's folder rows and the failure
 * alerts added with them. Real axe-core run, plus the row's native button
 * and keyboard operation.
 */

const rows = [
  {
    id: "f1",
    name: "Part One",
    subtype: "Act",
    cells: [{ key: "mood", label: "Mood", value: "tense" }],
  },
  {
    id: "f2",
    name: "Part Two",
    subtype: undefined,
    cells: [{ key: "mood", label: "Mood", value: "" }],
  },
];

describe("a11y: DataView folder rows", () => {
  it("folder rows: zero axe violations", async () => {
    const { container } = render(
      <DataView folderRows={rows} onSelectFolder={vi.fn()} />,
    );
    await runAxe(container);
  });

  it("folder read failure alert: zero axe violations", async () => {
    const { container } = render(
      <DataView folderRowsError="sidecar unreadable" />,
    );
    await runAxe(container);
  });

  it("evaluation failure alert: zero axe violations", async () => {
    const { container } = render(
      <DataView evaluationError="Query evaluation failed." />,
    );
    await runAxe(container);
  });

  it("a folder row is a native button, named by the folder, operable with Enter", async () => {
    const onSelectFolder = vi.fn();
    render(<DataView folderRows={rows} onSelectFolder={onSelectFolder} />);
    const button = screen.getByRole("button", { name: /Part One/ });
    expect(button.tagName).toBe("BUTTON");
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelectFolder).toHaveBeenCalledWith("f1");
  });
});
